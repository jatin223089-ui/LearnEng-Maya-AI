"""Tests for Maya Live context builders and helpers."""
import asyncio
from unittest.mock import AsyncMock, patch

import server
from prompts.maya import MAYA_TUTOR_PEDAGOGY, SCENARIOS
from tutor_context import build_learner_context, build_live_system


def test_build_live_system_includes_pedagogy():
    scenario = server.scenario_for("free-talk")
    prompt = build_live_system(scenario, "Beginner", 10, "Alex", [])
    assert "TUTOR PEDAGOGY" in prompt
    assert "ONE-ERROR RULE" in prompt
    assert "RECAST IN SPEECH" in prompt
    assert "[CORRECTION]" not in prompt
    assert "do NOT mention corrections" in prompt
    assert "Alex" in prompt
    assert "Free Talk" in prompt
    assert "EXAMPLE STYLE (Beginner" in prompt


def test_build_live_system_includes_phase_and_objectives():
    scenario = server.scenario_for("past-tense-practice")
    prompt = build_live_system(scenario, "Beginner", 0, "Sam", [], maya_turn_count=0)
    assert "PHASE (warmup)" in prompt
    assert "SESSION OBJECTIVES" in prompt
    assert "past tense" in prompt.lower()


def test_build_live_system_wrapup_phase():
    scenario = server.scenario_for("cafe")
    prompt = build_live_system(scenario, "Beginner", 0, "Sam", [], maya_turn_count=8)
    assert "PHASE (wrapup)" in prompt


def test_format_history_block():
    history = [
        {"role": "user", "text": "Hello"},
        {"role": "assistant", "text": "Hi there!"},
    ]
    block = server.format_history_block(history)
    assert "RECENT CONVERSATION" in block
    assert "User: Hello" in block
    assert "Maya: Hi there!" in block


def test_format_history_block_empty():
    assert server.format_history_block([]) == ""


def test_extract_vocab_words():
    text = "That is a magnificent opportunity for improvement."
    words = server.extract_vocab_words(text, "Intermediate")
    assert isinstance(words, list)
    assert "magnificent" in words or "opportunity" in words


def test_build_live_config_ptt_disables_vad():
    cfg = server.build_live_config("test", "Kore", ptt_mode=True)
    assert cfg["realtime_input_config"]["automatic_activity_detection"]["disabled"] is True


def test_build_live_config_handsfree_has_barge_in():
    cfg = server.build_live_config("test", "Kore", ptt_mode=False)
    assert cfg["realtime_input_config"]["activity_handling"] == "START_OF_ACTIVITY_INTERRUPTS"
    assert "context_window_compression" in cfg


def test_scenarios_have_voice_and_phases():
    for s in SCENARIOS:
        assert "voice" in s
        assert s["voice"]
        assert "phases" in s


def test_maya_tutor_pedagogy_constant():
    assert "ACKNOWLEDGE THEN EXTEND" in MAYA_TUTOR_PEDAGOGY


def test_build_learner_context_with_patterns():
    async def _run():
        with patch("store.aggregate_correction_patterns", new_callable=AsyncMock) as mock_patterns, \
             patch("store.list_corrections", new_callable=AsyncMock) as mock_corr, \
             patch("store.get_recent_vocab_words", new_callable=AsyncMock) as mock_vocab, \
             patch("store.get_last_session_summary", new_callable=AsyncMock) as mock_summary:
            mock_patterns.return_value = ["past tense errors", "article mistakes"]
            mock_corr.return_value = [
                {"correction": {"corrected": "I went to the store", "tip": "Use went for past"}},
            ]
            mock_vocab.return_value = ["magnificent"]
            mock_summary.return_value = "Practiced cafe ordering"
            ctx = await build_learner_context("user-1", "Intermediate")
            assert "LEARNER CONTEXT" in ctx
            assert "RECURRING MISTAKES" in ctx
            assert "past tense errors" in ctx
            assert "WORDS TO REUSE" in ctx
            assert "LAST SESSION" in ctx
            assert "TODAY'S GOAL" in ctx
    asyncio.run(_run())


def test_build_learner_context_empty_for_new_user():
    async def _run():
        with patch("store.aggregate_correction_patterns", new_callable=AsyncMock) as mock_patterns, \
             patch("store.list_corrections", new_callable=AsyncMock) as mock_corr, \
             patch("store.get_recent_vocab_words", new_callable=AsyncMock) as mock_vocab, \
             patch("store.get_last_session_summary", new_callable=AsyncMock) as mock_summary:
            mock_patterns.return_value = []
            mock_corr.return_value = []
            mock_vocab.return_value = []
            mock_summary.return_value = ""
            ctx = await build_learner_context("new-user", "Beginner")
            assert "TODAY'S GOAL" in ctx
            assert "RECURRING MISTAKES" not in ctx
    asyncio.run(_run())


def test_new_scenarios_exist():
    ids = {s["id"] for s in SCENARIOS}
    for sid in ("daily-small-talk", "past-tense-practice", "workplace-email-talk", "pronunciation-th"):
        assert sid in ids
