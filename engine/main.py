"""ForgeAI v2 — start the engine."""
from pathlib import Path
from dotenv import load_dotenv
import uvicorn

load_dotenv(Path(__file__).resolve().parent / ".env")

if __name__ == "__main__":
    uvicorn.run(
        "forgeai.api.app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
