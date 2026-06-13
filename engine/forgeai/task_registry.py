"""Track in-flight project work so runs can be cancelled."""

import asyncio
from typing import Awaitable, Callable, Coroutine, TypeVar

T = TypeVar("T")

_running: dict[str, asyncio.Task] = {}


def get_running_task(project_id: str) -> asyncio.Task | None:
    task = _running.get(project_id)
    if task and task.done():
        _running.pop(project_id, None)
        return None
    return task


def cancel_running_task(project_id: str) -> bool:
    task = get_running_task(project_id)
    if task is None:
        return False
    task.cancel()
    return True


async def run_project_task(
    project_id: str,
    coro: Coroutine[None, None, T],
) -> T:
    existing = get_running_task(project_id)
    if existing is not None:
        existing.cancel()
        try:
            await existing
        except asyncio.CancelledError:
            pass

    task = asyncio.create_task(coro)
    _running[project_id] = task
    try:
        return await task
    finally:
        if _running.get(project_id) is task:
            _running.pop(project_id, None)


def is_task_running(project_id: str) -> bool:
    return get_running_task(project_id) is not None
