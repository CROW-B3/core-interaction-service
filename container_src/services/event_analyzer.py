from collections import Counter
from dataclasses import dataclass


@dataclass
class EventStats:
    total_events: int
    event_types: dict[str, int]
    session_duration_ms: int
    unique_urls: int
    scroll_depth_max: float
    click_count: int
    form_interactions: int
    error_count: int


class EventAnalyzer:
    def __init__(self, events: list[dict]):
        self.events = events

    def compute_stats(self) -> EventStats:
        if not self.events:
            return EventStats(
                total_events=0,
                event_types={},
                session_duration_ms=0,
                unique_urls=0,
                scroll_depth_max=0,
                click_count=0,
                form_interactions=0,
                error_count=0,
            )

        event_types = Counter(e.get("type", "unknown") for e in self.events)

        timestamps = [e.get("timestamp", 0) for e in self.events]
        session_duration = max(timestamps) - min(timestamps) if timestamps else 0

        urls = set(e.get("url", "") for e in self.events if e.get("url"))

        scroll_depths = []
        for e in self.events:
            if e.get("type") == "scroll" and e.get("data"):
                depth = e["data"].get("scrollPercentageY", 0)
                if depth:
                    scroll_depths.append(float(depth))

        click_count = event_types.get("click", 0)

        form_types = ["form_focus", "form_blur", "form_input", "form_validation"]
        form_interactions = sum(event_types.get(ft, 0) for ft in form_types)

        error_count = event_types.get("error", 0)

        return EventStats(
            total_events=len(self.events),
            event_types=dict(event_types),
            session_duration_ms=session_duration,
            unique_urls=len(urls),
            scroll_depth_max=max(scroll_depths) if scroll_depths else 0,
            click_count=click_count,
            form_interactions=form_interactions,
            error_count=error_count,
        )

    def get_navigation_sequence(self) -> list[str]:
        pageviews = [
            e for e in self.events if e.get("type") == "pageview"
        ]
        return [e.get("url", "") for e in sorted(pageviews, key=lambda x: x.get("timestamp", 0))]

    def detect_rage_clicks(self, threshold_ms: int = 500, min_clicks: int = 3) -> list[dict]:
        clicks = [
            e for e in self.events if e.get("type") == "click"
        ]
        clicks.sort(key=lambda x: x.get("timestamp", 0))

        rage_sequences = []
        current_sequence = []

        for i, click in enumerate(clicks):
            if not current_sequence:
                current_sequence.append(click)
                continue

            time_diff = click.get("timestamp", 0) - current_sequence[-1].get("timestamp", 0)

            if time_diff <= threshold_ms:
                current_sequence.append(click)
            else:
                if len(current_sequence) >= min_clicks:
                    rage_sequences.append({
                        "clicks": len(current_sequence),
                        "start_time": current_sequence[0].get("timestamp"),
                        "end_time": current_sequence[-1].get("timestamp"),
                        "element": current_sequence[0].get("data", {}).get("tagName", "unknown"),
                    })
                current_sequence = [click]

        if len(current_sequence) >= min_clicks:
            rage_sequences.append({
                "clicks": len(current_sequence),
                "start_time": current_sequence[0].get("timestamp"),
                "end_time": current_sequence[-1].get("timestamp"),
                "element": current_sequence[0].get("data", {}).get("tagName", "unknown"),
            })

        return rage_sequences

    def detect_hesitation_patterns(self, threshold_ms: int = 5000) -> list[dict]:
        sorted_events = sorted(self.events, key=lambda x: x.get("timestamp", 0))

        hesitations = []
        for i in range(1, len(sorted_events)):
            time_diff = sorted_events[i].get("timestamp", 0) - sorted_events[i-1].get("timestamp", 0)

            if time_diff >= threshold_ms:
                hesitations.append({
                    "duration_ms": time_diff,
                    "before_event": sorted_events[i-1].get("type"),
                    "after_event": sorted_events[i].get("type"),
                    "url": sorted_events[i].get("url"),
                    "timestamp": sorted_events[i-1].get("timestamp"),
                })

        return hesitations
