import json

from crewai import Agent, Task


def create_product_matching_task(
    agent: Agent, interactions: list[dict], specialist_outputs: str
) -> Task:
    data_json = json.dumps(interactions[:30], indent=2) if interactions else "[]"

    return Task(
        description=(
            f"Correlate signals from specialist analyses to specific products.\n\n"
            f"Using the raw interaction data and specialist analysis outputs, identify which "
            f"products are being interacted with across all channels (web, CCTV, social).\n\n"
            f"Specialist analysis outputs:\n{specialist_outputs}\n\n"
            f"Raw interaction data (sample):\n{data_json}\n\n"
            f"For each product identified, provide:\n"
            f"1. Product ID (from data if available, otherwise descriptive identifier)\n"
            f"2. Interaction type (viewed, discussed, picked_up, purchased, mentioned)\n"
            f"3. Confidence score for the match\n\n"
            f"Respond ONLY with valid JSON (no markdown, no extra text):\n"
            f'{{"productMatches": [{{"productId": "id", "interactionType": "viewed", '
            f'"confidence": 0.85, "channel": "web"}}], "summary": "brief summary"}}'
        ),
        expected_output="JSON with productMatches array and summary",
        agent=agent,
    )
