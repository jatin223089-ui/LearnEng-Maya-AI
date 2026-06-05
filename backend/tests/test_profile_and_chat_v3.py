"""Phase A tests: /auth/me streak+new fields, PUT /profile, /chat new fields (level_changed/new_level)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def fresh_user(s):
    email = f"test_profile_{uuid.uuid4().hex[:8]}@englearn.ai"
    r = s.post(f"{API}/auth/signup", json={"name": "ProfileTester", "email": email, "password": "pass1234"})
    assert r.status_code == 200, r.text
    return {"token": r.json()["token"], "email": email}


@pytest.fixture(scope="module")
def headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}"}


# ---------- /auth/me new fields + streak update ----------
def test_me_returns_new_profile_fields(s, headers):
    r = s.get(f"{API}/auth/me", headers=headers)
    assert r.status_code == 200
    body = r.json()
    # All Phase A profile fields present with sensible defaults
    for k in ("id", "name", "email", "level", "preferred_level", "streak", "minutes_practiced", "words_learned"):
        assert k in body, f"missing field {k} in /auth/me response"
    assert body["preferred_level"] == "Auto"
    assert isinstance(body["streak"], int)
    assert body["streak"] >= 1  # first call today sets streak >= 1
    assert isinstance(body["minutes_practiced"], int)
    assert isinstance(body["words_learned"], int)


def test_me_streak_idempotent_same_day(s, headers):
    """Calling /auth/me twice same day must keep streak unchanged (not increment)."""
    r1 = s.get(f"{API}/auth/me", headers=headers).json()
    r2 = s.get(f"{API}/auth/me", headers=headers).json()
    assert r1["streak"] == r2["streak"]


# ---------- PUT /profile ----------
def test_profile_update_name_and_level(s, headers):
    r = s.put(f"{API}/profile", json={"name": "Renamed Tester", "preferred_level": "Intermediate"}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Renamed Tester"
    assert body["preferred_level"] == "Intermediate"
    # Verify persistence via /auth/me
    me = s.get(f"{API}/auth/me", headers=headers).json()
    assert me["name"] == "Renamed Tester"
    assert me["preferred_level"] == "Intermediate"


def test_profile_rejects_invalid_level(s, headers):
    r = s.put(f"{API}/profile", json={"preferred_level": "Master"}, headers=headers)
    assert r.status_code == 400


def test_profile_accepts_each_valid_level(s, headers):
    for lvl in ("Auto", "Beginner", "Intermediate", "Advanced"):
        r = s.put(f"{API}/profile", json={"preferred_level": lvl}, headers=headers)
        assert r.status_code == 200, f"level {lvl} should be accepted"
        assert r.json()["preferred_level"] == lvl


def test_profile_unauth(s):
    r = s.put(f"{API}/profile", json={"name": "Nobody"})
    assert r.status_code == 401


# ---------- /chat new response shape ----------
def test_chat_response_has_level_changed_fields(s, headers):
    # Set preferred to Advanced so level changes vs prior Beginner
    s.put(f"{API}/profile", json={"preferred_level": "Advanced"}, headers=headers)
    # create a fresh session
    sess = s.post(f"{API}/sessions", json={"scenario_id": "free-talk"}, headers=headers)
    assert sess.status_code == 200
    sid = sess.json()["id"]

    r = s.post(
        f"{API}/chat",
        json={"session_id": sid, "text": "Hello Maya, how are you today?"},
        headers=headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # response shape: keep existing fields + new optional ones
    for k in ("id", "role", "text", "correction", "created_at"):
        assert k in data
    # New fields must be present in the response (level_changed bool; new_level may be None)
    assert "level_changed" in data
    assert isinstance(data["level_changed"], bool)
    assert "new_level" in data
    # When user just switched from Auto/Beginner to Advanced, level_changed should be True
    # (prior_level=Beginner, new stored=Advanced)
    assert data["level_changed"] is True
    assert data["new_level"] == "Advanced"

    # /auth/me should reflect Advanced and increment minutes_practiced
    me = s.get(f"{API}/auth/me", headers=headers).json()
    assert me["level"] == "Advanced"
    assert me["preferred_level"] == "Advanced"
    assert me["minutes_practiced"] >= 1


def test_chat_no_level_change_second_message(s, headers):
    """Second chat with same preferred_level should report level_changed=False."""
    sess = s.post(f"{API}/sessions", json={"scenario_id": "free-talk"}, headers=headers)
    sid = sess.json()["id"]
    r = s.post(f"{API}/chat", json={"session_id": sid, "text": "Tell me something interesting."},
               headers=headers, timeout=60)
    assert r.status_code == 200
    data = r.json()
    assert data["level_changed"] is False
    assert data["new_level"] is None
