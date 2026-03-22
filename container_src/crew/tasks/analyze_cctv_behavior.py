import json

from crewai import Agent, Task

_COMMON_RULES = (
    "CRITICAL OUTPUT RULES:\n"
    "- NEVER include organization IDs, UUIDs, internal identifiers, or raw system IDs in output\n"
    "- Name zones descriptively (e.g. 'Front Entrance', 'Electronics Aisle') — never by ID\n"
    "- Keep 'summary' to one concise, actionable sentence about the most important finding\n"
    "- Describe foot traffic paths in plain English (e.g. 'Entrance → Apparel → Checkout')\n"
    "- Output ONLY valid JSON — no markdown, no extra text\n"
)


def create_cctv_behavior_task(agent: Agent, interactions: list[dict]) -> Task:
    cctv_interactions = [i for i in interactions if i.get("sourceType") == "cctv"]
    data_json = json.dumps(cctv_interactions[:50], indent=2) if cctv_interactions else "[]"

    return Task(
        description=(
            f"Analyze {len(cctv_interactions)} CCTV in-store behavior records.\n\n"
            f"Determine:\n"
            f"1. Zone activity — which store areas attract the most customers and why\n"
            f"2. Dwell time by zone — identify high-interest vs pass-through areas\n"
            f"3. Foot traffic flow — the most common customer paths through the store\n"
            f"4. Product interaction signals — browsing, pickup, and put-back behaviors\n"
            f"5. Peak activity periods with count estimates\n\n"
            f"CCTV data:\n{data_json}\n\n"
            f"{_COMMON_RULES}\n"
            f"Output structure:\n"
            f'{{"zones": [{{"name": "Descriptive Zone Name", "activity": 0.8, "dwellTimeAvg": 45, '
            f'"insight": "one sentence about this zone"}}], '
            f'"footTraffic": ["Entrance → Electronics → Checkout"], '
            f'"peakActivity": "human-readable time description", '
            f'"productSignals": ["descriptive product behavior observation"], '
            f'"summary": "single actionable sentence about the key in-store finding"}}'
        ),
        expected_output=(
            "JSON with named zones (not IDs), dwell times, plain-English traffic paths, "
            "product interaction signals, and a concise actionable summary"
        ),
        agent=agent,
    )
