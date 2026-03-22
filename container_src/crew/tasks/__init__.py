from .analyze_cctv_behavior import create_cctv_behavior_task
from .analyze_social_sentiment import create_social_sentiment_task
from .analyze_web_interactions import create_web_interaction_task
from .match_products import create_product_matching_task
from .synthesize_analysis import create_synthesis_task

__all__ = [
    "create_cctv_behavior_task",
    "create_social_sentiment_task",
    "create_web_interaction_task",
    "create_product_matching_task",
    "create_synthesis_task",
]
