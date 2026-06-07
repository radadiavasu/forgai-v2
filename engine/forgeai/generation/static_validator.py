from ..models.schemas import (
    GeneratedFile, ValidationResult, ValidationIssue,
    MasterDocument
)
import re


class StaticValidator:
    """
    Validates that frontend and backend are properly wired.
    Checks imports, API calls, and route definitions.
    No LLM calls — pure static analysis.
    """

    def validate(
        self,
        frontend_files: list[GeneratedFile],
        backend_files: list[GeneratedFile],
        master: MasterDocument,
    ) -> ValidationResult:
        frontend_files = [
            GeneratedFile(
                path=f.path.replace("\\", "/"),
                content=f.content,
                layer=f.layer,
                bytes=f.bytes,
            )
            for f in frontend_files
        ]
        backend_files = [
            GeneratedFile(
                path=f.path.replace("\\", "/"),
                content=f.content,
                layer=f.layer,
                bytes=f.bytes,
            )
            for f in backend_files
        ]

        issues = []
        files_checked = len(frontend_files) + len(backend_files)

        # Check 1 — required frontend files exist
        issues += self._check_required_frontend_files(frontend_files)

        # Check 2 — required backend files exist
        issues += self._check_required_backend_files(backend_files)

        # Check 3 — frontend API calls match backend routes
        issues += self._check_api_wiring(
            frontend_files, backend_files, master
        )

        # Check 4 — frontend imports resolve
        issues += self._check_frontend_imports(frontend_files)

        # Check 5 — server.js imports routes
        issues += self._check_server_wiring(backend_files)

        errors = [i for i in issues if i.severity == "error"]
        passed = len(errors) == 0

        return ValidationResult(
            passed=passed,
            issues=issues,
            files_checked=files_checked,
        )

    def _check_required_frontend_files(
        self, files: list[GeneratedFile]
    ) -> list[ValidationIssue]:
        issues = []
        paths = {f.path for f in files}
        required = [
            ("index.html", "Vite needs index.html in project root"),
            ("src/main.jsx", "React needs main.jsx entry point"),
            ("src/App.jsx", "React needs App.jsx with routes"),
        ]
        for path, reason in required:
            if path not in paths:
                issues.append(ValidationIssue(
                    severity="error",
                    file=path,
                    description=f"Missing required file: {path}",
                    suggestion=reason,
                ))
        return issues

    def _check_required_backend_files(
        self, files: list[GeneratedFile]
    ) -> list[ValidationIssue]:
        issues = []
        paths = {f.path for f in files}
        required = [
            ("src/server.js", "Express needs server.js entry point"),
            ("src/db.js", "Backend needs database connection"),
            ("docker-compose.yml", "Deployment needs docker-compose.yml"),
        ]
        for path, reason in required:
            if path not in paths:
                issues.append(ValidationIssue(
                    severity="error",
                    file=path,
                    description=f"Missing required file: {path}",
                    suggestion=reason,
                ))
        return issues

    def _check_api_wiring(
        self,
        frontend_files: list[GeneratedFile],
        backend_files: list[GeneratedFile],
        master: MasterDocument,
    ) -> list[ValidationIssue]:
        issues = []

        # Extract API calls from frontend
        fe_calls = set()
        for f in frontend_files:
            calls = self._extract_api_paths(f.content)
            fe_calls.update(calls)

        # Extract routes from backend
        be_routes = set()
        for f in backend_files:
            routes = self._extract_route_definitions(f.content)
            be_routes.update(routes)

        # Check each API call has a matching route
        for call in fe_calls:
            if not self._has_matching_route(call, be_routes):
                issues.append(ValidationIssue(
                    severity="error",
                    file="frontend",
                    description=f"Frontend calls '{call}' but no matching backend route found",
                    suggestion=f"Add route handler for {call} in backend",
                ))

        # Check master document endpoints are implemented
        for endpoint in master.api_endpoints:
            path = endpoint.path
            method = endpoint.method.lower()
            if not self._route_exists(path, method, be_routes):
                issues.append(ValidationIssue(
                    severity="error",
                    file="backend",
                    description=f"Endpoint {endpoint.method} {path} not implemented",
                    suggestion=f"Add {method} handler for {path}",
                ))

        return issues

    def _check_frontend_imports(
        self, files: list[GeneratedFile]
    ) -> list[ValidationIssue]:
        issues = []
        paths = {self._normalize_separators(f.path) for f in files}

        for f in files:
            file_path = self._normalize_separators(f.path)
            if not file_path.endswith((".jsx", ".js")):
                continue
            imports = re.findall(
                r"import .+ from ['\"](\./[^'\"]+)['\"]",
                f.content
            )
            for imp in imports:
                # Resolve relative import
                base = "/".join(file_path.split("/")[:-1])
                resolved = self._normalize_separators(
                    f"{base}/{imp.lstrip('./')}"
                ).replace("//", "/")
                # Try with extensions
                found = any(
                    self._normalize_separators(resolved + ext) in paths
                    for ext in ("", ".jsx", ".js")
                )
                if not found:
                    issues.append(ValidationIssue(
                        severity="warning",
                        file=file_path,
                        description=f"Import '{imp}' may not resolve",
                        suggestion=f"Check that {resolved} exists",
                    ))

        return issues

    def _normalize_separators(self, path: str) -> str:
        return path.replace("\\", "/")

    def _check_server_wiring(
        self, files: list[GeneratedFile]
    ) -> list[ValidationIssue]:
        issues = []

        # Accept either server.js or index.js as entry point
        server = next(
            (f for f in files if f.path in (
                "src/server.js", "src/index.js", "server.js", "index.js"
            )),
            None
        )
        if server is None:
            return issues

        # If server.js is tiny (< 300 bytes), check index.js instead
        if server.path == "src/server.js" and server.bytes < 300:
            alt = next(
                (f for f in files if f.path == "src/index.js"),
                None
            )
            if alt and alt.bytes > 300:
                server = alt

        if "routes" not in server.content.lower() and \
           "router" not in server.content.lower():
            issues.append(ValidationIssue(
                severity="warning",
                file=server.path,
                description="server entry does not import routes",
                suggestion="Add: import routes from './routes/index.js'",
            ))

        if "listen" not in server.content:
            issues.append(ValidationIssue(
                severity="error",
                file=server.path,
                description="server does not start listening",
                suggestion="Add: app.listen(PORT, ...)",
            ))

        return issues

    def _extract_api_paths(self, content: str) -> set[str]:
        """Extract API paths called in frontend code."""
        paths = set()
        patterns = [
            r"['\"`](/api/[^'\"`\s?]+)",
            r"fetch\(['\"`]([^'\"`\s?]+)['\"`]",
        ]
        for pattern in patterns:
            for match in re.findall(pattern, content):
                if "/api/" in match:
                    # Normalize — remove query params and IDs
                    path = re.sub(r'\$\{[^}]+\}', ':id', match)
                    path = re.sub(r'[?#].*$', '', path)
                    paths.add(path)
        return paths

    def _extract_route_definitions(self, content: str) -> set[str]:
        """Extract route definitions from backend code."""
        routes = set()
        patterns = [
            r"router\.(get|post|put|patch|delete)\(['\"`]([^'\"`]+)['\"`]",
            r"app\.(get|post|put|patch|delete)\(['\"`]([^'\"`]+)['\"`]",
        ]
        for pattern in patterns:
            for method, path in re.findall(pattern, content):
                routes.add(f"{method.upper()} {path}")
        return routes

    def _has_matching_route(
        self, call: str, routes: set[str]
    ) -> bool:
        candidates = self._path_candidates(call)
        for route in routes:
            parts = route.split(" ", 1)
            if len(parts) != 2:
                continue
            r_path = parts[1]
            norm_route = re.sub(r':[^/]+', ':id', r_path)
            for candidate in candidates:
                norm_cand = re.sub(r':[^/]+', ':id', candidate)
                if norm_route == norm_cand:
                    return True
        return False

    def _route_exists(
        self, path: str, method: str, routes: set[str]
    ) -> bool:
        candidates = self._path_candidates(path)
        for route in routes:
            parts = route.split(" ", 1)
            if len(parts) != 2:
                continue
            r_method, r_path = parts
            if r_method.lower() != method.lower():
                continue
            norm_route = re.sub(r':[^/]+', ':id', r_path)
            for candidate in candidates:
                norm_candidate = re.sub(r':[^/]+', ':id', candidate)
                if norm_route == norm_candidate:
                    return True
        return False

    def _path_candidates(self, path: str) -> list[str]:
        """
        Generate all path variants to try matching.
        Handles /api prefix and route mounting patterns.
        """
        candidates = [path]

        # Strip /api prefix
        if path.startswith("/api/"):
            stripped = path[4:]  # /api/tasks → /tasks
            candidates.append(stripped)

            # Strip second segment (mount prefix)
            # /api/auth/login → /login
            # /api/tasks/history → /history
            parts = stripped.split("/", 2)
            if len(parts) >= 3:
                candidates.append("/" + parts[2])
            # /api/tasks → /
            elif len(parts) == 2:
                candidates.append("/")

        # Also try without leading slash
        candidates += [c.lstrip("/") for c in candidates]

        return list(set(candidates))
