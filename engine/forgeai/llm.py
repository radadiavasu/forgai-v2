import anthropic
from dataclasses import dataclass
import asyncio
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
        """
        Call Claude and return the full response.

        Uses streaming so long generations (>10 min) are allowed by the API.
        """

        def _call() -> anthropic.types.Message:
            with self.client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            ) as stream:
                for _ in stream.text_stream:
                    pass
                return stream.get_final_message()

        response = await asyncio.to_thread(_call)
        text = "".join(
            block.text
            for block in response.content
            if block.type == "text"
        )
        return LLMResponse(
            content=text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            model=response.model,
        )
