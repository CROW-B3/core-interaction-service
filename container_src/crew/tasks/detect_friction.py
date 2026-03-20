import json

from crewai import Agent, Task


def create_usability_analysis_task(agent: Agent, events: list) -> Task:
    events_json = json.dumps(events, indent=2) if events else "[]"

    return Task(
        description=f"""Identify usability issues and friction points from {len(events)} events.

        Analyze for:
        1. UI confusion indicators (rapid clicking, backtracking)
        2. Form interaction problems (abandonment, validation errors)
        3. Navigation dead ends
        4. Mobile vs desktop usability gaps
        5. Accessibility concerns

        Full events data:
        {events_json}

        Output your analysis as JSON with this structure:
        {{
            "interactions": [
                {{
                    "type": "usability_analysis",
                    "category": "friction",
                    "description": "detailed friction analysis",
                    "summary": "one-line summary",
                    "confidence": 0.80,
                    "metrics": {{"friction_score": 0.5}},
                    "patterns": ["friction_pattern1"]
                }}
            ]
        }}""",
        expected_output="""JSON object with usability analysis including:
        - Friction points identified
        - Severity ratings
        - Specific UI elements involved
        - Recommended fixes""",
        agent=agent,
    )
