import json

from crewai import Agent, Task

_COMMON_RULES = (
    "CRITICAL OUTPUT RULES:\n"
    "- NEVER include organization IDs, UUIDs, internal identifiers, or raw system IDs in output\n"
    "- Refer to the user or session in human-readable terms only (e.g. 'the user', 'this session')\n"
    "- Be concise: each 'description' field must be 1-2 sentences maximum\n"
    "- Each 'summary' must be a single, actionable sentence describing the fix or impact\n"
    "- Name friction points descriptively (e.g. 'Checkout Form Abandonment', not 'friction_1')\n"
    "- Output ONLY valid JSON — no markdown, no extra text\n"
)


def create_usability_analysis_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=(
            f"Identify usability friction points from {len(events)} session events.\n\n"
            f"Detect:\n"
            f"1. UI confusion signals (rage clicks, rapid backtracking, repeated failed actions)\n"
            f"2. Form friction (abandonment points, validation error loops)\n"
            f"3. Navigation dead ends and broken flows\n"
            f"4. Device-specific issues (mobile tap targets, desktop hover dependencies)\n\n"
            f"Session events:\n{events_json}\n\n"
            f"{_COMMON_RULES}\n"
            f"Output structure:\n"
            f'{{"interactions": [{{"type": "usability_analysis", "category": "friction", '
            f'"description": "one or two sentence finding", "summary": "single actionable fix recommendation", '
            f'"confidence": 0.80, "metrics": {{"friction_score": 0.5, "severity": "high|medium|low"}}, '
            f'"patterns": ["Descriptive Friction Pattern Name"]}}]}}'
        ),
        expected_output=(
            "JSON object with named friction points (descriptive titles), severity ratings, "
            "affected UI elements in plain language, and a concrete recommended fix per finding"
        ),
        agent=agent,
    )
