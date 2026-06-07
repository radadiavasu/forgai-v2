import anthropic
from dataclasses import dataclass
import os


@dataclass
class LLMResponse:
    content: str
    input_tokens: int
    output_tokens: int
    model: str


class LLMClient:

    def __init__(self):
        self.client = anthropic.Anthropic(
            api_key=os.environ["ANTHROPIC_API_KEY"]
        )

    async def complete(
        self,
        system_prompt: str,
        user_message: str,
        model: str = "claude-sonnet-4-6",
        max_tokens: int = 8192,
    ) -> LLMResponse:
        import asyncio

        def _call():
            return self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )

        response = await asyncio.to_thread(_call)
        return LLMResponse(
            content=response.content[0].text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            model=response.model,
        )
