
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _strip_comment_values(cls, data: object) -> object:
        """python-dotenv 1.x stores 'KEY=  # comment' as '# comment'.
        Treat any value whose stripped form starts with '#' as unset (None)."""
        if not isinstance(data, dict):
            return data
        return {
            k: (None if isinstance(v, str) and v.strip().startswith("#") else v)
            for k, v in data.items()
        }

    # Auth (Clerk)
    clerk_secret_key: str | None = None
    clerk_publishable_key: str | None = None
    clerk_webhook_secret: str | None = None

    # Database (Supabase)
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_db_url: str | None = None

    # Vector DB (Pinecone)
    pinecone_api_key: str | None = None
    pinecone_index_name: str = "product-catalog"
    pinecone_environment: str | None = None

    # Cache & Queue (Upstash Redis)
    upstash_redis_url: str | None = None
    upstash_redis_token: str | None = None
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    # LLM Providers
    anthropic_api_key: str | None = None
    groq_api_key: str | None = None

    # Payments (Razorpay)
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    razorpay_webhook_secret: str | None = None

    # Monitoring
    langfuse_public_key: str | None = None
    langfuse_secret_key: str | None = None
    langfuse_base_url: str | None = None
    sentry_dsn: str | None = None

    # App Config
    app_env: str = "local"
    frontend_url: str = "http://localhost:5173"
    # Payment mode toggle — mock keeps Phase 2 flow intact for demo safety;
    # live fires real Razorpay Checkout + webhook confirmation.
    payment_mode: str = "mock"


settings = Settings()
