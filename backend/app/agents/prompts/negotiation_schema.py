"""Anthropic tool_use schema for structured negotiation output.

Used in every Claude API call in Phase 3 via:
    client.messages.create(..., tools=[NEGOTIATION_TOOL_SCHEMA])

Defined in Phase 1 so Phase 3 has a tested contract to build against,
not a schema designed under deadline pressure.
"""

NEGOTIATION_TOOL_SCHEMA: dict = {
    "name": "negotiation_response",
    "description": "Structured response for a single negotiation round",
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "Human-readable text shown in the speech bubble",
            },
            "proposed_price": {"type": "number"},
            "action": {
                "type": "string",
                "enum": ["offer", "counter", "accept", "reject", "walk_away"],
            },
            "reasoning": {"type": "string"},
            "emotion": {
                "type": "string",
                "enum": ["friendly", "firm", "frustrated", "happy", "neutral"],
            },
        },
        "required": ["message", "proposed_price", "action", "reasoning", "emotion"],
    },
}
