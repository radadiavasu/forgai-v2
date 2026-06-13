from ..models.schemas import (
    Project, ConversationState, ActivityEvent,
    CreateProjectResponse, SendMessageResponse,
    MessageType, ProjectPlan, GeneratedFile,
)
from .classifier import MessageClassifier
from .state_machine import StateMachine
from .research_agent import ResearchAgent, ArchitectAgent
from .generation_agent import GenerationAgent
from ..generation.file_manifest import FileManifestGenerator
from ..generation.static_validator import StaticValidator
from ..llm import LLMClient
from .. import database as db
from ..errors import ProjectCancelled
from .. import task_registry
import uuid
import os
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


OUTPUT_BASE_DIR = os.environ.get("FORGEAI_OUTPUT_DIR", "output")


class LeadAgent:

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.classifier = MessageClassifier(llm)
        self.research = ResearchAgent(llm)
        self.architect = ArchitectAgent(llm)
        self.manifest_generator = FileManifestGenerator(llm)
        self.generation = GenerationAgent(llm)
        self.validator = StaticValidator()

    async def _ensure_active(self, project_id: str) -> Project:
        project = await db.load_project(project_id)
        if project is None:
            raise ProjectCancelled("Project not found")
        if project.state == ConversationState.CANCELLED:
            raise ProjectCancelled("Project stopped by user")
        return project

    async def cancel_project(self, project_id: str) -> str:
        """Stop a project — cancels in-flight work and marks state CANCELLED."""
        project = await db.load_project(project_id)
        if project is None:
            return "Project not found."

        if project.state == ConversationState.CANCELLED:
            return "Project is already stopped."

        if project.state in (
            ConversationState.COMPLETE,
            ConversationState.LIVE,
        ):
            return "Completed projects cannot be stopped. Delete it instead."

        task_registry.cancel_running_task(project_id)
        project.state = ConversationState.CANCELLED
        await db.save_project(project)

        await db.save_activity(
            project_id,
            "cancelled",
            "Project stopped by user",
        )

        message = (
            "This project has been stopped.\n\n"
            "Start a new project from the home page when you're ready."
        )
        await db.save_message(project_id, "assistant", message)
        return message

    # ── Project Creation ──────────────────────────────

    async def start_project(self, brief: str) -> Project:
        """Create a new project from a brief."""
        project = Project(
            id=str(uuid.uuid4()),
            name="",
            brief=brief,
            state=ConversationState.WAITING_BRIEF,
        )
        await db.save_project(project)
        await db.save_message(project.id, "user", brief)
        await db.save_activity(
            project.id, "project_created",
            "Project created", {"brief": brief[:100]}
        )
        return project

    # ── Message Handling ──────────────────────────────

    async def handle_message(
        self,
        project_id: str,
        message: str,
    ) -> SendMessageResponse:
        """
        Handle any incoming user message.
        Classifies it and routes to the right handler.
        """
        project = await db.load_project(project_id)
        if project is None:
            return SendMessageResponse(
                message="Project not found.",
                state=ConversationState.WAITING_BRIEF,
            )

        if project.state == ConversationState.CANCELLED:
            return SendMessageResponse(
                message=(
                    "This project was stopped. "
                    "Start a new project from the home page."
                ),
                state=ConversationState.CANCELLED,
                project=project,
            )

        await db.save_message(project_id, "user", message)

        # Quick check for obvious approvals first
        if self.classifier.is_approval(message):
            classified_type = MessageType.APPROVAL
        else:
            classified = await self.classifier.classify(message)
            classified_type = classified.type

        # Route based on state + message type
        try:
            response_message = await self._route(
                project, message, classified_type
            )
        except ProjectCancelled:
            project = await db.load_project(project_id)
            return SendMessageResponse(
                message="Project stopped.",
                state=project.state if project else ConversationState.CANCELLED,
                project=project,
            )
        except Exception as exc:
            logger.exception(
                "Pipeline failed for project %s in state %s",
                project_id,
                project.state,
            )
            err_text = str(exc)[:200]
            phase = "planning"
            if project.state in (
                ConversationState.GENERATING_FRONTEND,
                ConversationState.GENERATING_BACKEND,
            ):
                phase = "generation"
            await db.save_activity(
                project_id,
                "error",
                f"{phase.capitalize()} failed: {err_text}",
            )
            sm = StateMachine(project.state)
            if sm.state == ConversationState.RESEARCHING:
                sm.transition(ConversationState.WAITING_BRIEF, "error recovery")
                project.state = sm.state
            elif sm.state == ConversationState.GENERATING_FRONTEND:
                sm.transition(ConversationState.PLAN_APPROVAL, "error recovery")
                project.state = sm.state
            elif sm.state == ConversationState.GENERATING_BACKEND:
                sm.transition(ConversationState.FRONTEND_APPROVAL, "error recovery")
                project.state = sm.state
            await db.save_project(project)
            response_message = (
                f"Something went wrong during {phase}. "
                f"({str(exc)[:120]})\n\n"
            )
            if phase == "planning":
                response_message += (
                    "Please send your brief again — try a shorter description "
                    "if the project is very large."
                )
            else:
                response_message += (
                    "Say **'looks good'** to retry, or describe what to change."
                )

        await db.save_message(project_id, "assistant", response_message)
        project = await db.load_project(project_id)

        return SendMessageResponse(
            message=response_message,
            state=project.state,
            project=project,
        )

    async def _route(
        self,
        project: Project,
        message: str,
        message_type: MessageType,
    ) -> str:
        """Route message based on current state."""
        state = project.state

        # Handle off-topic anywhere
        if message_type == MessageType.OFF_TOPIC:
            return (
                "ForgeAI builds software projects. "
                "Tell me what you'd like to build."
            )

        # Handle questions anywhere
        if message_type == MessageType.QUESTION:
            return await self._answer_question(project, message)

        # State-specific routing
        if state == ConversationState.WAITING_BRIEF:
            return await self._handle_brief(project, message)

        elif state == ConversationState.RESEARCHING:
            sm = StateMachine(project.state)
            sm.transition(ConversationState.WAITING_BRIEF, "retry planning")
            project.state = sm.state
            await db.save_project(project)
            return await self._handle_brief(project, project.brief)

        elif state == ConversationState.PLAN_APPROVAL:
            if message_type == MessageType.APPROVAL:
                return await self._start_frontend_generation(project)
            elif message_type == MessageType.CHANGE_REQUEST:
                return await self._revise_plan(project, message)
            else:
                return (
                    "Here's the plan I've prepared. "
                    "Say 'looks good' to start building, "
                    "or tell me what you'd like to change."
                )

        elif state == ConversationState.FRONTEND_APPROVAL:
            if (
                message_type == MessageType.APPROVAL
                and len(project.generated_files) == 0
            ):
                return await self._start_frontend_generation(project)
            if message_type == MessageType.APPROVAL:
                return await self._start_backend_generation(project)
            elif message_type == MessageType.CHANGE_REQUEST:
                return await self._handle_frontend_change(
                    project, message
                )
            else:
                return (
                    "Review your frontend in the preview. "
                    "Say 'looks good' to build the backend, "
                    "or describe any changes you want."
                )

        elif state == ConversationState.LIVE:
            return await self._handle_live_change(project, message)

        elif StateMachine(project.state).is_generating():
            return (
                "I'm currently generating your project. "
                "I'll let you know when it's ready."
            )

        return "I'm not sure what to do next. Can you clarify?"

    # ── Research & Architecture ───────────────────────

    async def _handle_brief(
        self, project: Project, brief: str
    ) -> str:
        """Run research and architecture, present plan."""
        sm = StateMachine(project.state)
        sm.transition(ConversationState.RESEARCHING)
        project.state = sm.state
        await db.save_project(project)

        await db.save_activity(
            project.id, "researching",
            "Analyzing your brief and selecting tech stack..."
        )

        # Research
        await self._ensure_active(project.id)
        result = await self.research.analyze(brief)
        tech_stack = result["tech_stack"]
        warnings = result["warnings"]

        await db.save_activity(
            project.id, "tech_stack_selected",
            f"Tech stack selected: {tech_stack.language}, "
            f"{tech_stack.framework}, {tech_stack.database}"
        )

        # Architecture
        await self._ensure_active(project.id)
        await db.save_activity(
            project.id, "architecting",
            "Designing application architecture..."
        )
        master = await self.architect.design(brief, tech_stack)
        project.name = master.project_name

        await self._ensure_active(project.id)
        await db.save_activity(
            project.id, "architecture_complete",
            f"Architecture complete: {len(master.components)} components, "
            f"{len(master.api_endpoints)} endpoints"
        )

        # File manifest
        await db.save_activity(
            project.id, "planning_files",
            "Planning files to generate..."
        )
        await self._ensure_active(project.id)
        manifest = await self.manifest_generator.generate(
            master, tech_stack
        )

        # Save to project
        project.tech_stack = tech_stack
        project.master_document = master
        project.file_manifest = manifest

        # Transition to plan approval
        sm.transition(ConversationState.PLAN_APPROVAL)
        project.state = sm.state
        await db.save_project(project)

        # Build plan summary for user
        warning_text = ""
        if warnings:
            warning_text = "\n\n⚠️  " + "\n⚠️  ".join(warnings)

        components_text = "\n".join(
            f"  • {c.name}" for c in master.components
        )
        endpoints_text = "\n".join(
            f"  • {e.method} {e.path}"
            for e in master.api_endpoints[:6]
        )
        if len(master.api_endpoints) > 6:
            endpoints_text += f"\n  • ... and {len(master.api_endpoints) - 6} more"

        total_files = len(manifest.all_files())

        return (
            f"Here's what I'm going to build:\n\n"
            f"**{master.project_name}**\n"
            f"{master.project_summary}\n\n"
            f"**Tech stack:** {tech_stack.language} · "
            f"{tech_stack.framework} · {tech_stack.database}\n\n"
            f"**Components:**\n{components_text}\n\n"
            f"**API endpoints:**\n{endpoints_text}\n\n"
            f"**Files to generate:** {total_files}\n"
            f"{warning_text}\n\n"
            f"Say **'looks good'** to start building, "
            f"or tell me what you'd like to change."
        )

    async def _revise_plan(
        self, project: Project, change: str
    ) -> str:
        """Re-run architecture with a change request."""
        await db.save_activity(
            project.id, "plan_revision",
            f"Revising plan: {change[:100]}"
        )
        revised_brief = f"{project.brief}\n\nAdditional requirement: {change}"
        return await self._handle_brief(project, revised_brief)

    # ── Frontend Generation ───────────────────────────

    async def _start_frontend_generation(
        self, project: Project, change_request: str = ""
    ) -> str:
        """Begin frontend generation."""
        sm = StateMachine(project.state)
        if sm.state != ConversationState.GENERATING_FRONTEND:
            sm.transition(ConversationState.GENERATING_FRONTEND)
        project.state = sm.state
        await db.save_project(project)

        output_dir = str(
            Path(OUTPUT_BASE_DIR) / project.id
        )

        await db.save_activity(
            project.id, "generating_frontend",
            "Generating frontend files..."
        )

        async def on_file_written(gf: GeneratedFile):
            await self._ensure_active(project.id)
            await db.save_activity(
                project.id, "file_written",
                f"Written: {gf.path}",
                {"path": gf.path, "bytes": gf.bytes, "layer": "frontend"}
            )

        fe_files = await self.generation.generate_frontend(
            master=project.master_document,
            tech_stack=project.tech_stack,
            manifest=project.file_manifest,
            output_dir=output_dir,
            on_file_written=on_file_written,
            change_request=change_request,
        )

        if len(fe_files) == 0:
            sm.transition(ConversationState.PLAN_APPROVAL)
            project.state = sm.state
            await db.save_project(project)
            await db.save_activity(
                project.id, "error",
                "Frontend generation failed — no files were written",
            )
            return (
                "Frontend generation failed — no files were written.\n\n"
                "This usually means the AI response was too large to parse. "
                "Say **'looks good'** to retry, or ask for a simpler scope."
            )

        project.generated_files = fe_files

        sm.transition(ConversationState.FRONTEND_APPROVAL)
        project.state = sm.state
        await db.save_project(project)

        await db.save_activity(
            project.id, "frontend_complete",
            f"Frontend ready: {len(fe_files)} files generated"
        )

        return (
            f"Your frontend is ready — "
            f"{len(fe_files)} files generated.\n\n"
            f"Review it in the preview panel. "
            f"Say **'looks good'** to build the backend, "
            f"or describe any changes you want to make."
        )

    async def _handle_frontend_change(
        self, project: Project, change: str
    ) -> str:
        """Apply a change to the frontend."""
        await db.save_activity(
            project.id, "frontend_change",
            f"Applying change: {change[:100]}"
        )
        project.brief = f"{project.brief}\n\nFrontend change: {change}"
        await db.save_project(project)
        return await self._start_frontend_generation(
            project, change_request=change
        )

    # ── Backend Generation ────────────────────────────

    async def _start_backend_generation(
        self, project: Project
    ) -> str:
        """Begin backend generation."""
        sm = StateMachine(project.state)
        sm.transition(ConversationState.GENERATING_BACKEND)
        project.state = sm.state
        await db.save_project(project)

        output_dir = str(
            Path(OUTPUT_BASE_DIR) / project.id
        )

        await db.save_activity(
            project.id, "generating_backend",
            "Generating backend files..."
        )

        async def on_file_written(gf: GeneratedFile):
            await self._ensure_active(project.id)
            await db.save_activity(
                project.id, "file_written",
                f"Written: {gf.path}",
                {"path": gf.path, "bytes": gf.bytes, "layer": "backend"}
            )

        be_files = await self.generation.generate_backend(
            master=project.master_document,
            tech_stack=project.tech_stack,
            manifest=project.file_manifest,
            frontend_files=project.generated_files,
            output_dir=output_dir,
            on_file_written=on_file_written,
        )

        project.generated_files += be_files

        # Run static validation
        await db.save_activity(
            project.id, "validating",
            "Validating frontend/backend wiring..."
        )

        fe_files = [
            f for f in project.generated_files
            if f.layer == "frontend"
        ]
        validation = self.validator.validate(
            fe_files, be_files, project.master_document
        )
        project.validation_result = validation

        sm.transition(ConversationState.COMPLETE)
        project.state = sm.state
        await db.save_project(project)

        if validation.passed:
            await db.save_activity(
                project.id, "complete",
                "Project complete — all checks passed"
            )
            return (
                f"Your project is complete! "
                f"{len(be_files)} backend files generated.\n\n"
                f"✓ All validation checks passed.\n\n"
                f"Download your project or continue "
                f"making changes via chat."
            )
        else:
            errors = [
                i for i in validation.issues
                if i.severity == "error"
            ]
            error_text = "\n".join(
                f"  • {i.description}" for i in errors[:3]
            )
            return (
                f"Project generated with {len(errors)} issue(s) "
                f"to review:\n{error_text}\n\n"
                f"You can still download it or describe "
                f"what to fix."
            )

    # ── Live Mode ─────────────────────────────────────

    async def _handle_live_change(
        self, project: Project, change: str
    ) -> str:
        """Handle a change request on a live project."""
        await db.save_activity(
            project.id, "live_change",
            f"Change requested: {change[:100]}"
        )
        return (
            f"Change request received: '{change}'\n\n"
            f"Analyzing impact and applying fix... "
            f"(Live mode patches coming in next update)"
        )

    # ── Questions ─────────────────────────────────────

    async def _answer_question(
        self, project: Project, question: str
    ) -> str:
        """Answer a question about the project or ForgeAI."""
        resp = await self.llm.complete(
            system_prompt=(
                "You are ForgeAI's Lead Agent. "
                "Answer questions about the project being built "
                "or about how ForgeAI works. "
                "Be concise and helpful. "
                "Never make up features that don't exist."
            ),
            user_message=(
                f"Project: {project.brief[:200]}\n"
                f"Current state: {project.state}\n\n"
                f"User question: {question}"
            ),
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
        )
        return resp.content
