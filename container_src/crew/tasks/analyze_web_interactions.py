import json

from crewai import Agent, Task


def create_web_interaction_task(agent: Agent, interactions: list[dict]) -> Task:
    web_interactions = [i for i in interactions if i.get("sourceType") == "web"]
    data_json = json.dumps(web_interactions[:50], indent=2) if web_interactions else "[]"

    return Task(
        description=(
            f"Analyze {len(web_interactions)} web interactions for navigation patterns, "
            f"friction points, and engagement signals.\n\n"
            f"For each interaction, examine the session data including page visits, click patterns, "
            f"scroll behavior, and session duration. Identify:\n"
            f"1. Navigation flow patterns (linear, exploratory, bouncing)\n"
            f"2. Friction indicators (rage clicks, dead clicks, form abandonment)\n"
            f"3. Engagement depth (scroll depth, time on page, return visits)\n\n"
            f"Web interaction data:\n{data_json}\n\n"
            f"Respond ONLY with valid JSON (no markdown, no extra text):\n"
            f'{{"patterns": ["pattern1"], "frictionPoints": ["point1"], '
            f'"engagementScore": 0.75, "summary": "brief summary"}}'
        ),
        expected_output="JSON with patterns, frictionPoints, engagementScore, and summary",
        agent=agent,
    )
