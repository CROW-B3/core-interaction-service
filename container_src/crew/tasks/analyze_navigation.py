import json

from crewai import Agent, Task


def create_navigation_analysis_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=f"""Analyze the user's navigation patterns from {len(events)} events.

        Provide VERBOSE, DETAILED analysis including:
        1. Decision-making patterns (systematic vs impulsive)
        2. Goal orientation (exploratory vs directed)
        3. Cognitive load indicators (confusion, hesitation)
        4. Learning curve (adaptation over session)
        5. Behavioral biases observed

        Full events data:
        {events_json}

        Output your analysis as JSON with this structure:
        {{
            "interactions": [
                {{
                    "type": "behavioral_analysis",
                    "category": "navigation",
                    "description": "detailed analysis text",
                    "summary": "one-line summary",
                    "confidence": 0.85,
                    "metrics": {{"key": "value"}},
                    "patterns": ["pattern1", "pattern2"]
                }}
            ]
        }}""",
        expected_output="""JSON object with comprehensive behavioral analysis including:
        - Executive summary
        - Detailed pattern analysis
        - Evidence citations
        - Psychological interpretation
        - Actionable insights""",
        agent=agent,
    )
