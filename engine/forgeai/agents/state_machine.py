from ..models.schemas import ConversationState
from datetime import datetime


# Valid state transitions
TRANSITIONS = {
    ConversationState.WAITING_BRIEF: [
        ConversationState.RESEARCHING,
    ],
    ConversationState.RESEARCHING: [
        ConversationState.PLAN_APPROVAL,
    ],
    ConversationState.PLAN_APPROVAL: [
        ConversationState.GENERATING_FRONTEND,
        ConversationState.RESEARCHING,  # user wants changes to plan
    ],
    ConversationState.GENERATING_FRONTEND: [
        ConversationState.FRONTEND_APPROVAL,
    ],
    ConversationState.FRONTEND_APPROVAL: [
        ConversationState.GENERATING_BACKEND,
        ConversationState.GENERATING_FRONTEND,  # user wants FE changes
    ],
    ConversationState.GENERATING_BACKEND: [
        ConversationState.COMPLETE,
    ],
    ConversationState.COMPLETE: [
        ConversationState.LIVE,
    ],
    ConversationState.LIVE: [
        ConversationState.LIVE,  # change requests loop here
    ],
}


class StateMachine:

    def __init__(self, current_state: ConversationState = ConversationState.WAITING_BRIEF):
        self.state = current_state
        self.history: list[dict] = []

    def can_transition(self, to_state: ConversationState) -> bool:
        allowed = TRANSITIONS.get(self.state, [])
        return to_state in allowed

    def transition(self, to_state: ConversationState, reason: str = "") -> bool:
        if not self.can_transition(to_state):
            return False
        self.history.append({
            "from": self.state,
            "to": to_state,
            "reason": reason,
            "timestamp": datetime.utcnow().isoformat(),
        })
        self.state = to_state
        return True

    def current(self) -> ConversationState:
        return self.state

    def is_generating(self) -> bool:
        return self.state in (
            ConversationState.GENERATING_FRONTEND,
            ConversationState.GENERATING_BACKEND,
        )

    def is_waiting_for_human(self) -> bool:
        return self.state in (
            ConversationState.PLAN_APPROVAL,
            ConversationState.FRONTEND_APPROVAL,
        )

    def is_complete(self) -> bool:
        return self.state in (
            ConversationState.COMPLETE,
            ConversationState.LIVE,
        )
