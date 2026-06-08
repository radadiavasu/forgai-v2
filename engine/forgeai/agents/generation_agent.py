from ..models.schemas import (
    MasterDocument, FileManifest, ManifestFile,
    TechStack, GeneratedFile
)
from ..generation.file_manifest import ContentValidator
from ..llm import LLMClient
from pathlib import Path
import json
import re


FRONTEND_GENERATION_PROMPT = """You are a senior frontend developer.
You generate complete, production-ready React applications.

Rules:
1. Generate EVERY file listed in the file manifest
2. Every file must be complete — no placeholders, no TODOs
3. Files must work together as one coherent application
4. Use only the libraries listed in the tech stack
5. All data fetching must use the API client — no hardcoded data
6. All styling must use Tailwind utility classes only
7. Every page must be wrapped in the Layout component
8. React Router Links for all navigation — no <a> tags
9. Show loading and error states for all API calls
10. index.html must be in project root, not src/
11. Vite proxy target is ALWAYS http://localhost:3001
12. API base URL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api'
13. Field names must exactly match the data models provided
14. API client must unwrap { data: [] } responses
    e.g. const tasks = response.data — not response directly
15. Generate ONE package.json for frontend only
    It must include: react, react-dom, react-router-dom,
    vite, @vitejs/plugin-react, tailwindcss, postcss, autoprefixer
16. Do NOT generate main.jsx AND index.jsx — use main.jsx only
17. src/main.jsx is the ONLY entry point

Output ONLY a JSON object. No explanation. No markdown.
Format:
{
  "files": [
    {"path": "index.html", "content": "...full content..."},
    {"path": "src/main.jsx", "content": "...full content..."}
  ]
}

Every file in the manifest must appear in the output."""


BACKEND_GENERATION_PROMPT = """You are a senior backend developer.
You generate complete, production-ready Express.js applications.

Rules:
1. Generate EVERY file listed in the file manifest
2. Every file must be complete — no placeholders, no TODOs
3. All files must work together as one coherent application
4. src/server.js must import routes from src/routes/index.js
5. src/routes/index.js must import and mount all route files
6. Every route file uses express.Router() and exports the router
7. src/db.js exports a query() function using the connection pool
8. Use process.env.PORT and process.env.DATABASE_URL
9. CORS must be configured before routes
10. migrations/001_init.sql must create all tables from data models
11. Backend port is ALWAYS 3001. Use process.env.PORT || 3001
12. All list endpoints return { data: [] } — never raw arrays
13. All single item endpoints return { data: {} }
14. Field names must exactly match the data models in the spec
15. Dockerfile must use npm install not npm ci
16. Generate ONE package.json for backend only
    It must NOT include react, vite, or frontend dependencies
17. CORS must allow http://localhost:3000
18. Do NOT generate duplicate DB files — one src/db.js only
19. Do NOT generate duplicate migration files — one only
20. Add a README.md with exact run steps:
    npm install, npm run dev, and docker compose up

Output ONLY a JSON object. No explanation. No markdown.
Format:
{
  "files": [
    {"path": "src/server.js", "content": "...full content..."},
    {"path": "src/db.js", "content": "...full content..."}
  ]
}

Every file in the manifest must appear in the output."""


