import json

from crewai import Agent, Task

_COMMON_RULES = (
    "CRITICAL OUTPUT RULES:\n"
    "- Only include product IDs in the 'productId' field — NEVER put product IDs, org IDs, or UUIDs in text fields\n"
    "- All text fields (summary, channel descriptions) must use human-readable language only\n"
    "- Keep 'summary' to one concise sentence describing the most-interacted product and its dominant channel\n"
    "- Output ONLY valid JSON — no markdown, no extra text\n"
)


def create_product_matching_task(
    agent: Agent, interactions: list[dict], specialist_outputs: str
) -> Task:
    data_json = json.dumps(interactions[:30], indent=2) if interactions else "[]"

    return Task(
        description=(
            f"Match behavioral signals from all channels to specific products.\n\n"
            f"Using specialist analysis outputs and raw interaction data, identify which products "
            f"are being engaged with across web, in-store (CCTV), and social channels.\n\n"
            f"Specialist outputs:\n{specialist_outputs}\n\n"
            f"Raw data sample:\n{data_json}\n\n"
            f"For each matched product provide:\n"
            f"1. Product ID (taken directly from data — only ID allowed in any field)\n"
            f"2. Interaction type: viewed, discussed, picked_up, purchased, or mentioned\n"
            f"3. Confidence score (0.0–1.0)\n"
            f"4. Primary channel (web, cctv, or social)\n"
            f"5. A brief human-readable description of the product interaction context\n\n"
            f"{_COMMON_RULES}\n"
            f"Output structure:\n"
            f'{{"productMatches": [{{"productId": "exact-id-from-data", "interactionType": "viewed", '
            f'"confidence": 0.85, "channel": "web", "context": "one sentence describing the interaction"}}], '
            f'"summary": "single sentence naming the top product and its main channel"}}'
        ),
        expected_output=(
            "JSON with productMatches array (productId, interactionType, confidence, channel, context) "
            "and a concise summary naming the most-engaged product"
        ),
        agent=agent,
    )
