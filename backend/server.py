from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import asyncio
import base64
import contextlib
import logging
import uuid
import re
import json as jsonlib
import jwt
import bcrypt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta, date

from emergentintegrations.llm.chat import LlmChat, QuotaExceededError, UserMessage
import store
from prompts.maya import (
    MAYA_SYSTEM_PROMPT,
    MAYA_VOICES,
    MAYA_VOICE_IDS,
    PROMPT_VERSION,
    SCENARIOS,
    daily_mission_for_user,
    phase_instruction,
)
from tutor_context import (
    avg_user_words_from_history,
    build_learner_context,
    build_live_system,
    extract_vocab_words,
    format_history_block,
    level_length_target,
)

# Gemini Live (Google AI Studio direct, requires user-provided GOOGLE_API_KEY)
try:
    from google import genai as google_genai
    GOOGLE_GENAI_AVAILABLE = True
except ImportError:
    GOOGLE_GENAI_AVAILABLE = False

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", GOOGLE_API_KEY)
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALGORITHM = "HS256"
JWT_EXP_DAYS = 30

# Gemini 3 Flash is fast & ideal for real-time conversational tutoring (classic mode)
LLM_PROVIDER = "gemini"
LLM_MODEL = os.environ.get("LLM_MODEL", "gemini-2.0-flash")
# Gemini Live native audio (Gemini 3 Flash Live, requires GOOGLE_API_KEY)
LIVE_MODEL = os.environ.get(
    "LIVE_MODEL",
    "gemini-3.1-flash-live-preview",
)

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    if GOOGLE_API_KEY and not _is_valid_google_api_key(GOOGLE_API_KEY):
        logger.warning(
            "GOOGLE_API_KEY does not look like a Google AI Studio key (expected AIzaSy... or AQ....). "
            "Gemini Live may fail until you replace it."
        )
    elif not GOOGLE_API_KEY:
        logger.warning("GOOGLE_API_KEY is missing — Maya voice and hints will not work.")
    backend = await store.init_store()
    if backend == "none":
        logger.error(
            "No database available. Set DATABASE_URL (Supabase Postgres) or MONGO_URL in backend/.env"
        )
    task = asyncio.create_task(streak_reset_loop())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task

app = FastAPI(title="EngLearn.ai API", lifespan=lifespan)
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("englearn")

# ============== MODELS ==============
class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserPublic(BaseModel):
    id: str
    name: str
    email: str
    level: str = "Beginner"
    preferred_level: str = "Auto"
    maya_voice: str = "Kore"
    streak: int = 0
    minutes_practiced: int = 0
    words_learned: int = 0

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    preferred_level: Optional[str] = None
    maya_voice: Optional[str] = None

class AuthResponse(BaseModel):
    token: str
    user: UserPublic

class ChatMessageIn(BaseModel):
    session_id: str
    text: str

class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    text: str
    correction: Optional[dict] = None
    created_at: str
    level_changed: Optional[bool] = False
    new_level: Optional[str] = None

class ChatSessionCreate(BaseModel):
    scenario_id: str = "free-talk"
    title: Optional[str] = None

class ChatSession(BaseModel):
    id: str
    user_id: str
    scenario_id: str
    title: str
    created_at: str

class HintRequest(BaseModel):
    session_id: str
    live_transcript: Optional[List[dict]] = None
    last_correction: Optional[dict] = None
    last_user_text: Optional[str] = None

# ============== AUTH HELPERS ==============
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await store.find_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def public_user(u: dict) -> UserPublic:
    return UserPublic(
        id=u["id"], name=u["name"], email=u["email"],
        level=u.get("level", "Beginner"),
        preferred_level=u.get("preferred_level", "Auto"),
        maya_voice=u.get("maya_voice", "Kore"),
        streak=u.get("streak", 0),
        minutes_practiced=u.get("minutes_practiced", 0),
        words_learned=u.get("words_learned", 0),
    )

async def update_streak(user: dict) -> dict:
    """Returns the updated user document with new streak/last_active_date."""
    today = datetime.now(timezone.utc).date().isoformat()
    last = user.get("last_active_date")
    current_streak = user.get("streak", 1)
    if last == today:
        return user  # already counted today
    new_streak = 1
    if last:
        try:
            last_d = date.fromisoformat(last)
            delta = (datetime.now(timezone.utc).date() - last_d).days
            if delta == 1:
                new_streak = current_streak + 1
            elif delta == 0:
                new_streak = current_streak
            else:
                new_streak = 1
        except Exception:
            new_streak = 1
    await store.update_user(user["id"], {"last_active_date": today, "streak": new_streak})
    user["last_active_date"] = today
    user["streak"] = new_streak
    return user

# ============== HELPERS ==============
def parse_correction(text: str):
    m = re.search(r"\[CORRECTION\](.*?)\[/CORRECTION\]", text, re.DOTALL)
    if not m:
        return text.strip(), None
    block = m.group(1)
    clean = re.sub(r"\[CORRECTION\].*?\[/CORRECTION\]", "", text, flags=re.DOTALL).strip()
    def grab(key):
        mm = re.search(rf'{key}:\s*"(.+?)"', block, re.DOTALL)
        return mm.group(1).strip() if mm else None
    correction = {"original": grab("original"), "corrected": grab("corrected"), "tip": grab("tip")}
    if not correction["corrected"]:
        return clean, None
    return clean, correction

def scenario_for(scenario_id: str) -> dict:
    return next((s for s in SCENARIOS if s["id"] == scenario_id), SCENARIOS[0])

def compute_level(minutes: int, streak: int) -> str:
    if minutes >= 180 or streak >= 21:
        return "Advanced"
    if minutes >= 45 or streak >= 5:
        return "Intermediate"
    return "Beginner"

