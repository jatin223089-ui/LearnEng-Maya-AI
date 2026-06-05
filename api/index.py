import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import os
os.environ.setdefault("MONGO_URL", "mongodb+srv://<your-atlas-user>:<password>@<cluster>.mongodb.net")
os.environ.setdefault("DB_NAME", "englearn")

from server import app
