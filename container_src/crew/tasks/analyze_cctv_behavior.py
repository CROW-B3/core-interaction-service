import json

from crewai import Agent, Task


def create_cctv_behavior_task(agent: Agent, interactions: list[dict]) -> Task:
    cctv_interactions = [i for i in interactions if i.get("sourceType") == "cctv"]
    data_json = json.dumps(cctv_interactions[:50], indent=2) if cctv_interactions else "[]"

    return Task(
        description=(
            f"Analyze {len(cctv_interactions)} CCTV interactions for in-store customer behavior.\n\n"
            f"Examine frame analysis data to determine:\n"
            f"1. Zone analysis - which store areas have the most activity\n"
            f"2. Dwell time patterns - how long customers spend in each zone\n"
            f"3. Foot traffic flow - common paths through the store\n"
            f"4. Product interaction signals - browsing, pickup, and purchase behaviors\n"
            f"5. People count trends and peak times\n\n"
            f"CCTV interaction data:\n{data_json}\n\n"
            f"Respond ONLY with valid JSON (no markdown, no extra text):\n"
            f'{{"zones": [{{"name": "zone", "activity": 0.8, "dwellTimeAvg": 45}}], '
            f'"footTraffic": ["path1"], "peakActivity": "timestamp", "summary": "brief summary"}}'
        ),
        expected_output="JSON with zones, footTraffic, peakActivity, and summary",
        agent=agent,
    )
