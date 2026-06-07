from ..models.schemas import (
    MasterDocument, FileManifest, ManifestFile, TechStack
)
from ..llm import LLMClient
import json


MANIFEST_PROMPT = """You are a software architect.
Given a project's Master Document and tech stack,
produce the complete list of files that need to be created.

Rules:
- Include every file needed for the project to run
- One route file per logical endpoint group (auth, tasks, users etc)
- One page component per distinct user-facing screen
- Do not include test files
- Do not include files not needed by this specific project
- Use the actual project requirements — do not invent extra pages
- File paths must be relative to project root

Output ONLY a JSON object with this structure:
{
  "frontend_files": [
    {"path": "src/pages/PageName.jsx", "purpose": "what this page does"}
  ],
  "backend_files": [
    {"path": "src/routes/group.js", "purpose": "what endpoints this handles"}
  ]
}

Do not include config files — those are handled separately.
Do not add markdown. Output only the JSON object."""


class FileManifestGenerator:

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def generate(
        self,
        master: MasterDocument,
        tech_stack: TechStack,
    ) -> FileManifest:
        """
        Generate FileManifest from MasterDocument.
        LLM determines project-specific files.
        Universal files are added deterministically.
        """
        # Step 1 — LLM determines project-specific files
        project_files = await self._generate_project_files(
            master, tech_stack
        )

        # Step 2 — Add universal files deterministically
        frontend_files = (
            self._universal_frontend_files(tech_stack)
            + project_files["frontend_files"]
        )
        backend_files = (
            self._universal_backend_files(tech_stack)
            + project_files["backend_files"]
        )
        config_files = self._config_files(tech_stack)

        return FileManifest(
            frontend_files=self._deduplicate(frontend_files),
            backend_files=self._deduplicate(backend_files),
            config_files=config_files,
        )

    async def _generate_project_files(
        self,
        master: MasterDocument,
        tech_stack: TechStack,
    ) -> dict:
        """Ask LLM what project-specific files are needed."""

        # Build a concise summary of the master document
        endpoints_summary = "\n".join(
            f"  {e.method} {e.path} — {e.description}"
            for e in master.api_endpoints
        )
        components_summary = "\n".join(
            f"  {c.name}: {c.responsibility}"
            for c in master.components
        )

        resp = await self.llm.complete(
            system_prompt=MANIFEST_PROMPT,
            user_message=f"""Project: {master.project_name}
Summary: {master.project_summary}

Components:
{components_summary}

API Endpoints:
{endpoints_summary}

Tech Stack: {tech_stack.language}, {tech_stack.framework}, {tech_stack.database}

List all project-specific files needed.""",
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
        )

        try:
            raw = resp.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1]
                raw = raw.rsplit("```", 1)[0]
            data = json.loads(raw)

            frontend = [
                ManifestFile(
                    path=f["path"],
                    purpose=f["purpose"],
                    layer="frontend",
                )
                for f in data.get("frontend_files", [])
            ]
            backend = [
                ManifestFile(
                    path=f["path"],
                    purpose=f["purpose"],
                    layer="backend",
                )
                for f in data.get("backend_files", [])
            ]
            return {"frontend_files": frontend, "backend_files": backend}

        except Exception:
            # Safe fallback — minimal viable set
            return {
                "frontend_files": [
                    ManifestFile(
                        path="src/pages/Home.jsx",
                        purpose="Main application page",
                        layer="frontend",
                    )
                ],
                "backend_files": [
                    ManifestFile(
                        path="src/routes/api.js",
                        purpose="API route handlers",
                        layer="backend",
                    )
                ],
            }

    def _universal_frontend_files(
        self, tech_stack: TechStack
    ) -> list[ManifestFile]:
        """Files every React frontend needs — always the same."""
        return [
            ManifestFile(
                path="index.html",
                purpose="Vite entry point",
                layer="frontend",
            ),
            ManifestFile(
                path="src/main.jsx",
                purpose="React root mount",
                layer="frontend",
            ),
            ManifestFile(
                path="src/App.jsx",
                purpose="React Router — all page routes",
                layer="frontend",
            ),
            ManifestFile(
                path="src/index.css",
                purpose="Tailwind CSS directives",
                layer="frontend",
            ),
            ManifestFile(
                path="src/api/client.js",
                purpose="API wrapper for all backend calls",
                layer="frontend",
            ),
            ManifestFile(
                path="src/components/Layout.jsx",
                purpose="Shared layout with navigation",
                layer="frontend",
            ),
            ManifestFile(
                path="package.json",
                purpose="Frontend dependencies and scripts",
                layer="frontend",
            ),
            ManifestFile(
                path="vite.config.js",
                purpose="Vite configuration",
                layer="frontend",
            ),
            ManifestFile(
                path="tailwind.config.js",
                purpose="Tailwind configuration",
                layer="frontend",
            ),
            ManifestFile(
                path="postcss.config.js",
                purpose="PostCSS configuration",
                layer="frontend",
            ),
        ]

    def _universal_backend_files(
        self, tech_stack: TechStack
    ) -> list[ManifestFile]:
        """Files every backend needs — always the same."""
        lang = tech_stack.language.lower()
        is_js = "javascript" in lang or "typescript" in lang

        if is_js:
            files = [
                ManifestFile(
                    path="src/server.js",
                    purpose="Express server entry point",
                    layer="backend",
                ),
                ManifestFile(
                    path="src/db.js",
                    purpose="Database connection pool",
                    layer="backend",
                ),
                ManifestFile(
                    path="src/routes/index.js",
                    purpose="Mounts all route modules",
                    layer="backend",
                ),
                ManifestFile(
                    path="migrations/001_init.sql",
                    purpose="Initial database schema",
                    layer="backend",
                ),
                ManifestFile(
                    path="package.json",
                    purpose="Backend dependencies and scripts",
                    layer="backend",
                ),
            ]
        else:
            files = [
                ManifestFile(
                    path="src/main.py",
                    purpose="FastAPI entry point",
                    layer="backend",
                ),
                ManifestFile(
                    path="src/database.py",
                    purpose="Database connection",
                    layer="backend",
                ),
                ManifestFile(
                    path="migrations/001_init.sql",
                    purpose="Initial database schema",
                    layer="backend",
                ),
                ManifestFile(
                    path="requirements.txt",
                    purpose="Python dependencies",
                    layer="backend",
                ),
            ]

        return files

    def _config_files(
        self, tech_stack: TechStack
    ) -> list[ManifestFile]:
        """Config files every project needs."""
        return [
            ManifestFile(
                path="docker-compose.yml",
                purpose="Orchestrates all services",
                layer="config",
            ),
            ManifestFile(
                path="Dockerfile",
                purpose="Application container build",
                layer="config",
            ),
            ManifestFile(
                path=".env.example",
                purpose="Required environment variables",
                layer="config",
            ),
        ]

    def _deduplicate(
        self, files: list[ManifestFile]
    ) -> list[ManifestFile]:
        """Remove duplicate paths keeping first occurrence."""
        seen = set()
        result = []
        for f in files:
            if f.path not in seen:
                seen.add(f.path)
                result.append(f)
        return result


