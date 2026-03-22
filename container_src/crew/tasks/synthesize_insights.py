import json

from crewai import Agent, Task

_COMMON_RULES = (
    "CRITICAL OUTPUT RULES:\n"
    "- NEVER include organization IDs, UUIDs, internal identifiers, or raw system IDs in output\n"
    "- Refer to the user or session in human-readable terms only (e.g. 'the user', 'this session')\n"
    "- Be concise: each 'description' field must be 1-2 sentences maximum\n"
    "- Each 'summary' must be a single, actionable sentence with a specific improvement suggestion\n"
    "- Name cognitive load patterns descriptively (e.g. 'Excessive Checkout Steps', not 'high_cognitive_load')\n"
    "- Output ONLY valid JSON — no markdown, no extra text\n"
)


def create_interaction_efficiency_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=(
            f"Evaluate interaction efficiency and cognitive load from {len(events)} session events.\n\n"
            f"Measure:\n"
            f"1. Clicks-to-goal ratio vs optimal path\n"
            f"2. Inter-action timing (hesitation gaps indicating confusion)\n"
            f"3. Error recovery patterns (backtracking, re-submits, undo actions)\n"
            f"4. Input efficiency (corrections, autocomplete usage, form re-entry)\n\n"
            f"Session events:\n{events_json}\n\n"
            f"{_COMMON_RULES}\n"
            f"Output structure:\n"
            f'{{"interactions": [{{"type": "efficiency_analysis", "category": "cognitive_load", '
            f'"description": "one or two sentence finding", "summary": "single actionable sentence", '
            f'"confidence": 0.82, "metrics": {{"efficiency_score": 0.6, "extra_clicks": 3, '
            f'"hesitation_events": 2}}, "patterns": ["Descriptive Efficiency Pattern Name"]}}]}}'
        ),
        expected_output=(
            "JSON object with efficiency score, extra clicks vs optimal path, hesitation event count, "
            "and one specific actionable improvement per finding with a descriptive pattern name"
        ),
        agent=agent,
    )
