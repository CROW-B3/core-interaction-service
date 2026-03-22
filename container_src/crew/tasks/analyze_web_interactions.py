import json

from crewai import Agent, Task

_COMMON_RULES = (
    "CRITICAL OUTPUT RULES:\n"
    "- NEVER include organization IDs, UUIDs, internal identifiers, or raw system IDs in output\n"
    "- Describe pages and flows by their human-readable names (e.g. 'Product Detail Page', not page IDs)\n"
    "- Name patterns and friction points descriptively (e.g. 'Checkout Form Abandonment', not 'friction_1')\n"
    "- Keep 'summary' to one concise, actionable sentence\n"
    "- Output ONLY valid JSON — no markdown, no extra text\n"
)


def create_web_interaction_task(agent: Agent, interactions: list[dict]) -> Task:
    web_interactions = [i for i in interactions if i.get("sourceType") == "web"]
    data_json = json.dumps(web_interactions[:50], indent=2) if web_interactions else "[]"

    return Task(
        description=(
            f"Analyze {len(web_interactions)} web session interactions for navigation, "
            f"friction, and engagement.\n\n"
            f"Identify:\n"
            f"1. Navigation flow style (linear goal-seeking, exploratory browsing, bouncing)\n"
            f"2. Friction signals (rage clicks, dead clicks, form abandonment) with page context\n"
            f"3. Engagement depth (scroll percentage, active time on page, return visit behavior)\n\n"
            f"Web data:\n{data_json}\n\n"
            f"{_COMMON_RULES}\n"
            f"Output structure:\n"
            f'{{"patterns": [{{"title": "Descriptive Navigation Pattern", "description": "one sentence"}}], '
            f'"frictionPoints": [{{"title": "Descriptive Friction Name", "page": "Page Name", '
            f'"severity": "high|medium|low", "recommendation": "one sentence fix"}}], '
            f'"engagementScore": 0.75, '
            f'"summary": "single actionable sentence about the dominant web behavior finding"}}'
        ),
        expected_output=(
            "JSON with named navigation patterns, named friction points with page context and fix recommendations, "
            "engagement score, and a concise actionable summary"
        ),
        agent=agent,
    )