class ContentValidator:
    """
    Validates that generated file content is actual code,
    not agent commentary or placeholder text.
    """

    COMMENTARY_PHRASES = (
        "wait, let me",
        "let me reconsider",
        "let me provide",
        "now let me",
        "actually,",
        "i need to",
        "upon reflection",
        "looking at this",
        "i should clarify",
        "here is the",
        "here's the",
        "certainly,",
        "of course,",
        "sure,",
    )

    MIN_CONTENT_BYTES = {
        ".html": 50,
        ".jsx": 100,
        ".js": 100,
        ".py": 50,
        ".sql": 30,
        ".json": 20,
        ".yml": 30,
        ".yaml": 30,
        ".css": 10,
        ".md": 10,
    }

    def is_valid(self, path: str, content: str) -> bool:
        """Returns True if content looks like real code."""
        if not content or not content.strip():
            return False

        lower = content.strip().lower()

        # Reject commentary
        for phrase in self.COMMENTARY_PHRASES:
            if lower.startswith(phrase) or lower[:200].startswith(phrase):
                return False

        # Check minimum size by file type
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        min_bytes = self.MIN_CONTENT_BYTES.get(ext, 20)
        if len(content.strip()) < min_bytes:
            return False

        # File-type specific checks
        if path.endswith(".jsx") or path.endswith(".js"):
            has_code = any(
                kw in content for kw in (
                    "import ", "export ", "const ", "function ",
                    "class ", "require(", "module.exports",
                )
            )
            if not has_code:
                return False

        if path.endswith(".py"):
            has_code = any(
                kw in content for kw in (
                    "import ", "from ", "def ", "class ",
                    "async def",
                )
            )
            if not has_code:
                return False

        if path.endswith(".sql"):
            has_code = any(
                kw in content.upper() for kw in (
                    "CREATE ", "INSERT ", "SELECT ", "ALTER ",
                    "DROP ", "--",
                )
            )
            if not has_code:
                return False

        if path.endswith(".html"):
            if "<" not in content or ">" not in content:
                return False

        if path.endswith(".json"):
            try:
                import json
                json.loads(content)
            except Exception:
                return False

        if path.endswith(".yml") or path.endswith(".yaml"):
            if ":" not in content:
                return False

        return True

    def rejection_reason(self, path: str, content: str) -> str:
        """Returns why content was rejected."""
        if not content or not content.strip():
            return "empty content"

        lower = content.strip().lower()
        for phrase in self.COMMENTARY_PHRASES:
            if lower[:200].startswith(phrase):
                return f"agent commentary detected: '{phrase}'"

        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        min_bytes = self.MIN_CONTENT_BYTES.get(ext, 20)
        if len(content.strip()) < min_bytes:
            return f"too short: {len(content.strip())} bytes, minimum {min_bytes}"

        return "failed code pattern check"