def build_system(scenario: dict, level: str = "Beginner", minutes: int = 0) -> str:
    lo, hi = level_length_target(level, minutes)
    adaptive = (
        f"\n\nADAPTIVE PACING: The learner is at {level.upper()} level with {minutes} minutes practiced. "
        f"Keep replies between {lo} and {hi} words this session. "
        "As they do well, use slightly longer sentences and one richer word; if they struggle, shorten and simplify."
    )
    return (
        MAYA_SYSTEM_PROMPT
        + f"\n\nUSER LEVEL: {level.upper()} ({minutes} minutes practiced so far)"
        + adaptive
        + "\n\nSCENARIO: " + scenario["title"] + "\n" + scenario["system_addon"]
    )


def build_history_prompt(history: list, latest: str) -> str:
    """Format prior turns + latest user text into a single prompt."""
    convo = []
    for m in history[-10:]:
        tag = "User" if m["role"] == "user" else "Maya"
        convo.append(f"{tag}: {m['text']}")
    convo_str = "\n".join(convo)
    if convo_str:
        return f"Recent conversation:\n{convo_str}\n\nUser just said: {latest}\n\nReply as Maya."
    return latest


def build_live_config(system_inst: str, maya_voice: str, ptt_mode: bool) -> dict:
    cfg = {
        "response_modalities": ["AUDIO"],
        "output_audio_transcription": {},
        "input_audio_transcription": {},
        "system_instruction": {"parts": [{"text": system_inst}]},
        "speech_config": {
            "voice_config": {
                "prebuilt_voice_config": {"voice_name": maya_voice},
            },
            "language_code": "en-US",
        },
        "context_window_compression": {
            "trigger_tokens": 25600,
            "sliding_window": {"target_tokens": 12800},
        },
    }
    if ptt_mode:
        cfg["realtime_input_config"] = {
            "automatic_activity_detection": {"disabled": True},
        }
    else:
        # Handsfree: client VAD sends __end_turn__ → activityEnd on Gemini.
        cfg["realtime_input_config"] = {
            "automatic_activity_detection": {"disabled": True},
            "activity_handling": "START_OF_ACTIVITY_INTERRUPTS",
        }
    return cfg


def _is_valid_google_api_key(key: str) -> bool:
    return key.startswith("AIza") or key.startswith("AQ.")


def _google_key_error_message(key: str | None = None) -> str:
    k = (key if key is not None else GOOGLE_API_KEY).strip()
    if not k:
        return "Gemini Live not configured. Add GOOGLE_API_KEY to backend/.env"
    if not _is_valid_google_api_key(k):
        return (
            "Invalid GOOGLE_API_KEY format. Use a Google AI Studio key from "
            "https://aistudio.google.com/apikey (starts with AIzaSy or AQ.)."
        )
    return ""


def _friendly_gemini_error(exc: Exception) -> str:
    msg = str(exc).lower()
    if any(
        token in msg
        for token in (
            "getaddrinfo",
            "11001",
            "name or service not known",
            "nodename nor servname",
            "temporary failure in name resolution",
            "network is unreachable",
            "connection refused",
        )
    ):
        return (
            "Cannot reach the voice service. Check your internet connection, ensure "
            "REACT_APP_BACKEND_URL in frontend/.env points to your local backend "
            "(http://127.0.0.1:8000), restart the frontend, then try again."
        )
    if any(
        token in msg
        for token in (
            "invalid authentication",
            "oauth",
            "unauthenticated",
            "api key not valid",
            "permission denied",
            "401",
            "403",
        )
    ):
        return (
            "Gemini rejected the API key. Verify GOOGLE_API_KEY in backend/.env "
            "(AI Studio key: AIzaSy... or AQ....), enable the Generative Language API, "
            "then restart the backend."
        )
    return str(exc)


def _live_models_to_try(preferred: str) -> list[str]:
    candidates = [
        preferred.strip(),
        "gemini-3.1-flash-live-preview",
        "gemini-2.5-flash-native-audio-preview-12-2025",
    ]
    out: list[str] = []
    for m in candidates:
        if m and m not in out:
            out.append(m)
    return out


def extract_live_audio_bytes(event) -> bytes:
    """Pull PCM audio from a Gemini Live server event (SDK puts it on model_turn parts)."""
    chunks: list[bytes] = []
    sc = getattr(event, "server_content", None)
    if sc:
        model_turn = getattr(sc, "model_turn", None)
        if model_turn:
            for part in getattr(model_turn, "parts", None) or []:
                inline = getattr(part, "inline_data", None)
                if inline and getattr(inline, "data", None):
                    data = inline.data
                    if isinstance(data, str):
                        chunks.append(base64.b64decode(data))
                    elif isinstance(data, (bytes, bytearray)):
                        chunks.append(bytes(data))
    if chunks:
        return b"".join(chunks)
    # Legacy SDK field (older samples) — only if model_turn had no audio
    legacy = getattr(event, "data", None)
    if legacy:
        return legacy if isinstance(legacy, bytes) else bytes(legacy)
    return b""


