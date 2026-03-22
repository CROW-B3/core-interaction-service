import json

from crewai import Agent, Task

_COMMON_RULES = (
    "CRITICAL OUTPUT RULES:\n"
    "- NEVER include organization IDs, UUIDs, internal identifiers, or raw system IDs in output\n"
    "- Refer to the user or session in human-readable terms only (e.g. 'the user', 'this session')\n"
    "- Be concise: each 'description' field must be 1-2 sentences maximum\n"
    "- Each 'summary' must be a single, actionable sentence\n"
    "- Output ONLY valid JSON — no markdown, no extra text\n"
)


def create_intent_analysis_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=(
            f"Classify purchase intent and conversion risk from {len(events)} session events.\n\n"
            f"Evaluate:\n"
            f"1. Intent stage: browsing, comparing, or ready-to-buy\n"
            f"2. Abandonment risk signals (cart drops, checkout exits, long pauses)\n"
            f"3. Trust signal engagement (reviews clicked, security badges noticed)\n"
            f"4. Price sensitivity and comparison shopping behavior\n\n"
            f"Session events:\n{events_json}\n\n"
            f"{_COMMON_RULES}\n"
            f"Output structure:\n"
            f'{{"interactions": [{{"type": "intent_analysis", "category": "conversion", '
            f'"description": "one or two sentence finding", "summary": "single actionable sentence", '
            f'"confidence": 0.75, "metrics": {{"intent_score": 0.7, "abandonment_risk": 0.3}}, '
            f'"patterns": ["descriptive_intent_label"]}}]}}'
        ),
        expected_output=(
            "JSON object with intent classification (browsing/comparing/buying), abandonment risk score, "
            "trust signal engagement, and one concrete recommended intervention per finding"
        ),
        agent=agent,
    )