class ContentValidator:
    """
    Validates that generated file content is actual code,
    not agent commentary or placeholder text.
    """

    COMMENTARY_PHRASES = (
        "wait, let me",
        "let me reconsider",
        "let me provide",
        "now let me",
        "actually,",
        "i need to",
        "upon reflection",
        "looking at this",
        "i should clarify",
        "here is the",
        "here's the",
        "certainly,",
        "of course,",
        "sure,",
    )

    MIN_CONTENT_BYTES = {
        ".html": 50,
        ".jsx": 100,
        ".js": 100,
        ".py": 50,
        ".sql": 30,
        ".json": 20,
        ".yml": 30,
        ".yaml": 30,
        ".css": 10,
        ".md": 10,
    }

    def is_valid(self, path: str, content: str) -> bool:
        """Returns True if content looks like real code."""
        if not content or not content.strip():
            return False

        lower = content.strip().lower()

        # Reject commentary
        for phrase in self.COMMENTARY_PHRASES:
            if lower.startswith(phrase) or lower[:200].startswith(phrase):
                return False

        # Check minimum size by file type
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        min_bytes = self.MIN_CONTENT_BYTES.get(ext, 20)
        if len(content.strip()) < min_bytes:
            return False

        # File-type specific checks
        if path.endswith(".jsx") or path.endswith(".js"):
            has_code = any(
                kw in content for kw in (
                    "import ", "export ", "const ", "function ",
                    "class ", "require(", "module.exports",
                )
            )
            if not has_code:
                return False

        if path.endswith(".py"):
            has_code = any(
                kw in content for kw in (
                    "import ", "from ", "def ", "class ",
                    "async def",
                )
            )
            if not has_code:
                return False

        if path.endswith(".sql"):
            has_code = any(
                kw in content.upper() for kw in (
                    "CREATE ", "INSERT ", "SELECT ", "ALTER ",
                    "DROP ", "--",
                )
            )
            if not has_code:
                return False

        if path.endswith(".html"):
            if "<" not in content or ">" not in content:
                return False

        if path.endswith(".json"):
            try:
                import json
                json.loads(content)
            except Exception:
                return False

        if path.endswith(".yml") or path.endswith(".yaml"):
            if ":" not in content:
                return False

        return True

    def rejection_reason(self, path: str, content: str) -> str:
        """Returns why content was rejected."""
        if not content or not content.strip():
            return "empty content"

        lower = content.strip().lower()
        for phrase in self.COMMENTARY_PHRASES:
            if lower[:200].startswith(phrase):
                return f"agent commentary detected: '{phrase}'"

        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        min_bytes = self.MIN_CONTENT_BYTES.get(ext, 20)
        if len(content.strip()) < min_bytes:
            return f"too short: {len(content.strip())} bytes, minimum {min_bytes}"

        return "failed code pattern check"