async def persist_user_message(session_id: str, text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    msg_id = str(uuid.uuid4())
    await store.insert_message({
        "id": msg_id,
        "session_id": session_id,
        "role": "user",
        "text": text,
        "correction": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return msg_id


async def persist_assistant_message(
    session_id: str,
    text: str,
    *,
    update_opener: bool = False,
    vocab: Optional[list] = None,
) -> str:
    """Save Maya's reply; on first live turn, refresh the seeded opener instead of duplicating."""
    if update_opener:
        opener = await store.find_first_assistant_message(session_id)
        if opener:
            await store.update_message_text(opener["id"], text)
            if vocab:
                await store.update_message_vocab(opener["id"], vocab)
            return opener["id"]
    msg_id = str(uuid.uuid4())
    await store.insert_message({
        "id": msg_id,
        "session_id": session_id,
        "role": "assistant",
        "text": text,
        "correction": None,
        "vocab": vocab or [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return msg_id


async def fetch_pronunciation_feedback(
    user_text: str,
    *,
    skill_focus: Optional[str] = None,
) -> Optional[dict]:
    """Pronunciation tip for a spoken user utterance."""
    focus_line = ""
    if skill_focus == "pronunciation_th":
        focus_line = (
            "\nFocus on the 'th' sound (think, thing, three, weather). "
            "Score how well they likely pronounced th words."
        )
    prompt = f"""You are an English-pronunciation coach. The learner just said this (transcribed):

"{user_text}"
{focus_line}

Give ONE short, actionable pronunciation tip (max 25 words) about the WORD most likely to be tricky. Reply with JSON ONLY:
{{"word": "<the word>", "tip": "<tip>", "score": <0-100 fluency score guess>}}"""
    try:
        chat_client = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id="pron-" + str(uuid.uuid4()),
            system_message="You are a concise English pronunciation coach. Reply with JSON only.",
        ).with_model(LLM_PROVIDER, LLM_MODEL)
        raw = await chat_client.send_message(UserMessage(text=prompt))
    except Exception as exc:
        logger.warning("Pronunciation skipped: %s", exc)
        return None
    m = re.search(r"\{.*\}", raw or "", re.DOTALL)
    if not m:
        return {"word": None, "tip": "Speak slowly and clearly.", "score": 80}
    try:
        data = jsonlib.loads(m.group(0))
        return {
            "word": data.get("word"),
            "tip": data.get("tip", "Speak slowly and clearly."),
            "score": int(data.get("score", 80)),
        }
    except Exception:
        return {"word": None, "tip": "Speak slowly and clearly.", "score": 80}


async def fetch_live_correction(
    user_text: str,
    scenario_title: str,
    *,
    learner_context: str = "",
    level: str = "Beginner",
) -> Optional[dict]:
    """Extract grammar correction for a spoken user turn via Gemini text API."""
    context_block = f"\n\nLearner profile:\n{learner_context}" if learner_context else ""
    prompt = f"""The learner is practicing English in a "{scenario_title}" conversation with Maya.
Level: {level}
They just said: "{user_text}"
{context_block}

ERROR BUDGET: If there are multiple mistakes, pick the MOST important one only.

If there is a clear grammar or vocabulary mistake, reply with JSON ONLY:
{{"original": "<exact user sentence>", "corrected": "<fixed version>", "tip": "<one short friendly tip>"}}

If the sentence is fine, reply with exactly: null"""
    try:
        chat_client = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id="live-correction-" + str(uuid.uuid4()),
            system_message="You are a concise English tutor. Reply with JSON or null only. One error max.",
        ).with_model(LLM_PROVIDER, LLM_MODEL)
        raw = await chat_client.send_message(UserMessage(text=prompt))
    except Exception as exc:
        logger.warning("Live correction skipped: %s", exc)
        return None
    raw = (raw or "").strip()
    if raw.lower() in ("null", "none", ""):
        return None
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        return None
    try:
        data = jsonlib.loads(m.group(0))
        if data and data.get("corrected"):
            return {
                "original": data.get("original") or user_text,
                "corrected": data["corrected"],
                "tip": data.get("tip", ""),
            }
    except Exception:
        pass
    return None


def improvement_summary(
    correction: Optional[dict],
    pronunciation: Optional[dict] = None,
) -> str:
    """One-line coach note: what to improve or encouragement."""
    if correction:
        tip = (correction.get("tip") or "").strip()
        if tip:
            return tip
        corrected = (correction.get("corrected") or "").strip()
        if corrected:
            return f'Try saying: "{corrected}"'
    if pronunciation:
        tip = (pronunciation.get("tip") or "").strip()
        if tip:
            word = pronunciation.get("word")
            if word:
                return f'Pronunciation — {word}: {tip}'
            return tip
    return "Good effort! Pick one of the reply options below to continue."


def coaching_fallback_suggestions(
    correction: Optional[dict],
    last_maya: str,
    user_text: str = "",
) -> list[str]:
    """Offline-safe reply options when the hint LLM is unavailable."""
    if correction and correction.get("corrected"):
        corrected = correction["corrected"].strip()
        original = (correction.get("original") or user_text or "").strip()
        opts = [corrected]
        if last_maya:
            opts.append(f"I see. {corrected}")
        if original and original.lower() != corrected.lower():
            opts.append(f"Sorry, I meant: {corrected}")
        while len(opts) < 3:
            opts.append("That sounds good. Can you tell me more?")
        return opts[:3]
    if last_maya:
        return [
            "That's a great question. Let me think…",
            "I agree with you on that.",
            "Could you tell me more about that?",
        ]
    return [
        "That sounds good. Can you tell me more?",
        "I agree. What do you think about that?",
        "Interesting! How did that make you feel?",
    ]


async def fetch_reply_suggestions(
    scenario: dict,
    last_maya: str,
    *,
    user_text: str = "",
    correction: Optional[dict] = None,
    learner_context: str = "",
    live_transcript: Optional[list] = None,
    history: Optional[list] = None,
) -> tuple[str, list[str]]:
    """Coach line + 3 spoken reply options for the learner."""
    improvement = improvement_summary(correction, None)
    fallback = coaching_fallback_suggestions(correction, last_maya, user_text)

    if live_transcript:
        convo = "\n".join(
            [("User: " if ln.get("role") == "user" else "Maya: ") + ln.get("text", "")
             for ln in live_transcript[-8:]]
        )
    elif history:
        convo = "\n".join(
            [("User: " if m["role"] == "user" else "Maya: ") + m["text"] for m in history[-6:]]
        )
    else:
        convo = ""

    correction_block = ""
    if correction:
        correction_block = f"""
The learner just said: "{user_text or correction.get('original', '')}"
Better version: "{correction.get('corrected', '')}"
Tip: {correction.get('tip', '')}
Include at least one suggestion that uses the corrected form naturally."""

    hint_prompt = f"""You are an English coach helping a learner on a live voice call with Maya ({scenario['title']}).

Scenario: {scenario.get('description', '')}
{f'Learner context:{chr(10)}{learner_context}' if learner_context else ''}
{correction_block}

Recent transcript:
{convo}

Maya's last line: "{last_maya}"

Suggest 3 SHORT spoken replies the learner could say next (natural for voice, easy to read aloud).
If they made a mistake, one option should model the corrected English.
Return ONLY a JSON array of 3 strings."""

    try:
        chat_client = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id="coach-" + str(uuid.uuid4()),
            system_message="You generate concise English reply suggestions for a language learner. Reply with JSON only.",
        ).with_model(LLM_PROVIDER, LLM_MODEL)
        raw = await chat_client.send_message(UserMessage(text=hint_prompt))
        m = re.search(r"\[.*\]", raw or "", re.DOTALL)
        if m:
            arr = jsonlib.loads(m.group(0))
            suggestions = [str(x).strip() for x in arr if str(x).strip()][:3]
            if suggestions:
                return improvement, suggestions
    except Exception as exc:
        logger.warning("Reply suggestions skipped: %s", exc)

    return improvement, fallback


async def ask_maya(scenario: dict, session_id: str, prompt: str, level: str = "Beginner", minutes: int = 0) -> str:
    chat_client = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=build_system(scenario, level, minutes),
    ).with_model(LLM_PROVIDER, LLM_MODEL)
    return await chat_client.send_message(UserMessage(text=prompt))

# ============== ROUTES ==============
@api.get("/")
async def root():
    return {"app": "EngLearn.ai", "tutor": "Maya", "model": f"{LLM_PROVIDER}/{LLM_MODEL}", "status": "ready"}

@api.get("/scenarios")
async def list_scenarios():
    return [{k: v for k, v in s.items() if k not in ("system_addon", "opener")} for s in SCENARIOS]


@api.get("/daily-mission")
async def daily_mission(user: dict = Depends(get_current_user)):
    mission = daily_mission_for_user(user["id"], user.get("last_mission_date"))
    return mission


@api.post("/daily-mission/start", response_model=ChatSession)
async def start_daily_mission(user: dict = Depends(get_current_user)):
    mission = daily_mission_for_user(user["id"], user.get("last_mission_date"))
    scenario = scenario_for(mission["scenario_id"])
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "user_id": user["id"],
        "scenario_id": scenario["id"],
        "title": f"Daily mission — {scenario['title']}",
        "opener_seeded": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await store.insert_session(doc)
    opener = {
        "id": str(uuid.uuid4()),
        "session_id": sid,
        "role": "assistant",
        "text": scenario["opener"],
        "correction": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await store.seed_opener_if_needed(sid, opener)
    await store.update_user(user["id"], {"last_mission_date": date.today().isoformat()})
    return ChatSession(**doc)

@api.post("/auth/signup", response_model=AuthResponse)
async def signup(payload: UserSignup):
    existing = await store.find_user_by_email(payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "level": "Beginner",
        "preferred_level": "Auto",
        "maya_voice": "Kore",
        "streak": 1,
        "minutes_practiced": 0,
        "words_learned": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await store.insert_user(doc)
    return AuthResponse(token=create_token(user_id), user=public_user(doc))

@api.post("/auth/login", response_model=AuthResponse)
async def login(payload: UserLogin):
    user = await store.find_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthResponse(token=create_token(user["id"]), user=public_user(user))

@api.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    user = await update_streak(user)
    return public_user(user)

@api.put("/profile", response_model=UserPublic)
async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    update = {}
    if payload.name is not None and payload.name.strip():
        update["name"] = payload.name.strip()
    if payload.preferred_level is not None:
        if payload.preferred_level not in ("Auto", "Beginner", "Intermediate", "Advanced"):
            raise HTTPException(status_code=400, detail="Invalid preferred_level")
        update["preferred_level"] = payload.preferred_level
    if payload.maya_voice is not None:
        if payload.maya_voice not in MAYA_VOICE_IDS:
            raise HTTPException(status_code=400, detail="Invalid maya_voice")
        update["maya_voice"] = payload.maya_voice
    if update:
        await store.update_user(user["id"], update)
        user.update(update)
    return public_user(user)

@api.get("/settings/voices")
async def list_maya_voices():
    return MAYA_VOICES

# ----- Sessions -----
@api.post("/sessions", response_model=ChatSession)
async def create_session(payload: ChatSessionCreate, user: dict = Depends(get_current_user)):
    scenario = scenario_for(payload.scenario_id)
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "user_id": user["id"],
        "scenario_id": scenario["id"],
        "title": payload.title or scenario["title"],
        "opener_seeded": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await store.insert_session(doc)
    opener = {
        "id": str(uuid.uuid4()),
        "session_id": sid,
        "role": "assistant",
        "text": scenario["opener"],
        "correction": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await store.seed_opener_if_needed(sid, opener)
    return ChatSession(**doc)

@api.get("/sessions", response_model=List[ChatSession])
async def list_sessions(user: dict = Depends(get_current_user)):
    docs = await store.list_sessions(user["id"])
    return [ChatSession(**d) for d in docs]

@api.get("/sessions/{session_id}/messages", response_model=List[ChatMessage])
async def get_messages(session_id: str, user: dict = Depends(get_current_user)):
    sess = await store.find_session(session_id, user["id"])
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    docs = await store.list_messages(session_id)
    return [ChatMessage(**d) for d in docs]

@api.get("/health")
async def health():
    load_dotenv(ROOT_DIR / ".env", override=True)
    api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    key_err = _google_key_error_message(api_key)
    db_ok = await store.ping()
    return {
        "ok": db_ok and not key_err,
        "database": store.backend_name(),
        "database_ok": db_ok,
        "gemini_configured": bool(api_key) and not key_err,
        "gemini_error": key_err or None,
        "live_model": os.environ.get("LIVE_MODEL", LIVE_MODEL),
    }

# ----- Voice status (diagnostics) -----
@api.get("/voice/status")
async def voice_status():
    load_dotenv(ROOT_DIR / ".env", override=True)
    api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    live_model = os.environ.get("LIVE_MODEL", LIVE_MODEL).strip()
    key_err = _google_key_error_message(api_key)
    if key_err:
        return {"ok": False, "error": key_err, "model": live_model, "key_prefix": None}
    if not GOOGLE_GENAI_AVAILABLE:
        return {"ok": False, "error": "google-genai package not installed", "model": live_model}
    client = google_genai.Client(
        api_key=api_key,
        http_options=google_genai.types.HttpOptions(api_version="v1alpha"),
    )
    last_err = None
    for model_name in _live_models_to_try(live_model):
        try:
            async with client.aio.live.connect(
                model=model_name,
                config={"response_modalities": ["AUDIO"]},
            ):
                return {
                    "ok": True,
                    "model": model_name,
                    "key_prefix": api_key[:6],
                }
        except Exception as exc:
            last_err = exc
            logger.warning("voice/status: model %s failed: %s", model_name, exc)
    return {
        "ok": False,
        "error": _friendly_gemini_error(last_err or RuntimeError("Live connect failed")),
        "model": live_model,
        "key_prefix": api_key[:6],
    }

# ----- Chat with Maya -----
@api.post("/chat", response_model=ChatMessage)
async def chat(payload: ChatMessageIn, user: dict = Depends(get_current_user)):
    sess = await store.find_session(payload.session_id, user["id"])
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    scenario = scenario_for(sess["scenario_id"])

    # Save user message
    user_msg = {
        "id": str(uuid.uuid4()),
        "session_id": payload.session_id,
        "role": "user",
        "text": payload.text,
        "correction": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await store.insert_message(user_msg)

    # Build prompt with prior history
    history = await store.list_messages(payload.session_id, limit=200)
    prompt = build_history_prompt(history[:-1], payload.text)

    try:
        prior_level = user.get("level", "Beginner")
        preferred = user.get("preferred_level", "Auto")
        if preferred and preferred != "Auto":
            effective_level = preferred
        else:
            effective_level = compute_level(user.get("minutes_practiced", 0), user.get("streak", 0))
        response_text = await ask_maya(
            scenario,
            payload.session_id,
            prompt,
            level=effective_level,
            minutes=user.get("minutes_practiced", 0),
        )
    except Exception as e:
        logger.exception("LLM error")
        raise HTTPException(status_code=500, detail=f"Maya is offline: {e}")

    clean_text, correction = parse_correction(response_text)

    asst_msg = {
        "id": str(uuid.uuid4()),
        "session_id": payload.session_id,
        "role": "assistant",
        "text": clean_text,
        "correction": correction,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await store.insert_message(asst_msg)

    word_count = len(payload.text.split())
    new_minutes = user.get("minutes_practiced", 0) + 1
    user = await update_streak(user)
    auto_level = compute_level(new_minutes, user.get("streak", 0))
    stored_level = auto_level if user.get("preferred_level", "Auto") == "Auto" else user.get("preferred_level", "Auto")
    level_changed = stored_level != prior_level
    await store.increment_user_stats(user["id"], minutes=1, words=word_count)
    await store.update_user(user["id"], {"level": stored_level})

    return ChatMessage(
        **asst_msg,
        level_changed=level_changed,
        new_level=stored_level if level_changed else None,
    )

# ----- Hint -----
@api.post("/hint")
async def hint(payload: HintRequest, user: dict = Depends(get_current_user)):
    sess = await store.find_session(payload.session_id, user["id"])
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    scenario = scenario_for(sess["scenario_id"])
    history = await store.list_messages(payload.session_id, limit=200)
    learner_context = await build_learner_context(user["id"], user.get("level", "Beginner"))
    live_lines = payload.live_transcript or []
    if live_lines:
        last_maya = next(
            (ln.get("text", "") for ln in reversed(live_lines) if ln.get("role") == "assistant"),
            "",
        )
    else:
        last_maya = next((m["text"] for m in reversed(history) if m["role"] == "assistant"), "")

    improvement, suggestions = await fetch_reply_suggestions(
        scenario,
        last_maya,
        user_text=payload.last_user_text or "",
        correction=payload.last_correction,
        learner_context=learner_context,
        live_transcript=live_lines or None,
        history=history if not live_lines else None,
    )
    return {"improvement": improvement, "suggestions": suggestions}

# ----- Corrections / Vocabulary Book -----
@api.get("/corrections")
async def list_corrections(user: dict = Depends(get_current_user)):
    return await store.list_corrections(user["id"])


@api.get("/corrections/due")
async def corrections_due(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    return await store.list_corrections_due(user["id"], today)


@api.get("/fluency-stats")
async def fluency_stats(user: dict = Depends(get_current_user)):
    stats = await store.list_user_fluency_stats(user["id"], limit=14)
    return {"prompt_version": PROMPT_VERSION, "sessions": stats}

# ----- Pronunciation feedback -----
class PronunciationRequest(BaseModel):
    text: str

@api.post("/pronunciation")
async def pronunciation_feedback(payload: PronunciationRequest, user: dict = Depends(get_current_user)):
    """Gemini-based fluency/pronunciation feedback on a transcribed user utterance."""
    data = await fetch_pronunciation_feedback(payload.text)
    if not data:
        raise HTTPException(status_code=500, detail="Pronunciation feedback unavailable")
    return data

# ----- Gemini Live WebSocket bridge -----
async def _ws_authenticate(websocket: WebSocket) -> Optional[str]:
    """Wait for first JSON auth message — token is not passed in the URL."""
    try:
        msg = await asyncio.wait_for(websocket.receive(), timeout=12.0)
        if msg.get("type") == "websocket.disconnect":
            return None
        raw = msg.get("text")
        if not raw:
            return None
        data = jsonlib.loads(raw)
        if data.get("type") != "auth":
            await websocket.send_json({"type": "error", "message": "Expected auth message first"})
            return None
        token = data.get("token", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except asyncio.TimeoutError:
        await websocket.send_json({"type": "error", "message": "Auth timeout — reconnect and try again"})
        return None
    except Exception:
        await websocket.send_json({"type": "error", "message": "Invalid token"})
        return None


@app.websocket("/api/ws/maya/{session_id}")
async def maya_live_ws(
    websocket: WebSocket,
    session_id: str,
    mode: str = "handsfree",
    resume: int = 0,
):
    """Bidirectional audio bridge: browser <-> Gemini Live. Audio in: PCM16 16kHz. Audio out: PCM16 24kHz."""
    await websocket.accept()
    load_dotenv(ROOT_DIR / ".env", override=True)
    api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    live_model = os.environ.get("LIVE_MODEL", LIVE_MODEL).strip()
    key_err = _google_key_error_message(api_key)
    if not GOOGLE_GENAI_AVAILABLE or key_err:
        await websocket.send_json({"type": "error", "message": key_err or "Gemini Live not configured."})
        await websocket.close()
        return

    user_id = await _ws_authenticate(websocket)
    if not user_id:
        return

    user = await store.find_user_by_id(user_id)
    if not user:
        await websocket.send_json({"type": "error", "message": "User not found"})
        await websocket.close()
        return

    sess = await store.find_session(session_id, user_id)
    if not sess:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    scenario = scenario_for(sess["scenario_id"])
    preferred = user.get("preferred_level", "Auto")
    if preferred and preferred != "Auto":
        effective_level = preferred
    else:
        effective_level = compute_level(user.get("minutes_practiced", 0), user.get("streak", 0))
    first_asst = await store.find_first_assistant_message(session_id)
    opener_text = (first_asst or {}).get("text") or scenario["opener"]
    history = await store.list_messages(session_id, limit=10)
    learner_context = await build_learner_context(user_id, effective_level)
    avg_user_words = await avg_user_words_from_history(history)
    system_inst = build_live_system(
        scenario,
        effective_level,
        user.get("minutes_practiced", 0),
        user.get("name", "Learner"),
        history,
        learner_context,
        maya_turn_count=0,
        avg_user_words=avg_user_words,
    )
    if resume:
        system_inst += "\n\nThe call was briefly interrupted. Continue naturally from the recent conversation."
    system_inst += (
        f'\n\nOPENING GREETING: When the call starts, say this greeting EXACTLY ONCE: "{opener_text}"'
        "\nDo NOT repeat or paraphrase this greeting under any circumstances in subsequent turns. "
        "After saying the opening greeting, stop completely and wait in silence for the learner to speak first. Do not continue until they do."
    )

    maya_voice = (
        user.get("maya_voice")
        or scenario.get("voice")
        or os.environ.get("MAYA_VOICE", "Kore").strip()
    )
    ptt_mode = mode.lower() in ("ptt", "push", "chat")
    cfg = build_live_config(system_inst, maya_voice, ptt_mode)

    client = google_genai.Client(
        api_key=api_key,
        http_options=google_genai.types.HttpOptions(api_version="v1alpha"),
    )

    try:
        await websocket.send_json({
            "type": "auth_ok",
            "opener": opener_text,
            "mode": "ptt" if ptt_mode else "handsfree",
            "level": effective_level,
        })
    except Exception:
        logger.info("Client disconnected before Maya auth completed")
        return

    connected_model = None
    live_session = None
    live_cm = None
    receiver = None
    maya_turn_count = 0
    pending_user_text = ""
    user_spoke_this_turn = False
    last_maya_line = ""
    maya_audio_active = False
    greeting_triggered = False  # Always trigger greeting for live calls; resume sets this True separately
    thinking_sent = False
    turn_timings: dict = {}
    user_audio_this_turn = False
    user_turn_active = False
    mic_paused = False
    short_utterance_streak = 0
    stuck_nudge_sent = False
    last_phase_injected = ""
    session_words_spoken = 0
    session_user_utterances = 0
    pronunciation_scores: list[int] = []
    skill_focus = scenario.get("skill_focus")
    greeting_lock = asyncio.Lock()
    greet_trigger = "The learner pressed Start. Say your opening greeting once."

    async def connect_live_session() -> bool:
        nonlocal live_session, live_cm, connected_model, receiver
        if live_session is not None:
            return True
        last_connect_err = None
        for model_name in _live_models_to_try(live_model):
            try:
                live_cm = client.aio.live.connect(model=model_name, config=cfg)
                live_session = await live_cm.__aenter__()
                connected_model = model_name
                receiver = asyncio.create_task(gemini_to_browser())
                return True
            except Exception as exc:
                last_connect_err = exc
                live_session = None
                live_cm = None
                logger.warning("Live connect failed for %s: %s", model_name, exc)
        await websocket.send_json({
            "type": "error",
            "message": _friendly_gemini_error(last_connect_err or Exception("No live model available")),
        })
        return False

    async def trigger_maya_greeting():
        nonlocal greeting_triggered
        async with greeting_lock:
            if greeting_triggered or live_session is None:
                return
            greeting_triggered = True
            try:
                # Text input triggers a complete turn automatically;
                # ActivityStart/ActivityEnd must NOT be used with text
                # (they cause "Precondition check failed" on the Gemini API).
                # They are only needed for audio input when
                # automatic_activity_detection is disabled.
                await live_session.send_realtime_input(text=greet_trigger)
            except Exception as exc:
                logger.exception("Maya opener trigger failed")
                greeting_triggered = False
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Maya could not start speaking: {exc}",
                    })
                except Exception:
                    pass

    async def start_live_call(*, is_resume: bool = False):
        nonlocal greeting_triggered, thinking_sent, turn_timings
        logger.info("start_live_call: connecting to Gemini Live, model=%s", live_model)
        if not await connect_live_session():
            logger.error("start_live_call: connect_live_session returned False")
            return
        logger.info("start_live_call: connected, model=%s", connected_model)
        thinking_sent = False
        turn_timings = {}
        if is_resume:
            greeting_triggered = True
        try:
            await websocket.send_json({
                "type": "ready",
                "model": connected_model,
                "voice": maya_voice,
                "opener": opener_text,
                "mode": "ptt" if ptt_mode else "handsfree",
                "level": effective_level,
            })
        except Exception:
            logger.info("Client disconnected before Maya live session was ready")
            return
        await trigger_maya_greeting()

    async def browser_to_gemini():
        nonlocal thinking_sent, turn_timings, user_audio_this_turn, user_turn_active, mic_paused
        try:
            while True:
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                b = msg.get("bytes")
                t = msg.get("text")
                if b:
                    if live_session is None or mic_paused:
                        continue
                    if not user_turn_active:
                        user_turn_active = True
                        await live_session.send_realtime_input(
                            activity_start=google_genai.types.ActivityStart()
                        )
                    user_audio_this_turn = True
                    await live_session.send_realtime_input(
                        audio=google_genai.types.Blob(data=b, mime_type="audio/pcm;rate=16000")
                    )
                elif t == "__start_call__":
                    await start_live_call(is_resume=False)
                elif t == "__resume_call__":
                    await start_live_call(is_resume=True)
                elif t == "__mic_mute__":
                    mic_paused = True
                    thinking_sent = False
                    user_audio_this_turn = False
                    if user_turn_active and live_session is not None:
                        try:
                            await live_session.send_realtime_input(
                                activity_end=google_genai.types.ActivityEnd()
                            )
                        except Exception:
                            logger.debug("mic mute activity_end failed")
                        user_turn_active = False
                    try:
                        await websocket.send_json({"type": "mic_muted"})
                    except Exception:
                        pass
                elif t == "__mic_unmute__":
                    mic_paused = False
                    try:
                        await websocket.send_json({"type": "mic_unmuted"})
                    except Exception:
                        pass
                elif t == "__end_turn__":
                    if live_session is None or mic_paused:
                        continue
                    if not user_audio_this_turn:
                        continue
                    turn_timings["end_turn_at"] = datetime.now(timezone.utc).isoformat()
                    if not thinking_sent:
                        thinking_sent = True
                        turn_timings["thinking_at"] = turn_timings["end_turn_at"]
                        await websocket.send_json({"type": "maya_thinking"})
                    try:
                        if user_turn_active:
                            await live_session.send_realtime_input(
                                activity_end=google_genai.types.ActivityEnd()
                            )
                            user_turn_active = False
                        user_audio_this_turn = False
                    except Exception:
                        logger.exception("activity_end failed")
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.exception("browser_to_gemini error")

    async def gemini_to_browser():
        nonlocal maya_turn_count, pending_user_text, user_spoke_this_turn, last_maya_line
        try:
            # SDK receive() stops after each turn_complete — loop for multi-turn calls.
            while live_session is not None:
                event_count = 0
                async for event in live_session.receive():
                    event_count += 1
                    await _handle_live_event(event)
                if event_count:
                    logger.info("gemini_to_browser: turn ended, %d events", event_count)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("gemini_to_browser error")

    async def _handle_live_event(event):
            nonlocal maya_turn_count, pending_user_text, user_spoke_this_turn, last_maya_line
            nonlocal maya_audio_active, thinking_sent, turn_timings, user_audio_this_turn, user_turn_active
            nonlocal short_utterance_streak, stuck_nudge_sent, last_phase_injected, mic_paused
            nonlocal session_words_spoken, session_user_utterances, pronunciation_scores
            audio = extract_live_audio_bytes(event)
            if audio:
                logger.debug("GEMINI AUDIO: %d bytes, mic_paused=%s", len(audio), mic_paused)
            if audio and not mic_paused:
                if not maya_audio_active:
                    maya_audio_active = True
                    thinking_sent = False
                    if "first_audio_at" not in turn_timings:
                        turn_timings["first_audio_at"] = datetime.now(timezone.utc).isoformat()
                        if os.environ.get("DEBUG_LIVE_LATENCY", "").lower() in ("1", "true", "yes"):
                            logger.info("live_latency %s", jsonlib.dumps(turn_timings))
                    await websocket.send_json({"type": "maya_speaking"})
                await websocket.send_bytes(audio)

            sc = getattr(event, "server_content", None)
            if sc:
                logger.debug("GEMINI SC: turn_complete=%s, output_tr=%s, input_tr=%s", getattr(sc, 'turn_complete', None), bool(getattr(sc, 'output_transcription', None)), bool(getattr(sc, 'input_transcription', None)))
                in_tr = getattr(sc, "input_transcription", None)
                if in_tr and getattr(in_tr, "text", None):
                    pending_user_text = in_tr.text.strip()
                    user_spoke_this_turn = True
                    await websocket.send_json({"type": "user_transcript", "text": in_tr.text})
                out_tr = getattr(sc, "output_transcription", None)
                if out_tr and getattr(out_tr, "text", None):
                    user_spoke_this_turn = False
                    chunk = out_tr.text.strip()
                    if chunk:
                        if chunk.startswith(last_maya_line):
                            last_maya_line = chunk
                        elif last_maya_line and chunk not in last_maya_line:
                            last_maya_line = f"{last_maya_line} {chunk}".strip()
                        else:
                            last_maya_line = chunk or last_maya_line
                        await websocket.send_json({
                            "type": "maya_transcript",
                            "text": last_maya_line,
                        })
                if getattr(sc, "turn_complete", False):
                    maya_audio_active = False
                    thinking_sent = False
                    user_audio_this_turn = False
                    user_turn_active = False
                    if last_maya_line:
                        maya_turn_count += 1
                        vocab = extract_vocab_words(last_maya_line, effective_level)
                        maya_line_saved = last_maya_line
                        await websocket.send_json({
                            "type": "maya_transcript",
                            "text": last_maya_line,
                            "final": True,
                            "vocab": vocab,
                        })
                        await persist_assistant_message(
                            session_id,
                            last_maya_line,
                            update_opener=(maya_turn_count == 1),
                            vocab=vocab,
                        )
                        phase = phase_instruction(scenario, maya_turn_count)
                        if phase and phase != last_phase_injected and live_session is not None:
                            last_phase_injected = phase
                            try:
                                await live_session.send_realtime_input(
                                    text=f"[Tutor note — do not read aloud: {phase}]"
                                )
                            except Exception:
                                logger.debug("phase injection skipped")

                        async def send_reply_options(maya_line: str):
                            try:
                                _, suggestions = await fetch_reply_suggestions(
                                    scenario,
                                    maya_line,
                                    learner_context=learner_context,
                                )
                                await websocket.send_json({
                                    "type": "reply_options",
                                    "improvement": "Your turn — try one of these replies:",
                                    "suggestions": suggestions,
                                })
                            except Exception:
                                logger.exception("reply options task failed")

                        asyncio.create_task(send_reply_options(maya_line_saved))
                        last_maya_line = ""
                    if user_spoke_this_turn and pending_user_text:
                        wc = len(pending_user_text.split())
                        user_text = pending_user_text
                        msg_id = await persist_user_message(session_id, user_text)
                        user_spoke_this_turn = False
                        pending_user_text = ""
                        session_words_spoken += wc
                        session_user_utterances += 1
                        await store.increment_user_stats(user_id, minutes=1, words=wc)

                        if wc < 3:
                            short_utterance_streak += 1
                        else:
                            short_utterance_streak = 0

                        if (
                            short_utterance_streak >= 2
                            and not stuck_nudge_sent
                            and live_session is not None
                        ):
                            stuck_nudge_sent = True
                            try:
                                await live_session.send_realtime_input(
                                    text=(
                                        "[Tutor note — do not read aloud: learner gave very short replies. "
                                        "Offer ONE simple phrase they can repeat, then ask an easy question.]"
                                    )
                                )
                            except Exception:
                                logger.debug("stuck nudge skipped")

                        async def send_coach_feedback():
                            try:
                                corr = await fetch_live_correction(
                                    user_text,
                                    scenario["title"],
                                    learner_context=learner_context,
                                    level=effective_level,
                                )
                                if corr and msg_id:
                                    await store.update_message_correction_with_review(msg_id, corr)
                                    await websocket.send_json({"type": "correction", "correction": corr})

                                pron = await fetch_pronunciation_feedback(
                                    user_text,
                                    skill_focus=skill_focus,
                                )
                                if pron:
                                    if pron.get("score") is not None:
                                        pronunciation_scores.append(int(pron["score"]))
                                    await websocket.send_json({"type": "pronunciation", "data": pron})

                                improvement = improvement_summary(corr, pron)
                                await websocket.send_json({
                                    "type": "coach_feedback",
                                    "improvement": improvement,
                                    "has_correction": bool(corr and corr.get("corrected")),
                                })
                            except Exception:
                                logger.exception("coach feedback task failed")

                        asyncio.create_task(send_coach_feedback())
                    await websocket.send_json({"type": "turn_complete"})

    try:
        await browser_to_gemini()
    except Exception as e:
        logger.exception("Live session error")
        try:
            await websocket.send_json({"type": "error", "message": _friendly_gemini_error(e)})
        except Exception:
            pass
    finally:
        if session_user_utterances > 0:
            avg_words = session_words_spoken / session_user_utterances
            avg_pron = (
                sum(pronunciation_scores) / len(pronunciation_scores)
                if pronunciation_scores else None
            )
            with contextlib.suppress(Exception):
                await store.upsert_session_stats(session_id, {
                    "words_spoken": session_words_spoken,
                    "avg_utterance_words": round(avg_words, 1),
                    "avg_pronunciation_score": round(avg_pron, 1) if avg_pron else None,
                })
        if receiver is not None:
            receiver.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await receiver
        if live_session is not None and live_cm is not None:
            with contextlib.suppress(Exception):
                await live_cm.__aexit__(None, None, None)
        elif live_session is not None:
            with contextlib.suppress(Exception):
                await live_session.__aexit__(None, None, None)
        try:
            await websocket.close()
        except Exception:
            pass

# ----- Background: streak reset task -----
async def streak_reset_loop():
    """Hourly task that resets streak to 0 for users inactive > 1 day."""
    while True:
        try:
            today = datetime.now(timezone.utc).date()
            cutoff = (today - timedelta(days=1)).isoformat()
            # users with last_active_date strictly before cutoff and streak > 0
            result = await store.reset_inactive_streaks(cutoff)
            if result:
                logger.info("Streak reset for %s inactive users", result)
        except Exception:
            logger.exception("Streak reset failed")
        await asyncio.sleep(3600)  # every hour

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
