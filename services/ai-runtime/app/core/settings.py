from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_runtime_host: str = "0.0.0.0"
    ai_runtime_port: int = 8000
    environment: str = "development"


settings = Settings()
