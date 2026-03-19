import json

from crewai import Agent, Task


def create_intent_analysis_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=f"""Analyze purchase intent and conversion factors from {len(events)} events.

        Evaluate:
        1. Purchase intent signals (product views, cart additions)
        2. Abandonment risk indicators
        3. Trust signal interactions (reviews, security badges)
        4. Price sensitivity behaviors
        5. Comparison shopping patterns

        Full events data:
        {events_json}

        Output your analysis as JSON with this structure:
        {{
            "interactions": [
                {{
                    "type": "intent_analysis",
                    "category": "conversion",
                    "description": "detailed intent analysis",
                    "summary": "one-line summary",
                    "confidence": 0.75,
                    "metrics": {{"intent_score": 0.7}},
                    "patterns": ["high_intent_signal"]
                }}
            ]
        }}""",
        expected_output="""JSON object with intent analysis including:
        - Intent classification (browse, compare, buy)
        - Conversion likelihood score
        - Key decision factors
        - Recommended interventions""",
        agent=agent,
    )
