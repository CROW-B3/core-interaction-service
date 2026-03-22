import json

from crewai import Agent, Task

_COMMON_RULES = (
    "CRITICAL OUTPUT RULES:\n"
    "- NEVER include organization IDs, UUIDs, internal identifiers, or raw system IDs in output\n"
    "- Refer to the user or session in human-readable terms only (e.g. 'the user', 'this session')\n"
    "- Be concise: each 'description' field must be 1-2 sentences maximum\n"
    "- Each 'summary' must be a single, actionable sentence\n"
    "- Use clear category labels from: navigation, engagement, friction, intent, efficiency\n"
    "- Output ONLY valid JSON — no markdown, no extra text\n"
)


def create_navigation_analysis_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=(
            f"Analyze navigation patterns from {len(events)} session events.\n\n"
            f"Identify:\n"
            f"1. Decision-making style (systematic, exploratory, impulsive, goal-directed)\n"
            f"2. Cognitive load signals (backtracking, hesitation, repeated actions)\n"
            f"3. Behavioral biases affecting navigation (anchoring, recency, choice overload)\n\n"
            f"Session events:\n{events_json}\n\n"
            f"{_COMMON_RULES}\n"
            f"Output structure:\n"
            f'{{"interactions": [{{"type": "behavioral_analysis", "category": "navigation", '
            f'"description": "one or two sentence finding", "summary": "single actionable sentence", '
            f'"confidence": 0.85, "metrics": {{"key": "value"}}, "patterns": ["descriptive_pattern_label"]}}]}}'
        ),
        expected_output=(
            "JSON object with navigation analysis: decision-making style, cognitive load indicators, "
            "behavioral biases, each as a concise actionable finding with a descriptive pattern label"
        ),
        agent=agent,
    )
