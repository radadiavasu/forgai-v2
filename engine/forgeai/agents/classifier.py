from ..models.schemas import ClassifiedMessage, MessageType
from ..llm import LLMClient
import json


CLASSIFIER_PROMPT = """You are a message classifier for ForgeAI,
an AI system that builds software projects.

Classify the user message into exactly one of these types:
- BRIEF: User is describing a software project they want built
- APPROVAL: User is approving something (yes, looks good, perfect, go ahead, build it, continue)
- CHANGE_REQUEST: User wants to modify something already shown
- QUESTION: User is asking a question about the system or their project
- OFF_TOPIC: Message has nothing to do with building software
- UNCLEAR: Cannot determine intent

Also extract the core intent in one sentence.

Respond ONLY with this JSON, nothing else:
{
  "type": "BRIEF|APPROVAL|CHANGE_REQUEST|QUESTION|OFF_TOPIC|UNCLEAR",
  "confidence": 0.0-1.0,
  "extracted_intent": "one sentence describing what user wants"
}"""


class MessageClassifier:

    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def classify(self, message: str) -> ClassifiedMessage:
        """Classify a user message. Returns ClassifiedMessage."""

        resp = await self.llm.complete(
            system_prompt=CLASSIFIER_PROMPT,
            user_message=message,
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
        )

        try:
            raw = resp.content.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1]
                raw = raw.rsplit("```", 1)[0]
            data = json.loads(raw)
            return ClassifiedMessage(
                original=message,
                type=MessageType(data["type"]),
                confidence=float(data["confidence"]),
                extracted_intent=data.get("extracted_intent", ""),
            )
        except Exception:
            # Safe fallback
            return ClassifiedMessage(
                original=message,
                type=MessageType.UNCLEAR,
                confidence=0.5,
                extracted_intent=message[:100],
            )

    def is_approval(self, message: str) -> bool:
        """Quick check without LLM for obvious approvals."""
        approvals = {
            "yes", "ok", "okay", "sure", "go", "good",
            "great", "perfect", "looks good", "build it",
            "continue", "proceed", "let's go", "do it",
            "start", "go ahead", "approved", "nice",
            "yep", "yeah", "yup", "correct", "right",
            "exactly", "fine", "works", "done", "next",
            "ship it", "lgtm", "👍"
        }
        return message.strip().lower() in approvals
