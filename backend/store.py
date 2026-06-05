"""Data store — Postgres (Supabase) when DATABASE_URL is set, else MongoDB."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger("englearn.store")

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

_backend: str = "none"
_pg_pool = None
_mongo_client = None
_mongo_db = None
_last_db_error: str | None = None


async def init_store() -> str:
    global _backend, _pg_pool, _mongo_client, _mongo_db, _last_db_error
    _last_db_error = None
    if DATABASE_URL:
        try:
            import asyncpg

            _pg_pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=8)
            async with _pg_pool.acquire() as conn:
                await conn.execute("SELECT 1")
            _backend = "postgres"
            logger.info("Using Postgres store (Supabase)")
            return _backend
        except Exception as exc:
            logger.error("Postgres unavailable (%s), falling back to MongoDB", exc)
    for attempt in range(3):
        try:
            from motor.motor_asyncio import AsyncIOMotorClient

            _mongo_client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
            _mongo_db = _mongo_client[DB_NAME]
            await _mongo_client.admin.command("ping")
            _backend = "mongo"
            _last_db_error = None
            logger.info("Using MongoDB store at %s", MONGO_URL)
            return _backend
        except Exception as exc:
            _last_db_error = str(exc)
            logger.error("MongoDB unavailable (attempt %d/3): %s", attempt + 1, exc)
            if attempt < 2:
                await asyncio.sleep(2)
    _backend = "none"
    return _backend


async def ping() -> bool:
    if _backend == "postgres" and _pg_pool:
        async with _pg_pool.acquire() as conn:
            await conn.execute("SELECT 1")
        return True
    if _backend == "mongo" and _mongo_client:
        await _mongo_client.admin.command("ping")
        return True
    return False


def backend_name() -> str:
    return _backend


def backend_error() -> str | None:
    return _last_db_error


def _row_to_dict(row) -> dict:
    if row is None:
        return None
    d = dict(row)
    if "correction" in d and isinstance(d["correction"], str):
        d["correction"] = json.loads(d["correction"]) if d["correction"] else None
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


async def find_user_by_id(user_id: str) -> Optional[dict]:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        return _row_to_dict(row)
    if _backend == "mongo":
        return await _mongo_db.users.find_one({"id": user_id})
    return None


async def find_user_by_email(email: str) -> Optional[dict]:
    email = email.lower()
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
        return _row_to_dict(row)
    if _backend == "mongo":
        return await _mongo_db.users.find_one({"email": email})
    return None


async def insert_user(doc: dict) -> None:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO users (id, name, email, password_hash, level, streak,
                   minutes_practiced, words_learned, created_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
                doc["id"], doc["name"], doc["email"], doc["password_hash"],
                doc.get("level", "Beginner"), doc.get("streak", 1),
                doc.get("minutes_practiced", 0), doc.get("words_learned", 0),
                doc.get("created_at"),
            )
        return
    if _backend == "mongo":
        await _mongo_db.users.insert_one(doc)


async def update_user(user_id: str, fields: dict) -> None:
    if not fields:
        return
    if _backend == "postgres":
        sets = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(fields))
        vals = list(fields.values())
        async with _pg_pool.acquire() as conn:
            await conn.execute(f"UPDATE users SET {sets} WHERE id = $1", user_id, *vals)
        return
    if _backend == "mongo":
        await _mongo_db.users.update_one({"id": user_id}, {"$set": fields})


async def increment_user_stats(user_id: str, *, minutes: int = 0, words: int = 0) -> None:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            await conn.execute(
                """UPDATE users SET minutes_practiced = minutes_practiced + $2,
                   words_learned = words_learned + $3 WHERE id = $1""",
                user_id, minutes, words,
            )
        return
    if _backend == "mongo":
        await _mongo_db.users.update_one(
            {"id": user_id},
            {"$inc": {"minutes_practiced": minutes, "words_learned": words}},
        )


async def reset_inactive_streaks(cutoff: str) -> int:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            res = await conn.execute(
                """UPDATE users SET streak = 0
                   WHERE last_active_date < $1 AND streak > 0""",
                cutoff,
            )
        return int(res.split()[-1]) if res else 0
    if _backend == "mongo":
        res = await _mongo_db.users.update_many(
            {"last_active_date": {"$lt": cutoff}, "streak": {"$gt": 0}},
            {"$set": {"streak": 0}},
        )
        return res.modified_count
    return 0


async def insert_session(doc: dict) -> None:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO sessions (id, user_id, scenario_id, title, opener_seeded, created_at)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                doc["id"], doc["user_id"], doc["scenario_id"], doc["title"],
                doc.get("opener_seeded", False), doc.get("created_at"),
            )
        return
    if _backend == "mongo":
        await _mongo_db.sessions.insert_one(doc)


async def seed_opener_if_needed(session_id: str, opener: dict) -> bool:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT opener_seeded FROM sessions WHERE id = $1 FOR UPDATE",
                    session_id,
                )
                if not row or row["opener_seeded"]:
                    return False
                await conn.execute(
                    "UPDATE sessions SET opener_seeded = TRUE WHERE id = $1",
                    session_id,
                )
                await conn.execute(
                    """INSERT INTO messages (id, session_id, role, text, correction, created_at)
                       VALUES ($1,$2,$3,$4,$5,$6)""",
                    opener["id"], opener["session_id"], opener["role"], opener["text"],
                    None, opener["created_at"],
                )
                return True
    if _backend == "mongo":
        seeded = await _mongo_db.sessions.update_one(
            {"id": session_id, "opener_seeded": {"$ne": True}},
            {"$set": {"opener_seeded": True}},
        )
        if seeded.modified_count:
            await _mongo_db.messages.insert_one(opener)
            return True
    return False


async def find_session(session_id: str, user_id: Optional[str] = None) -> Optional[dict]:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            if user_id:
                row = await conn.fetchrow(
                    "SELECT * FROM sessions WHERE id = $1 AND user_id = $2",
                    session_id, user_id,
                )
            else:
                row = await conn.fetchrow("SELECT * FROM sessions WHERE id = $1", session_id)
        return _row_to_dict(row)
    if _backend == "mongo":
        q = {"id": session_id}
        if user_id:
            q["user_id"] = user_id
        return await _mongo_db.sessions.find_one(q)
    return None


async def list_sessions(user_id: str, limit: int = 100) -> list[dict]:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
                user_id, limit,
            )
        return [_row_to_dict(r) for r in rows]
    if _backend == "mongo":
        docs = await _mongo_db.sessions.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(limit)
        return docs
    return []


async def list_messages(session_id: str, limit: int = 1000) -> list[dict]:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2",
                session_id, limit,
            )
        return [_row_to_dict(r) for r in rows]
    if _backend == "mongo":
        docs = await _mongo_db.messages.find(
            {"session_id": session_id}, {"_id": 0}
        ).sort("created_at", 1).to_list(limit)
        return docs
    return []


async def insert_message(doc: dict) -> None:
    correction = doc.get("correction")
    vocab = doc.get("vocab")
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO messages (id, session_id, role, text, correction, vocab, next_review_at, created_at)
                   VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)""",
                doc["id"], doc["session_id"], doc["role"], doc["text"],
                json.dumps(correction) if correction else None,
                json.dumps(vocab) if vocab else None,
                doc.get("next_review_at"),
                doc.get("created_at"),
            )
        return
    if _backend == "mongo":
        await _mongo_db.messages.insert_one(doc)


