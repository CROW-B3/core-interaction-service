import json

from crewai import Agent, Task

_COMMON_RULES = (
    "CRITICAL OUTPUT RULES:\n"
    "- NEVER include organization IDs, UUIDs, internal identifiers, or raw system IDs in output\n"
    "- Refer to the brand or organization as 'your brand' or 'the organization' — never by ID\n"
    "- Name topics descriptively (e.g. 'Product Quality Complaints', not 'topic_3')\n"
    "- Keep 'summary' to one concise, actionable sentence about the most important signal\n"
    "- Output ONLY valid JSON — no markdown, no extra text\n"
)


def create_social_sentiment_task(agent: Agent, interactions: list[dict]) -> Task:
    social_interactions = [i for i in interactions if i.get("sourceType") == "social"]
    data_json = json.dumps(social_interactions[:50], indent=2) if social_interactions else "[]"

    return Task(
        description=(
            f"Analyze {len(social_interactions)} social media interactions for sentiment "
            f"and engagement quality.\n\n"
            f"Evaluate:\n"
            f"1. Sentiment distribution (positive, negative, neutral) with confidence\n"
            f"2. Engagement quality — meaningful replies and shares vs passive likes\n"
            f"3. Trending topics and themes with descriptive labels\n"
            f"4. Brand perception signals — trust, excitement, frustration\n"
            f"5. High-impact mentions (influencer reach, viral potential)\n\n"
            f"Social data:\n{data_json}\n\n"
            f"{_COMMON_RULES}\n"
            f"Output structure:\n"
            f'{{"sentimentDistribution": {{"positive": 0.6, "negative": 0.1, "neutral": 0.3}}, '
            f'"topics": [{{"title": "Descriptive Topic Name", "volume": 0.4, '
            f'"sentiment": "positive|negative|neutral"}}], '
            f'"engagementQuality": 0.7, '
            f'"brandPerception": "one sentence describing how the brand is perceived", '
            f'"summary": "single actionable sentence about the dominant social signal"}}'
        ),
        expected_output=(
            "JSON with sentiment distribution, named topic objects with volume and sentiment, "
            "engagement quality score, brand perception summary, and a concise actionable overall summary"
        ),
        agent=agent,
    )
