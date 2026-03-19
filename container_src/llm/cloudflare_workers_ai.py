from crewai import LLM


def get_cloudflare_llm(
    cf_account_id: str,
    cf_ai_api_key: str,
    ai_gateway_id: str | None = None,
    model: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    temperature: float = 0.7,
    max_tokens: int = 8192,
) -> LLM:
    if ai_gateway_id:
        base_url = f"https://gateway.ai.cloudflare.com/v1/{cf_account_id}/{ai_gateway_id}/workers-ai/v1"
        full_model = f"openai/workers-ai/{model}"
    else:
        base_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account_id}/ai/v1"
        full_model = f"openai/{model}"

    return LLM(
        model=full_model,
        base_url=base_url,
        api_key=cf_ai_api_key,
        temperature=temperature,
        max_tokens=max_tokens,
    )


AVAILABLE_MODELS = [
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "@cf/meta/llama-3.1-70b-instruct",
    "@cf/meta/llama-3.1-8b-instruct",
    "@cf/mistral/mistral-7b-instruct-v0.1",
    "@cf/qwen/qwen1.5-14b-chat-awq",
    "@hf/thebloke/deepseek-coder-6.7b-instruct-awq",
]
