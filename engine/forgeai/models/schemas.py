from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


# ── Conversation State ────────────────────────────────

class ConversationState(str, Enum):
    WAITING_BRIEF = "WAITING_BRIEF"
    RESEARCHING = "RESEARCHING"
    PLAN_APPROVAL = "PLAN_APPROVAL"
    GENERATING_FRONTEND = "GENERATING_FRONTEND"
    FRONTEND_APPROVAL = "FRONTEND_APPROVAL"
    GENERATING_BACKEND = "GENERATING_BACKEND"
    COMPLETE = "COMPLETE"
    LIVE = "LIVE"


# ── Message Classification ────────────────────────────

class MessageType(str, Enum):
    BRIEF = "BRIEF"
    APPROVAL = "APPROVAL"
    CHANGE_REQUEST = "CHANGE_REQUEST"
    QUESTION = "QUESTION"
    OFF_TOPIC = "OFF_TOPIC"
    UNCLEAR = "UNCLEAR"


class ClassifiedMessage(BaseModel):
    original: str
    type: MessageType
    confidence: float = Field(ge=0.0, le=1.0)
    extracted_intent: str = ""


# ── Tech Stack ────────────────────────────────────────

class TechStack(BaseModel):
    language: str
    framework: str
    database: str
    testing_framework: str
    libraries: list[str] = []
    rationale: str = ""
    user_specified: bool = False


# ── File Manifest ─────────────────────────────────────

class ManifestFile(BaseModel):
    path: str
    purpose: str
    layer: str  # "frontend" | "backend" | "config"


class FileManifest(BaseModel):
    frontend_files: list[ManifestFile] = []
    backend_files: list[ManifestFile] = []
    config_files: list[ManifestFile] = []

    def all_files(self) -> list[ManifestFile]:
        return self.frontend_files + self.backend_files + self.config_files


# ── Master Document ───────────────────────────────────

class Component(BaseModel):
    name: str
    responsibility: str
    acceptance_criteria: list[str] = []


class DataField(BaseModel):
    name: str
    type: str
    required: bool
    description: str = ""


class DataModel(BaseModel):
    name: str
    fields: list[DataField] = []


class APIEndpoint(BaseModel):
    method: str
    path: str
    description: str
    request_schema: dict = {}
    response_schema: dict = {}
    requires_auth: bool = False


class MasterDocument(BaseModel):
    project_name: str
    project_summary: str
    components: list[Component] = []
    data_models: list[DataModel] = []
    api_endpoints: list[APIEndpoint] = []
    tech_stack: TechStack
    constraints: list[str] = []


# ── Plan ─────────────────────────────────────────────

class ProjectPlan(BaseModel):
    master_document: MasterDocument
    file_manifest: FileManifest
    estimated_files: int = 0
    estimated_time_seconds: int = 0


# ── Generated File ────────────────────────────────────

class GeneratedFile(BaseModel):
    path: str
    content: str
    layer: str  # "frontend" | "backend" | "config"
    bytes: int = 0


# ── Validation Result ─────────────────────────────────

class ValidationIssue(BaseModel):
    severity: str  # "error" | "warning"
    file: str
    description: str
    suggestion: str = ""


class ValidationResult(BaseModel):
    passed: bool
    issues: list[ValidationIssue] = []
    files_checked: int = 0


# ── Project ───────────────────────────────────────────

class Project(BaseModel):
    id: str
    name: str
    brief: str
    state: ConversationState = ConversationState.WAITING_BRIEF
    tech_stack: Optional[TechStack] = None
    master_document: Optional[MasterDocument] = None
    file_manifest: Optional[FileManifest] = None
    generated_files: list[GeneratedFile] = []
    validation_result: Optional[ValidationResult] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ── API Request/Response ──────────────────────────────

class CreateProjectRequest(BaseModel):
    brief: str


class CreateProjectResponse(BaseModel):
    project_id: str
    message: str
    state: ConversationState


class SendMessageRequest(BaseModel):
    message: str


class SendMessageResponse(BaseModel):
    message: str
    state: ConversationState
    project: Optional[Project] = None


class ActivityEvent(BaseModel):
    type: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: dict = {}
