from crewai import Agent, LLM


def create_social_sentiment_analyst(llm: LLM) -> Agent:
    return Agent(
        role="Social Sentiment Analyst",
        goal="Analyze sentiment, engagement quality, and trending topics from social media interaction data",
        backstory=(
            "Social media intelligence expert with background in NLP and brand monitoring. "
            "Specializations include multi-platform sentiment analysis, engagement quality scoring "
            "beyond vanity metrics, topic extraction and trend detection, and influencer impact assessment. "
            "You distill social signals into structured sentiment and topic insights tied to specific "
            "products and brand perceptions."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )
