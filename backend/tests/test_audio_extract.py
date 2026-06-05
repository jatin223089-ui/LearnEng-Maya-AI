import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from server import extract_live_audio_bytes


class FakeInline:
    def __init__(self, data):
        self.data = data


class FakePart:
    def __init__(self, data):
        self.inline_data = FakeInline(data)


class FakeModelTurn:
    def __init__(self, parts):
        self.parts = parts


class FakeServerContent:
    def __init__(self, parts=None):
        self.model_turn = FakeModelTurn(parts or [])
        self.turn_complete = False


class FakeEvent:
    def __init__(self, parts=None, legacy=None):
        self.server_content = FakeServerContent(parts)
        self.data = legacy


def test_extract_prefers_model_turn_over_legacy():
    audio = b"\x01\x02"
    event = FakeEvent(parts=[FakePart(audio)], legacy=b"\x99\x99")
    assert extract_live_audio_bytes(event) == audio


def test_extract_legacy_when_no_model_turn():
    event = FakeEvent(parts=[], legacy=b"\xab\xcd")
    assert extract_live_audio_bytes(event) == b"\xab\xcd"


def test_extract_empty():
    event = FakeEvent(parts=[], legacy=None)
    assert extract_live_audio_bytes(event) == b""
