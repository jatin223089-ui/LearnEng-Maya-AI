"""Start the EngLearn backend — safe to run from any directory."""
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"

if not (BACKEND / "server.py").exists():
    print(f"ERROR: backend/server.py not found at {BACKEND}", file=sys.stderr)
    sys.exit(1)

os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("BACKEND_PORT", "8000"))
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    reload = os.environ.get("BACKEND_RELOAD", "1") != "0"

    print(f"Starting backend at http://{host}:{port} (cwd: {BACKEND})")
    uvicorn.run("server:app", host=host, port=port, reload=reload)
