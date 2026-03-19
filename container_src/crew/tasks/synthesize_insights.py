import json

from crewai import Agent, Task


def create_interaction_efficiency_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=f"""Evaluate interaction efficiency and cognitive load from {len(events)} events.

        Analyze:
        1. Clicks to goal ratio
        2. Time between interactions
        3. Error recovery patterns
        4. Cognitive load indicators (rapid scrolling, excessive clicking)
        5. Input efficiency (typing speed, corrections)

        Full events data:
        {events_json}

        Output your analysis as JSON with this structure:
        {{
            "interactions": [
                {{
                    "type": "efficiency_analysis",
                    "category": "cognitive_load",
                    "description": "detailed efficiency analysis",
                    "summary": "one-line summary",
                    "confidence": 0.82,
                    "metrics": {{"efficiency_score": 0.6}},
                    "patterns": ["high_cognitive_load"]
                }}
            ]
        }}""",
        expected_output="""JSON object with efficiency analysis including:
        - Interaction cost metrics
        - Cognitive load assessment
        - Efficiency recommendations
        - Comparison to optimal path""",
        agent=agent,
    )
