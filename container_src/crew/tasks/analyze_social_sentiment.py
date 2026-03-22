import json

from crewai import Agent, Task


def create_social_sentiment_task(agent: Agent, interactions: list[dict]) -> Task:
    social_interactions = [i for i in interactions if i.get("sourceType") == "social"]
    data_json = json.dumps(social_interactions[:50], indent=2) if social_interactions else "[]"

    return Task(
        description=(
            f"Analyze {len(social_interactions)} social media interactions for sentiment "
            f"and engagement quality.\n\n"
            f"Evaluate:\n"
            f"1. Overall sentiment distribution (positive, negative, neutral)\n"
            f"2. Engagement quality beyond vanity metrics\n"
            f"3. Trending topics and themes\n"
            f"4. Brand perception signals\n"
            f"5. Notable mentions or influencer activity\n\n"
            f"Social interaction data:\n{data_json}\n\n"
            f"Respond ONLY with valid JSON (no markdown, no extra text):\n"
            f'{{"sentimentDistribution": {{"positive": 0.6, "negative": 0.1, "neutral": 0.3}}, '
            f'"topics": ["topic1"], "engagementQuality": 0.7, "summary": "brief summary"}}'
        ),
        expected_output="JSON with sentimentDistribution, topics, engagementQuality, and summary",
        agent=agent,
    )
