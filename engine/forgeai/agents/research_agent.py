from ..models.schemas import TechStack, MasterDocument, Component, DataModel, DataField, APIEndpoint
from ..llm import LLMClient
from ..utils.json_parse import parse_llm_json
import json


RESEARCH_PROMPT = """You are a senior software architect
evaluating a project brief to recommend a technology stack.

Your job:
1. Read the brief carefully
2. Identify what kind of application it is
3. Choose the simplest stack that genuinely fits the requirements
4. Explain why in one sentence

Stack selection rules:
- Prefer unified language stacks (JavaScript everywhere if frontend is React)
- Prefer PostgreSQL for structured data, MongoDB only if schema is truly flexible
- Never choose a framework because it is popular — choose because it fits
- If the user explicitly names a technology, use it
- If the user names an outdated technology, flag it as a warning
- Do not invent libraries that do not exist on npm or pip

Output a JSON object with these fields:
- language: the primary language and runtime version
- framework: the backend web framework
- database: the database engine
- testing_framework: the testing tool
- libraries: array of real, existing package names needed
- rationale: one sentence explaining the choice
- user_specified: true only if user explicitly named the stack
- warnings: array of concerns about the stack (empty if none)

Output ONLY the JSON object. No explanation before or after.
Do not copy example values — analyze the actual brief."""


ARCHITECT_PROMPT = """You are a senior software architect
designing the complete structure of a web application.

Your job:
1. Read the brief and tech stack carefully
2. Identify every user-facing feature
3. Design every component needed to deliver those features
4. Define every data model with all required fields
5. Define every API endpoint with exact request and response shapes

Design rules:
- Every frontend page the user needs must be a component
- Every data operation must have a corresponding API endpoint
- Every data model must have all fields — do not leave fields implied
- Acceptance criteria must be specific and testable, not vague
- Do not invent features the brief did not ask for
- Do not omit features the brief clearly needs
- Keep the design focused: at most 8 components, 5 data models, and 10 API endpoints
- Frontend is a React SPA (Vite + React Router) — not server-rendered HTML templates

Output a JSON object with these fields:
- project_name: short descriptive name in kebab-case
- project_summary: one paragraph describing what the app does
- components: array of component objects, each with:
    name, responsibility, acceptance_criteria (array of strings)
- data_models: array of model objects, each with:
    name, fields (array with name, type, required, description)
- api_endpoints: array of endpoint objects, each with:
    method, path, description, request_schema, response_schema, requires_auth
- constraints: array of technical constraints from the brief

Output ONLY the JSON object. No explanation before or after.
Base every decision on the actual brief — do not assume features."""


class ResearchAgent:

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def analyze(
        self,
        brief: str,
        user_stack_preference: str = "",
    ) -> dict:
        """
        Analyze brief and return tech stack recommendation.
        Returns dict with tech_stack and warnings.
        """
        preference_note = ""
        if user_stack_preference:
            preference_note = f"\nUser specified: {user_stack_preference}"

        resp = await self.llm.complete(
            system_prompt=RESEARCH_PROMPT,
            user_message=f"""Analyze this brief and output the JSON object as specified.
Brief: {brief}{preference_note}""",
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
        )

        try:
            data = parse_llm_json(resp.content)
            tech_stack = TechStack(
                language=data["language"],
                framework=data["framework"],
                database=data["database"],
                testing_framework=data["testing_framework"],
                libraries=data.get("libraries", []),
                rationale=data.get("rationale", ""),
                user_specified=data.get("user_specified", False),
            )
            return {
                "tech_stack": tech_stack,
                "warnings": data.get("warnings", []),
            }
        except Exception as e:
            # Safe fallback
            return {
                "tech_stack": TechStack(
                    language="JavaScript (Node.js 20)",
                    framework="Express.js",
                    database="PostgreSQL",
                    testing_framework="Vitest",
                    libraries=["react", "express", "pg", "cors", "dotenv"],
                    rationale="Default stack for web applications",
                    user_specified=False,
                ),
                "warnings": [f"Stack analysis failed: {str(e)}"],
            }


class ArchitectAgent:

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def design(
        self,
        brief: str,
        tech_stack: TechStack,
    ) -> MasterDocument:
        """
        Design complete project structure.
        Returns MasterDocument.
        """
        resp = await self.llm.complete(
            system_prompt=ARCHITECT_PROMPT,
            user_message=f"""Design the complete project structure for this brief.
Brief: {brief}
Tech Stack: {tech_stack.language}, {tech_stack.framework},
{tech_stack.database}
Output the JSON object as specified.""",
            model="claude-sonnet-4-6",
            max_tokens=16000,
        )

        try:
            data = parse_llm_json(resp.content)

            components = [
                Component(**c) for c in data.get("components", [])
            ]
            data_models = [
                DataModel(
                    name=m["name"],
                    fields=[DataField(**f) for f in m.get("fields", [])]
                )
                for m in data.get("data_models", [])
            ]
            api_endpoints = [
                APIEndpoint(**e) for e in data.get("api_endpoints", [])
            ]

            return MasterDocument(
                project_name=data["project_name"],
                project_summary=data["project_summary"],
                components=components,
                data_models=data_models,
                api_endpoints=api_endpoints,
                tech_stack=tech_stack,
                constraints=data.get("constraints", []),
            )
        except Exception as e:
            raise ValueError(f"Architecture design failed: {e}")
