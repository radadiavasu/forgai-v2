import json
import re


def _strip_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _repair_truncated_json(raw: str) -> str:
    """Best-effort repair for JSON truncated mid-stream by token limits."""
    text = raw.rstrip()
    text = re.sub(r',\s*"[^"]*"?\s*:?\s*"?[^"{}[\],]*$', "", text)
    text = re.sub(r",\s*$", "", text)

    stack: list[str] = []
    in_string = False
    escape = False

    for ch in text:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in "}]" and stack and stack[-1] == ch:
            stack.pop()

    if in_string:
        text += '"'

    return text + "".join(reversed(stack))


def parse_llm_json(content: str) -> dict:
    """Parse JSON from an LLM response, tolerating fences and truncation."""
    raw = _strip_fences(content)

    attempts = [raw]
    match = re.search(r"\{[\s\S]*", raw)
    if match and match.group(0) != raw:
        attempts.append(match.group(0))
    attempts.append(_repair_truncated_json(raw))
    if match:
        attempts.append(_repair_truncated_json(match.group(0)))

    seen: set[str] = set()
    last_error: Exception | None = None
    for candidate in attempts:
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            data = json.loads(candidate)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError as exc:
            last_error = exc

    raise ValueError(
        f"Could not parse JSON from LLM response: {last_error}"
    )
