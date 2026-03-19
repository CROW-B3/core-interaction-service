import os
from dataclasses import dataclass


@dataclass
class Config:
    cf_account_id: str
    cf_ai_api_key: str
    ai_gateway_id: str | None
    environment: str
    port: int


def get_config() -> Config:
    return Config(
        cf_account_id=os.getenv("CF_ACCOUNT_ID", ""),
        cf_ai_api_key=os.getenv("CF_AI_API_KEY", ""),
        ai_gateway_id=os.getenv("AI_GATEWAY_ID"),
        environment=os.getenv("ENVIRONMENT", "local"),
        port=int(os.getenv("PORT", "8080")),
    )
