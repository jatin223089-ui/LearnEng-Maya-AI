"""User preferences — defaults, validation, and Maya prompt augmentation."""
from __future__ import annotations

import json
import os
from typing import Any, Optional

DEFAULT_SETTINGS: dict[str, Any] = {
    "default_call_mode": "handsfree",
    "speaking_pace": "normal",
    "scenario_voice_override": True,
    "correction_style": "balanced",
    "pronunciation_tips": True,
    "vocabulary_focus": "general",
    "session_length": "standard",
    "roleplay_strictness": "strict",
    "native_language": None,
    "explain_in_native_when_stuck": False,
    "daily_practice_minutes": 10,
    "reminder_time": None,
    "preferred_scenario_id": "free-talk",
    "show_live_captions": True,
    "show_coach_panel": True,
    "caption_size": "medium",
    "mic_sensitivity": "normal",
    "playback_volume": 1.0,
    "reduce_motion": False,
    "high_contrast": False,
    "dark_mode": False,
    "keyboard_shortcuts_enabled": True,
    "low_bandwidth_mode": False,
}

NATIVE_LANGUAGES = [
    {"code": None, "label": "Off"},
    {"code": "es", "label": "Spanish"},
    {"code": "fr", "label": "French"},
    {"code": "de", "label": "German"},
    {"code": "pt", "label": "Portuguese"},
    {"code": "hi", "label": "Hindi"},
    {"code": "zh", "label": "Chinese"},
    {"code": "ja", "label": "Japanese"},
    {"code": "ko", "label": "Korean"},
    {"code": "ar", "label": "Arabic"},
]

VOCABULARY_FOCUS_OPTIONS = [
    {"id": "general", "label": "General", "description": "Balanced everyday English"},
    {"id": "business", "label": "Business", "description": "Meetings, emails, professional tone"},
    {"id": "travel", "label": "Travel", "description": "Airports, hotels, directions"},
    {"id": "exam", "label": "Exam prep", "description": "Structured grammar and formal phrases"},
    {"id": "casual", "label": "Casual chat", "description": "Friends, hobbies, small talk"},
]

SESSION_LENGTH_TURNS = {"short": 8, "standard": 15}

ALLOWED_KEYS = {
    "default_call_mode": {"handsfree", "ptt"},
    "speaking_pace": {"slow", "normal", "fast"},
    "correction_style": {"gentle", "balanced", "detailed"},
    "vocabulary_focus": {o["id"] for o in VOCABULARY_FOCUS_OPTIONS},
    "session_length": {"short", "standard"},
    "roleplay_strictness": {"strict", "flexible"},
    "caption_size": {"small", "medium", "large"},
    "mic_sensitivity": {"low", "normal", "high"},
    "daily_practice_minutes": {5, 10, 15},
}

BOOL_KEYS = {
    "scenario_voice_override",
    "pronunciation_tips",
    "explain_in_native_when_stuck",
    "show_live_captions",
    "show_coach_panel",
    "reduce_motion",
    "high_contrast",
    "dark_mode",
    "keyboard_shortcuts_enabled",
    "low_bandwidth_mode",
}


def _coerce_settings(raw: Any) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return {}
    return raw if isinstance(raw, dict) else {}


def get_user_settings(user: dict) -> dict:
    merged = {**DEFAULT_SETTINGS, **_coerce_settings(user.get("settings"))}
    if user.get("preferred_level"):
        merged["preferred_level"] = user["preferred_level"]
    if user.get("maya_voice"):
        merged["maya_voice"] = user["maya_voice"]
    return merged


def validate_settings_patch(patch: dict) -> dict:
    """Return sanitized partial settings update."""
    out: dict[str, Any] = {}
    for key, val in patch.items():
        if key in BOOL_KEYS:
            out[key] = bool(val)
        elif key == "playback_volume":
            try:
                out[key] = max(0.0, min(1.0, float(val)))
            except (TypeError, ValueError):
                pass
        elif key == "reminder_time":
            if val is None or val == "":
                out[key] = None
            elif isinstance(val, str) and len(val) <= 8:
                out[key] = val.strip()
        elif key == "daily_practice_minutes":
            try:
                val = int(val)
            except (TypeError, ValueError):
                continue
            if val in ALLOWED_KEYS["daily_practice_minutes"]:
                out[key] = val
        elif key == "native_language":
            codes = {x["code"] for x in NATIVE_LANGUAGES}
            if val in codes or val is None:
                out[key] = val
        elif key == "preferred_scenario_id":
            if isinstance(val, str) and val.strip():
                out[key] = val.strip()
        elif key in ALLOWED_KEYS:
            allowed = ALLOWED_KEYS[key]
            if val in allowed:
                out[key] = val
        elif key in DEFAULT_SETTINGS:
            out[key] = val
    return out