class GenerationAgent:

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.validator = ContentValidator()

    async def generate_frontend(
        self,
        master: MasterDocument,
        tech_stack: TechStack,
        manifest: FileManifest,
        output_dir: str,
        on_file_written=None,
    ) -> list[GeneratedFile]:
        """
        Generate all frontend files in one LLM call.
        Validates each file. Retries invalid files once.
        Returns list of GeneratedFile.
        """
        file_list = "\n".join(
            f"  - {f.path}: {f.purpose}"
            for f in manifest.frontend_files
        )
        endpoints = "\n".join(
            f"  {e.method} {e.path} — {e.description}"
            for e in master.api_endpoints
        )
        components_detail = "\n".join(
            f"  {c.name}:\n    {chr(10).join('    - ' + a for a in c.acceptance_criteria)}"
            for c in master.components
            if "frontend" in c.name.lower() or "react" in c.name.lower()
        )

        user_message = f"""Generate the complete frontend for this project.

Project: {master.project_name}
Summary: {master.project_summary}

Tech Stack:
  Language: {tech_stack.language}
  Framework: {tech_stack.framework}
  Libraries: {', '.join(tech_stack.libraries)}

Files to generate:
{file_list}

Backend API endpoints your frontend must call:
{endpoints}

Frontend requirements:
{components_detail}

API base URL: use import.meta.env.VITE_API_URL ?? '/api'

Generate every file listed above. Each file must be complete
and production-ready."""

        raw_files = await self._call_with_retry(
            system_prompt=FRONTEND_GENERATION_PROMPT,
            user_message=user_message,
            manifest_files=manifest.frontend_files,
            layer="frontend",
        )

        return await self._write_files(
            raw_files, output_dir, "frontend", on_file_written
        )

    async def generate_backend(
        self,
        master: MasterDocument,
        tech_stack: TechStack,
        manifest: FileManifest,
        frontend_files: list[GeneratedFile],
        output_dir: str,
        on_file_written=None,
    ) -> list[GeneratedFile]:
        """
        Generate all backend files in one LLM call.
        Receives frontend files so backend can see what
        API calls the frontend makes.
        """
        file_list = "\n".join(
            f"  - {f.path}: {f.purpose}"
            for f in manifest.backend_files + manifest.config_files
        )
        endpoints = "\n".join(
            f"  {e.method} {e.path}\n"
            f"    Request: {json.dumps(e.request_schema)}\n"
            f"    Response: {json.dumps(e.response_schema)}\n"
            f"    Auth required: {e.requires_auth}"
            for e in master.api_endpoints
        )
        data_models = "\n".join(
            f"  {m.name}: " + ", ".join(
                f"{f.name}({f.type}{'*' if f.required else ''})"
                for f in m.fields
            )
            for m in master.data_models
        )

        # Show backend what the frontend is calling
        fe_api_calls = self._extract_api_calls(frontend_files)
        fe_context = ""
        if fe_api_calls:
            fe_context = f"""
Frontend API calls (your backend must handle all of these):
{chr(10).join('  ' + call for call in fe_api_calls)}"""

        user_message = f"""Generate the complete backend for this project.

Project: {master.project_name}
Summary: {master.project_summary}

Tech Stack:
  Language: {tech_stack.language}
  Framework: {tech_stack.framework}
  Database: {tech_stack.database}
  Libraries: {', '.join(tech_stack.libraries)}

Files to generate:
{file_list}

API endpoints to implement:
{endpoints}

Data models:
{data_models}
{fe_context}

Backend port: 3001
Frontend port: 3000
Database: use DATABASE_URL environment variable

Generate every file listed above. Each file must be complete
and production-ready."""

        fields_text = "\n".join(
            f"  {m.name}: " + ", ".join(
                f.name for f in m.fields
            )
            for m in master.data_models
        )
        user_message += f"""

EXACT FIELD NAMES — use these everywhere, no variations:
{fields_text}

These field names must be identical in:
- PostgreSQL schema
- API request/response JSON
- Frontend state and forms
"""

        raw_files = await self._call_with_retry(
            system_prompt=BACKEND_GENERATION_PROMPT,
            user_message=user_message,
            manifest_files=manifest.backend_files + manifest.config_files,
            layer="backend",
        )

        return await self._write_files(
            raw_files, output_dir, "backend", on_file_written
        )

    async def _call_with_retry(
        self,
        system_prompt: str,
        user_message: str,
        manifest_files: list[ManifestFile],
        layer: str,
        max_attempts: int = 3,
    ) -> list[dict]:
        """
        Call LLM and parse response.
        Retries up to max_attempts if parsing fails.
        """
        for attempt in range(1, max_attempts + 1):
            resp = await self.llm.complete(
                system_prompt=system_prompt,
                user_message=user_message,
                model="claude-sonnet-4-6",
                max_tokens=16000,
            )

            files = self._parse_response(resp.content)
            if files:
                return files

            if attempt < max_attempts:
                user_message += (
                    f"\n\nPrevious attempt failed to parse. "
                    f"Output ONLY the JSON object with a 'files' array. "
                    f"No markdown fences. No explanation text."
                )

        return []

    def _parse_response(self, content: str) -> list[dict]:
        """Parse LLM response into list of file dicts."""
        raw = content.strip()

        # Strip markdown fences
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw.strip())
        raw = raw.strip()

        try:
            data = json.loads(raw)
            return data.get("files", [])
        except json.JSONDecodeError:
            # Try to extract JSON object
            match = re.search(r'\{[\s\S]*\}', raw)
            if match:
                try:
                    data = json.loads(match.group(0))
                    return data.get("files", [])
                except Exception:
                    pass
        return []

    async def _write_files(
        self,
        raw_files: list[dict],
        output_dir: str,
        layer: str,
        on_file_written=None,
    ) -> list[GeneratedFile]:
        """
        Write parsed files to disk.
        Validates content before writing.
        Skips invalid files and logs reason.
        """
        root = Path(output_dir)
        root.mkdir(parents=True, exist_ok=True)
        written = []

        for f in raw_files:
            path = f.get("path", "").strip()
            content = f.get("content", "").strip()

            if not path or not content:
                continue

            if not self.validator.is_valid(path, content):
                reason = self.validator.rejection_reason(path, content)
                print(f"[GENERATION] Skipped {path}: {reason}")
                continue

            file_path = root / path
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content, encoding="utf-8")

            generated = GeneratedFile(
                path=path,
                content=content,
                layer=layer,
                bytes=len(content.encode("utf-8")),
            )
            written.append(generated)
            print(f"[GENERATION] Written: {path} ({generated.bytes} bytes)")

            if on_file_written:
                await on_file_written(generated)

        return written

    def _extract_api_calls(
        self, frontend_files: list[GeneratedFile]
    ) -> list[str]:
        """
        Extract API endpoint calls from frontend code.
        Helps backend know exactly what it needs to handle.
        """
        calls = set()
        patterns = [
            r"fetch\(['\"]([^'\"]+)['\"]",
            r"axios\.\w+\(['\"]([^'\"]+)['\"]",
            r"client\.\w+\(['\"]([^'\"]+)['\"]",
            r"api\.['\"]([^'\"]+)['\"]",
        ]
        for gf in frontend_files:
            for pattern in patterns:
                matches = re.findall(pattern, gf.content)
                for match in matches:
                    if match.startswith("/api") or "api" in match:
                        calls.add(match)
        return sorted(calls)
