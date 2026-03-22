import json

from crewai import Agent, Task

_COMMON_RULES = (
    "CRITICAL OUTPUT RULES:\n"
    "- NEVER include organization IDs, UUIDs, internal identifiers, or raw system IDs in output\n"
    "- Refer to the user or session in human-readable terms only (e.g. 'the user', 'this session')\n"
    "- Be concise: each 'description' field must be 1-2 sentences maximum\n"
    "- Each 'summary' must be a single, actionable sentence\n"
    "- Use descriptive pattern labels (e.g. 'Deep Content Consumption', not 'high_engagement')\n"
    "- Output ONLY valid JSON — no markdown, no extra text\n"
)


def create_engagement_metrics_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=(
            f"Measure engagement quality from {len(events)} session events.\n\n"
            f"Compute:\n"
            f"1. Scroll depth and reading patterns (skimming vs deep reading)\n"
            f"2. Time-on-page quality (active vs idle dwell time)\n"
            f"3. Interaction density and feature adoption signals\n"
            f"4. Content consumption trajectory (increasing, plateauing, or dropping off)\n\n"
            f"Session events:\n{events_json}\n\n"
            f"{_COMMON_RULES}\n"
            f"Output structure:\n"
            f'{{"interactions": [{{"type": "engagement_analysis", "category": "engagement", '
            f'"description": "one or two sentence finding", "summary": "single actionable sentence", '
            f'"confidence": 0.88, "metrics": {{"engagement_score": 0.75, "scroll_depth": 0.8, '
            f'"active_time_ratio": 0.6}}, "patterns": ["Descriptive Engagement Pattern Name"]}}]}}'
        ),
        expected_output=(
            "JSON object with engagement quality score, scroll depth, active vs idle time ratio, "
            "content consumption style, and one actionable insight per finding with a descriptive pattern name"
        ),
        agent=agent,
    )