async def update_message_text(message_id: str, text: str) -> None:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            await conn.execute("UPDATE messages SET text = $2 WHERE id = $1", message_id, text)
        return
    if _backend == "mongo":
        await _mongo_db.messages.update_one({"id": message_id}, {"$set": {"text": text}})


async def update_message_correction(message_id: str, correction: dict) -> None:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            await conn.execute(
                "UPDATE messages SET correction = $2::jsonb WHERE id = $1",
                message_id, json.dumps(correction),
            )
        return
    if _backend == "mongo":
        await _mongo_db.messages.update_one({"id": message_id}, {"$set": {"correction": correction}})


async def find_first_assistant_message(session_id: str) -> Optional[dict]:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT * FROM messages WHERE session_id = $1 AND role = 'assistant'
                   ORDER BY created_at ASC LIMIT 1""",
                session_id,
            )
        return _row_to_dict(row)
    if _backend == "mongo":
        return await _mongo_db.messages.find_one(
            {"session_id": session_id, "role": "assistant"},
            sort=[("created_at", 1)],
        )
    return None


async def find_last_user_message_id(session_id: str) -> Optional[str]:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT id FROM messages WHERE session_id = $1 AND role = 'user'
                   ORDER BY created_at DESC LIMIT 1""",
                session_id,
            )
        return row["id"] if row else None
    if _backend == "mongo":
        doc = await _mongo_db.messages.find_one(
            {"session_id": session_id, "role": "user"},
            sort=[("created_at", -1)],
        )
        return doc["id"] if doc else None
    return None


