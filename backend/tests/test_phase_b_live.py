"""Phase B tests: pronunciation feedback endpoint + Gemini Live WS handshake + invalid token rejection."""
import os
import uuid
import asyncio
import json
import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


async def ws_connect_and_auth(url, token):
    ws = await websockets.connect(url, open_timeout=20, close_timeout=10, max_size=10_000_000)
    await ws.send(json.dumps({"type": "auth", "token": token}))
    return ws


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def auth(s):
    email = f"test_phaseb_{uuid.uuid4().hex[:8]}@englearn.ai"
    r = s.post(f"{API}/auth/signup", json={"name": "PhaseB", "email": email, "password": "pass1234"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "headers": {"Authorization": f"Bearer {data['token']}"}}


@pytest.fixture(scope="module")
def session_id(s, auth):
    r = s.post(f"{API}/sessions", json={"scenario_id": "free-talk"}, headers=auth["headers"])
    assert r.status_code == 200
    return r.json()["id"]


def test_health_endpoint(s):
    r = s.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "database_ok" in data
    assert "gemini_configured" in data


def test_pronunciation_shape(s, auth):
    r = s.post(
        f"{API}/pronunciation",
        json={"text": "I would like to schedule an appointment."},
        headers=auth["headers"],
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "word" in data
    assert "tip" in data and isinstance(data["tip"], str) and data["tip"].strip()
    assert "score" in data and isinstance(data["score"], int)
    assert 0 <= data["score"] <= 100


def test_pronunciation_requires_auth(s):
    r = s.post(f"{API}/pronunciation", json={"text": "hello"})
    assert r.status_code in (401, 403)


def test_ws_invalid_token_structured_error():
    async def run():
        url = f"{WS_BASE}/api/ws/maya/{uuid.uuid4()}"
        async with websockets.connect(url, open_timeout=15, close_timeout=10) as ws:
            await ws.send(json.dumps({"type": "auth", "token": "garbage"}))
            msg = await asyncio.wait_for(ws.recv(), timeout=15)
            data = json.loads(msg)
            assert data.get("type") == "error"
    asyncio.run(run())


def test_ws_valid_token_ready_or_error(auth, session_id):
    async def run():
        url = f"{WS_BASE}/api/ws/maya/{session_id}"
        ws = await ws_connect_and_auth(url, auth["token"])
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=30)
            if isinstance(msg, bytes):
                return
            data = json.loads(msg)
            assert data.get("type") in ("auth_ok", "error"), f"Unexpected first frame: {data}"
            if data.get("type") == "error":
                return
            await ws.send("__start_call__")
            msg2 = await asyncio.wait_for(ws.recv(), timeout=45)
            if isinstance(msg2, bytes):
                return
            data2 = json.loads(msg2)
            assert data2.get("type") in ("ready", "error"), f"Unexpected second frame: {data2}"
            if data2.get("type") == "ready":
                assert "gemini" in data2.get("model", "").lower()
        finally:
            await ws.close()
    asyncio.run(run())


def test_ws_unknown_session_structured_error(auth):
    async def run():
        url = f"{WS_BASE}/api/ws/maya/{uuid.uuid4()}"
        ws = await ws_connect_and_auth(url, auth["token"])
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=20)
            data = json.loads(msg)
            assert data.get("type") == "error"
            assert "session" in data.get("message", "").lower() or "not found" in data.get("message", "").lower()
        finally:
            await ws.close()
    asyncio.run(run())
