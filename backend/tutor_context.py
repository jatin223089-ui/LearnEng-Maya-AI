"""Maya tutor context builders — learner memory, live system, adaptive pacing."""
from __future__ import annotations

import re
from typing import Optional

import store
from prompts.maya import (
    MAYA_LIVE_PROMPT,
    MAYA_TUTOR_PEDAGOGY,
    PROMPT_VERSION,
    few_shots_for_level,
    phase_instruction,
    session_goal_for_level,
)


def level_length_target(
    level: str,
    minutes: int,
    *,
    avg_user_words: Optional[float] = None,
) -> tuple[int, int]:
    """Gradually allow longer replies as the learner practices more."""
    base = {
        "Beginner": (10, 18),
        "Intermediate": (18, 32),
        "Advanced": (28, 50),
    }
    lo, hi = base.get(level, (10, 18))
    bonus = min(12, (minutes // 20) * 2)
    hi += bonus
    if avg_user_words is not None:
        if avg_user_words < 6:
            hi = min(hi, lo + 8)
        elif avg_user_words >= 18 and level != "Beginner":
            lo = min(lo + 4, hi - 4)
            hi = min(hi + 6, 60)
    return lo, hi


def format_history_block(history: list) -> str:
    if not history:
        return ""
    lines = []
    for m in history[-10:]:
        tag = "User" if m["role"] == "user" else "Maya"
        lines.append(f"{tag}: {m['text']}")
    return "RECENT CONVERSATION:\n" + "\n".join(lines)


def _words_from_corrections(corrections: list) -> list[str]:
    words = []
    for c in corrections[:20]:
        corr = c.get("correction") or {}
        for field in ("corrected", "original"):
            text = corr.get(field) or ""
            for w in re.findall(r"[A-Za-z']+", text):
                w = w.lower().strip("'")
                if len(w) >= 4 and w not in words:
                    words.append(w)
        if len(words) >= 4:
            break
    return words[:2]


async def build_learner_context(user_id: str, level: str) -> str:
    """Rich learner memory for live calls and sidecar prompts."""
    parts = [f"PROMPT_VERSION: {PROMPT_VERSION}"]

    patterns = await store.aggregate_correction_patterns(user_id, limit=3)
    if patterns:
        parts.append("RECURRING MISTAKES TO WATCH:")
        for p in patterns:
            parts.append(f"- {p}")

    corrections = await store.list_corrections(user_id)
    reuse = _words_from_corrections(corrections)
    recent_vocab = await store.get_recent_vocab_words(user_id, limit=2)
    for w in recent_vocab:
        if w not in reuse:
            reuse.append(w)
    reuse = reuse[:2]
    if reuse:
        parts.append(f"WORDS TO REUSE TODAY (naturally): {', '.join(reuse)}")

    summary = await store.get_last_session_summary(user_id)
    if summary:
        parts.append(f"LAST SESSION: {summary}")

    goal = session_goal_for_level(level, user_id)
    if goal:
        parts.append(f"TODAY'S GOAL: {goal}")

    if len(parts) <= 1:
        return ""
    return "LEARNER CONTEXT:\n" + "\n".join(parts[1:])


def build_live_system(
    scenario: dict,
    level: str,
    minutes: int,
    user_name: str,
    history: list,
    learner_context: str = "",
    *,
    maya_turn_count: int = 0,
    avg_user_words: Optional[float] = None,
    stuck_nudge: bool = False,
) -> str:
    lo, hi = level_length_target(level, minutes, avg_user_words=avg_user_words)
    scenario_lo, scenario_hi = lo, hi
    if scenario["id"] in ("cafe", "travel", "pronunciation-th"):
        scenario_hi = min(scenario_hi, 22)
    elif scenario["id"] == "debate":
        scenario_lo = max(scenario_lo, 20)

    adaptive = (
        f"\n\nADAPTIVE PACING: Keep spoken replies between {scenario_lo} and {scenario_hi} words. "
        "Short and natural for voice."
    )
    if avg_user_words is not None and avg_user_words >= 18:
        adaptive += " The learner speaks in longer sentences — you may use slightly richer vocabulary."

    parts = [
        MAYA_LIVE_PROMPT,
        MAYA_TUTOR_PEDAGOGY,
        few_shots_for_level(level),
        f"\n\nLEARNER: {user_name} ({level.upper()}, {minutes} min practiced)",
        adaptive,
    ]
    if learner_context:
        parts.append(f"\n\n{learner_context}")

    phase = phase_instruction(scenario, maya_turn_count)
    if phase:
        parts.append(f"\n\n{phase}")

    objectives = scenario.get("objectives")
    if objectives:
        parts.append("\n\nSESSION OBJECTIVES: " + "; ".join(objectives))

    parts.append(f"\n\nSCENARIO: {scenario['title']}\n{scenario['system_addon']}")

    hist = format_history_block(history)
    if hist:
        parts.append("\n\n" + hist)

    if stuck_nudge:
        parts.append(
            "\n\nSTUCK LEARNER: The learner gave very short replies. "
            "Offer ONE simple phrase they can repeat, then ask an easy question."
        )

    return "".join(parts)


def extract_vocab_words(text: str, level: str) -> list[str]:
    """Heuristic: pick 1-2 longer/non-common words as vocab spotlight."""
    common = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "must", "shall", "can", "need", "dare",
        "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
        "from", "as", "into", "through", "during", "before", "after", "above",
        "below", "between", "under", "again", "further", "then", "once", "here",
        "there", "when", "where", "why", "how", "all", "each", "few", "more",
        "most", "other", "some", "such", "no", "nor", "not", "only", "own",
        "same", "so", "than", "too", "very", "just", "and", "but", "if", "or",
        "because", "until", "while", "what", "which", "who", "whom", "this",
        "that", "these", "those", "am", "i", "you", "he", "she", "it", "we",
        "they", "me", "him", "her", "us", "them", "my", "your", "his", "its",
        "our", "their", "about", "like", "know", "think", "good", "great",
        "nice", "well", "really", "say", "said", "tell", "ask", "hey", "hi",
        "hello", "thanks", "thank", "please", "yes", "yeah", "okay", "ok",
        "maya", "today", "yesterday", "tomorrow",
    }
    min_len = 6 if level == "Beginner" else 5 if level == "Intermediate" else 4
    words = re.findall(r"[A-Za-z']+", text.lower())
    candidates = [w for w in words if len(w) >= min_len and w not in common]
    seen = set()
    out = []
    for w in candidates:
        if w not in seen:
            seen.add(w)
            out.append(w)
        if len(out) >= 2:
            break
    return out


async def avg_user_words_from_history(history: list) -> Optional[float]:
    user_texts = [m["text"] for m in history if m.get("role") == "user" and m.get("text")]
    if not user_texts:
        return None
    counts = [len(t.split()) for t in user_texts[-5:]]
    return sum(counts) / len(counts) if counts else None