async def list_corrections(user_id: str) -> list[dict]:
    sessions = await list_sessions(user_id, limit=1000)
    sess_map = {s["id"]: s for s in sessions}
    if not sess_map:
        return []
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT * FROM messages WHERE session_id = ANY($1::text[])
                   AND correction IS NOT NULL ORDER BY created_at DESC LIMIT 500""",
                list(sess_map.keys()),
            )
        docs = [_row_to_dict(r) for r in rows]
    elif _backend == "mongo":
        docs = await _mongo_db.messages.find(
            {"session_id": {"$in": list(sess_map.keys())}, "correction": {"$ne": None}},
            {"_id": 0},
        ).sort("created_at", -1).to_list(500)
    else:
        return []
    out = []
    for m in docs:
        sess = sess_map.get(m["session_id"], {})
        correction = m.get("correction")
        if isinstance(correction, str):
            try:
                correction = json.loads(correction)
            except Exception:
                correction = None
        out.append({
            "id": m["id"],
            "session_id": m["session_id"],
            "session_title": sess.get("title", "Conversation"),
            "scenario_id": sess.get("scenario_id"),
            "created_at": m["created_at"],
            "correction": correction,
            "next_review_at": m.get("next_review_at"),
        })
    return out


async def aggregate_correction_patterns(user_id: str, limit: int = 5) -> list[str]:
    """Top recurring mistake patterns from correction history."""
    corrections = await list_corrections(user_id)
    counts: dict[str, int] = {}
    for c in corrections:
        corr = c.get("correction") or {}
        tip = (corr.get("tip") or "").strip().lower()
        original = (corr.get("original") or "").strip().lower()
        key = tip or original
        if not key or len(key) < 4:
            continue
        counts[key] = counts.get(key, 0) + 1
    ranked = sorted(counts.items(), key=lambda x: (-x[1], x[0]))
    return [k for k, _ in ranked[:limit]]


async def get_last_session_summary(user_id: str) -> str:
    sessions = await list_sessions(user_id, limit=2)
    if not sessions:
        return ""
    last = sessions[0]
    msgs = await list_messages(last["id"], limit=8)
    if not msgs:
        return f"Started {last.get('title', 'a session')} — no messages yet."
    user_lines = [m["text"] for m in msgs if m.get("role") == "user" and m.get("text")][-2:]
    scenario_id = last.get("scenario_id", "free-talk")
    title = last.get("title", "conversation")
    if user_lines:
        snippet = user_lines[-1][:60]
        return f"Practiced {title} ({scenario_id}); last said: \"{snippet}\""
    return f"Practiced {title} ({scenario_id})."


async def get_recent_vocab_words(user_id: str, limit: int = 2) -> list[str]:
    sessions = await list_sessions(user_id, limit=20)
    if not sessions:
        return []
    sess_ids = [s["id"] for s in sessions]
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT vocab FROM messages WHERE session_id = ANY($1::text[])
                   AND role = 'assistant' AND vocab IS NOT NULL
                   ORDER BY created_at DESC LIMIT 30""",
                sess_ids,
            )
        docs = [_row_to_dict(r) for r in rows]
    elif _backend == "mongo":
        docs = await _mongo_db.messages.find(
            {"session_id": {"$in": sess_ids}, "role": "assistant", "vocab": {"$exists": True, "$ne": []}},
            {"_id": 0, "vocab": 1},
        ).sort("created_at", -1).to_list(30)
    else:
        return []
    seen = set()
    out = []
    for m in docs:
        for w in m.get("vocab") or []:
            wl = str(w).lower()
            if wl and wl not in seen:
                seen.add(wl)
                out.append(wl)
            if len(out) >= limit:
                return out
    return out