def resolve_maya_voice(user: dict, scenario: dict) -> str:
    settings = get_user_settings(user)
    env_default = os.environ.get("MAYA_VOICE", "Kore").strip()
    user_voice = user.get("maya_voice") or env_default
    scenario_voice = scenario.get("voice")
    if settings.get("scenario_voice_override", True):
        return user_voice or scenario_voice or env_default
    return scenario_voice or user_voice or env_default


def resolve_call_mode(user: dict, query_mode: str) -> bool:
    """Return True for push-to-talk."""
    q = (query_mode or "").lower()
    if q in ("ptt", "push", "chat"):
        return True
    if q in ("handsfree", "hands-free", "voice"):
        return False
    settings = get_user_settings(user)
    return settings.get("default_call_mode") == "ptt"


def should_fetch_correction(settings: dict) -> bool:
    style = settings.get("correction_style", "balanced")
    if style == "gentle":
        return False
    return True


def should_fetch_pronunciation(settings: dict) -> bool:
    return bool(settings.get("pronunciation_tips", True))


def correction_prompt_suffix(style: str) -> str:
    if style == "detailed":
        return "\nBe thorough but still pick only ONE primary mistake."
    if style == "gentle":
        return "\nOnly flag obvious errors. Ignore minor slips."
    return ""


def augment_live_system(system_inst: str, user: dict, scenario: dict, effective_level: str) -> str:
    settings = get_user_settings(user)
    parts = [system_inst]

    pace = settings.get("speaking_pace", "normal")
    if pace == "slow":
        parts.append(
            "\n\nSPEAKING PACE: Speak slowly and clearly. Use very short sentences."
        )
    elif pace == "fast":
        parts.append(
            "\n\nSPEAKING PACE: Keep a lively, natural pace with slightly longer replies when appropriate."
        )

    focus = settings.get("vocabulary_focus", "general")
    focus_labels = {o["id"]: o["label"] for o in VOCABULARY_FOCUS_OPTIONS}
    if focus != "general":
        parts.append(
            f"\n\nVOCABULARY FOCUS: Prefer {focus_labels.get(focus, focus)} vocabulary when natural."
        )

    if settings.get("roleplay_strictness") == "flexible" and scenario.get("skill_focus"):
        parts.append(
            "\n\nROLEPLAY: Stay in character, but you may briefly explain tricky words in simple English if the learner seems lost."
        )
    elif settings.get("roleplay_strictness") == "strict" and scenario.get("skill_focus"):
        parts.append("\n\nROLEPLAY: Stay fully in character. Do not break roleplay to explain.")

    lang = settings.get("native_language")
    if settings.get("explain_in_native_when_stuck") and lang:
        lang_name = next(
            (x["label"] for x in NATIVE_LANGUAGES if x["code"] == lang),
            lang,
        )
        parts.append(
            f"\n\nNATIVE LANGUAGE SUPPORT: If the learner is clearly stuck, you may offer ONE short hint in {lang_name}, "
            "then return to English."
        )

    length = settings.get("session_length", "standard")
    max_turns = SESSION_LENGTH_TURNS.get(length, 15)
    parts.append(
        f"\n\nSESSION LENGTH: Aim to wrap up naturally after about {max_turns} learner turns with a short encouraging summary."
    )

    return "".join(parts)


def apply_speaking_pace_to_word_bounds(lo: int, hi: int, settings: dict) -> tuple[int, int]:
    pace = settings.get("speaking_pace", "normal")
    if pace == "slow":
        return max(6, int(lo * 0.75)), max(lo + 4, int(hi * 0.8))
    if pace == "fast":
        return lo, min(70, int(hi * 1.2))
    return lo, hi
