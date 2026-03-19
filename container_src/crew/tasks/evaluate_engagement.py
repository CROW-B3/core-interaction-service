import json

from crewai import Agent, Task


def create_engagement_metrics_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=f"""Calculate engagement scores and attention metrics from {len(events)} events.

        Compute:
        1. Scroll depth and patterns
        2. Time on page distribution
        3. Interaction frequency and density
        4. Content consumption patterns
        5. Feature adoption indicators

        Full events data:
        {events_json}

        Output your analysis as JSON with this structure:
        {{
            "interactions": [
                {{
                    "type": "engagement_analysis",
                    "category": "metrics",
                    "description": "detailed engagement analysis",
                    "summary": "one-line summary",
                    "confidence": 0.88,
                    "metrics": {{"engagement_score": 0.75, "scroll_depth": 0.8}},
                    "patterns": ["high_engagement", "deep_scroll"]
                }}
            ]
        }}""",
        expected_output="""JSON object with engagement analysis including:
        - Overall engagement score
        - Attention metrics breakdown
        - Content effectiveness ratings
        - Engagement trajectory""",
        agent=agent,
    )
