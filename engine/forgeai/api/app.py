from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .. import database as db
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await db.init_db()
    yield
    # Shutdown
    await db.close_pool()


app = FastAPI(
    title="ForgeAI",
    description="AI-powered software project generator",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
