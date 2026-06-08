from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from ..models.schemas import (
    CreateProjectRequest, CreateProjectResponse,
    SendMessageRequest, SendMessageResponse,
    ConversationState,
)
from ..agents.lead_agent import LeadAgent
from ..llm import LLMClient
from .. import database as db
import asyncio
import json
import os
import zipfile
import tempfile
from pathlib import Path


router = APIRouter()

# One shared LeadAgent instance
_llm = LLMClient()
_lead = LeadAgent(_llm)


# ── Projects ──────────────────────────────────────

@router.post("/projects", response_model=CreateProjectResponse)
async def create_project(
    request: CreateProjectRequest,
    background_tasks: BackgroundTasks,
):
    """Start a new project from a brief."""
    project = await _lead.start_project(request.brief)

    # Process brief in background
    background_tasks.add_task(
        _lead.handle_message, project.id, request.brief
    )

    return CreateProjectResponse(
        project_id=project.id,
        message="Project created. ForgeAI is analyzing your brief...",
        state=ConversationState.WAITING_BRIEF,
    )


@router.get("/projects")
async def list_projects():
    """List all projects."""
    projects = await db.list_projects()
    return {"projects": projects}


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get project state."""
    project = await db.load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/projects/{project_id}/message",
             response_model=SendMessageResponse)
async def send_message(
    project_id: str,
    request: SendMessageRequest,
):
    """Send a message to Lead_Agent for this project."""
    project = await db.load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    response = await _lead.handle_message(project_id, request.message)
    return response


@router.get("/projects/{project_id}/messages")
async def get_messages(project_id: str):
    messages = await db.get_messages(project_id)
    return {"messages": messages}


# ── Activity Stream ───────────────────────────────

@router.get("/projects/{project_id}/stream")
async def stream_activity(project_id: str):
    """
    Server-sent events stream of project activity.
    UI polls this to show live progress.
    """
    async def event_generator():
        last_id = 0
        while True:
            events = await db.get_activity(project_id)
            new_events = events[last_id:]
            for event in new_events:
                data = json.dumps({
                    "type": event["type"],
                    "message": event["message"],
                    "data": event.get("data", {}),
                    "timestamp": str(event["created_at"]),
                })
                yield f"data: {data}\n\n"
                last_id += 1

            # Check if project is complete
            project = await db.load_project(project_id)
            if project and project.state in (
                ConversationState.COMPLETE,
                ConversationState.FRONTEND_APPROVAL,
            ):
                yield f"data: {json.dumps({'type': 'ready', 'state': project.state})}\n\n"

            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Files ─────────────────────────────────────────

@router.get("/projects/{project_id}/files")
async def get_files(project_id: str):
    """Get all generated files for a project."""
    project = await db.load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    output_dir = Path(
        os.environ.get("FORGEAI_OUTPUT_DIR", "output")
    ) / project_id

    if not output_dir.exists():
        return {"files": []}

    files = []
    for f in output_dir.rglob("*"):
        if f.is_file():
            rel_path = str(f.relative_to(output_dir))
            try:
                content = f.read_text(encoding="utf-8")
                files.append({
                    "path": rel_path,
                    "content": content,
                    "bytes": f.stat().st_size,
                })
            except Exception:
                pass

    return {"files": files}


@router.get("/projects/{project_id}/files/{file_path:path}")
async def get_file(project_id: str, file_path: str):
    """Get a single generated file."""
    output_dir = Path(
        os.environ.get("FORGEAI_OUTPUT_DIR", "output")
    ) / project_id
    full_path = output_dir / file_path

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    content = full_path.read_text(encoding="utf-8")
    return {"path": file_path, "content": content}


# ── Download ──────────────────────────────────────

@router.get("/projects/{project_id}/download")
async def download_project(project_id: str):
    """Download the complete project as a zip file."""
    project = await db.load_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    output_dir = Path(
        os.environ.get("FORGEAI_OUTPUT_DIR", "output")
    ) / project_id

    if not output_dir.exists():
        raise HTTPException(
            status_code=404,
            detail="No files generated yet"
        )

    # Create zip in temp directory
    tmp = tempfile.mktemp(suffix=".zip")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in output_dir.rglob("*"):
            if f.is_file():
                zf.write(f, f.relative_to(output_dir))

    name = project.name or project_id
    return FileResponse(
        tmp,
        media_type="application/zip",
        filename=f"{name}.zip",
    )


# ── Health ────────────────────────────────────────

@router.get("/health")
async def health():
    """Health check."""
    return {"status": "ok", "version": "2.0.0"}
