#!/usr/bin/env python3
"""Export anonymized tutor transcripts for prompt iteration (consent-based)."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

import store  # noqa: E402


async def export_transcripts(out_path: Path, limit: int = 500) -> int:
    await store.init_store()
    if store.backend_name() == "none":
        raise RuntimeError("No database configured")

    rows = []
    if store.backend_name() == "mongo":
        sessions = await store._mongo_db.sessions.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
        for sess in sessions:
            msgs = await store.list_messages(sess["id"], limit=200)
            user = await store.find_user_by_id(sess["user_id"])
            level = (user or {}).get("level", "Beginner")
            for m in msgs:
                if m.get("role") != "user" or not m.get("text"):
                    continue
                row = {
                    "level": level,
                    "scenario_id": sess.get("scenario_id"),
                    "user_text": m["text"],
                    "correction": m.get("correction"),
                    "created_at": m.get("created_at"),
                }
                rows.append(row)
    else:
        async with store._pg_pool.acquire() as conn:
            msg_rows = await conn.fetch(
                """SELECT m.text, m.correction, m.created_at, s.scenario_id, u.level
                   FROM messages m
                   JOIN sessions s ON s.id = m.session_id
                   JOIN users u ON u.id = s.user_id
                   WHERE m.role = 'user' AND m.text IS NOT NULL
                   ORDER BY m.created_at DESC LIMIT $1""",
                limit,
            )
        for r in msg_rows:
            corr = r["correction"]
            if isinstance(corr, str):
                corr = json.loads(corr) if corr else None
            rows.append({
                "level": r["level"],
                "scenario_id": r["scenario_id"],
                "user_text": r["text"],
                "correction": corr,
                "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else r["created_at"],
            })

    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "count": len(rows),
        "rows": rows,
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Export anonymized Maya tutor transcripts")
    parser.add_argument("-o", "--output", default="transcripts_export.json")
    parser.add_argument("-n", "--limit", type=int, default=500)
    args = parser.parse_args()
    count = asyncio.run(export_transcripts(Path(args.output), args.limit))
    print(f"Exported {count} user utterances to {args.output}")


if __name__ == "__main__":
    main()
