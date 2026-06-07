import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from forgeai.llm import LLMClient
from forgeai.agents.lead_agent import LeadAgent
from forgeai import database as db


async def test_full_pipeline():
    print("=== ForgeAI v2 — End to End Test ===\n")

    # Init database
    await db.init_db()
    print("✓ Database ready\n")

    llm = LLMClient()
    lead = LeadAgent(llm)

    # Step 1 — Create project
    brief = "Build a personal task manager. Users can create tasks, mark them complete, and view history."
    project = await lead.start_project(brief)
    print(f"✓ Project created: {project.id}\n")

    # Step 2 — Handle brief (research + architecture + plan)
    print("Running research and architecture...")
    response = await lead.handle_message(project.id, brief)
    print(f"✓ Plan ready:\n{response.message[:500]}\n")

    # Step 3 — Reload project and check state
    project = await db.load_project(project.id)
    print(f"✓ State: {project.state}")
    print(f"✓ Tech stack: {project.tech_stack.language}, {project.tech_stack.framework}")
    print(f"✓ API endpoints: {len(project.master_document.api_endpoints)}")
    print(f"✓ Files planned: {len(project.file_manifest.all_files())}\n")

    # Step 4 — Approve plan (generate frontend)
    print("Generating frontend...")
    response = await lead.handle_message(project.id, "looks good")
    print(f"✓ Frontend response: {response.message[:200]}\n")

    # Step 5 — Check files on disk
    output_dir = Path(os.environ.get("FORGEAI_OUTPUT_DIR", "output")) / project.id
    files = list(output_dir.rglob("*"))
    files = [f for f in files if f.is_file()]
    print(f"✓ Files written to disk: {len(files)}")
    for f in sorted(files):
        size = f.stat().st_size
        print(f"  {f.relative_to(output_dir)} ({size} bytes)")

    # Step 6 — Approve frontend (generate backend)
    print("\nGenerating backend...")
    response = await lead.handle_message(project.id, "looks good")
    print(f"✓ Backend response: {response.message[:200]}\n")

    # Step 7 — Final file count
    files = list(output_dir.rglob("*"))
    files = [f for f in files if f.is_file()]
    print(f"✓ Total files: {len(files)}")
    for f in sorted(files):
        size = f.stat().st_size
        print(f"  {f.relative_to(output_dir)} ({size} bytes)")

    # Step 8 — Check validation
    project = await db.load_project(project.id)
    if project.validation_result:
        print(f"\n✓ Validation: {'PASSED' if project.validation_result.passed else 'FAILED'}")
        if project.validation_result.issues:
            for issue in project.validation_result.issues[:5]:
                print(f"  [{issue.severity}] {issue.file}: {issue.description}")

    print("\n=== Test Complete ===")


asyncio.run(test_full_pipeline())
