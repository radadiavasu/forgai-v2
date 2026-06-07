import asyncpg
import os
import json
from .models.schemas import Project, ConversationState
from datetime import datetime


_pool = None


async def get_pool():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            os.environ["DATABASE_URL"],
            min_size=2,
            max_size=10,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def init_db():
    """Create tables if they don't exist."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                brief TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'WAITING_BRIEF',
                data JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS activity_events (
                id SERIAL PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id),
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                data JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)


async def save_project(project: Project) -> None:
    pool = await get_pool()
    data = project.model_dump_json()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO projects (id, name, brief, state, data, updated_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE SET
                state = EXCLUDED.state,
                data = EXCLUDED.data,
                updated_at = NOW()
        """, project.id, project.name, project.brief,
            project.state.value, data)


async def load_project(project_id: str) -> Project | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT data FROM projects WHERE id = $1",
            project_id
        )
        if row is None:
            return None
        return Project.model_validate_json(row["data"])


async def list_projects() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, brief, state, created_at
            FROM projects
            ORDER BY created_at DESC
        """)
        return [dict(r) for r in rows]


async def save_message(
    project_id: str,
    role: str,
    content: str,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO messages (project_id, role, content)
            VALUES ($1, $2, $3)
        """, project_id, role, content)


async def get_messages(project_id: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT role, content, created_at
            FROM messages
            WHERE project_id = $1
            ORDER BY created_at ASC
        """, project_id)
        return [dict(r) for r in rows]


async def save_activity(
    project_id: str,
    event_type: str,
    message: str,
    data: dict = {},
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO activity_events
            (project_id, type, message, data)
            VALUES ($1, $2, $3, $4::jsonb)
        """, project_id, event_type, message,
            json.dumps(data))


async def get_activity(project_id: str) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT type, message, data, created_at
            FROM activity_events
            WHERE project_id = $1
            ORDER BY created_at ASC
        """, project_id)
        return [dict(r) for r in rows]