async def update_message_vocab(message_id: str, vocab: list) -> None:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            await conn.execute(
                "UPDATE messages SET vocab = $2::jsonb WHERE id = $1",
                message_id, json.dumps(vocab),
            )
        return
    if _backend == "mongo":
        await _mongo_db.messages.update_one({"id": message_id}, {"$set": {"vocab": vocab}})


async def update_message_correction_with_review(message_id: str, correction: dict) -> None:
    from datetime import datetime, timedelta, timezone
    next_review = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    correction = dict(correction)
    correction["next_review_at"] = next_review
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            await conn.execute(
                "UPDATE messages SET correction = $2::jsonb, next_review_at = $3 WHERE id = $1",
                message_id, json.dumps(correction), next_review,
            )
        return
    if _backend == "mongo":
        await _mongo_db.messages.update_one(
            {"id": message_id},
            {"$set": {"correction": correction, "next_review_at": next_review}},
        )


async def list_corrections_due(user_id: str, today_iso: str) -> list[dict]:
    all_c = await list_corrections(user_id)
    due = []
    for c in all_c:
        nr = c.get("next_review_at")
        if nr is None or nr <= today_iso:
            due.append(c)
    return due[:20]


async def upsert_session_stats(session_id: str, stats: dict) -> None:
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO session_stats (session_id, words_spoken, avg_utterance_words,
                   avg_pronunciation_score, updated_at)
                   VALUES ($1,$2,$3,$4,NOW())
                   ON CONFLICT (session_id) DO UPDATE SET
                   words_spoken = EXCLUDED.words_spoken,
                   avg_utterance_words = EXCLUDED.avg_utterance_words,
                   avg_pronunciation_score = EXCLUDED.avg_pronunciation_score,
                   updated_at = NOW()""",
                session_id,
                stats.get("words_spoken", 0),
                stats.get("avg_utterance_words", 0),
                stats.get("avg_pronunciation_score"),
            )
        return
    if _backend == "mongo":
        await _mongo_db.session_stats.update_one(
            {"session_id": session_id},
            {"$set": {**stats, "session_id": session_id}},
            upsert=True,
        )


async def list_user_fluency_stats(user_id: str, limit: int = 14) -> list[dict]:
    sessions = await list_sessions(user_id, limit=limit)
    if not sessions:
        return []
    sess_ids = [s["id"] for s in sessions]
    if _backend == "postgres":
        async with _pg_pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT ss.*, s.created_at FROM session_stats ss
                   JOIN sessions s ON s.id = ss.session_id
                   WHERE ss.session_id = ANY($1::text[])
                   ORDER BY s.created_at DESC LIMIT $2""",
                sess_ids, limit,
            )
        return [_row_to_dict(r) for r in rows]
    if _backend == "mongo":
        stats = await _mongo_db.session_stats.find(
            {"session_id": {"$in": sess_ids}}, {"_id": 0}
        ).to_list(limit)
        sess_dates = {s["id"]: s.get("created_at") for s in sessions}
        for st in stats:
            st["created_at"] = sess_dates.get(st["session_id"])
        stats.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return stats[:limit]
    return []


async def find_assistant_message_by_text_prefix(session_id: str, prefix: str) -> Optional[dict]:
    msgs = await list_messages(session_id, limit=50)
    for m in reversed(msgs):
        if m.get("role") == "assistant" and (m.get("text") or "").startswith(prefix[:40]):
            return m
    return None
