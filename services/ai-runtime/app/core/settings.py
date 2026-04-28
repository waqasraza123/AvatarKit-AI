from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_runtime_host: str = "0.0.0.0"
    ai_runtime_port: int = 8000
    ai_runtime_service_token: str = ""
    ai_runtime_provider: str = Field(default="MOCK", validation_alias="AI_RUNTIME_PROVIDER")
    ai_runtime_request_timeout_ms: int = Field(default=15000, validation_alias="AI_RUNTIME_REQUEST_TIMEOUT_MS")
    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    anthropic_api_key: str = Field(default="", validation_alias="ANTHROPIC_API_KEY")
    elevenlabs_api_key: str = Field(default="", validation_alias="ELEVENLABS_API_KEY")
    openai_model: str = Field(default="gpt-4o-mini", validation_alias="AI_RUNTIME_OPENAI_MODEL")
    anthropic_model: str = Field(default="claude-3-5-sonnet-20241022", validation_alias="AI_RUNTIME_ANTHROPIC_MODEL")
    ai_runtime_tts_provider: str = Field(default="MOCK", validation_alias="AI_RUNTIME_TTS_PROVIDER")
    openai_tts_model: str = Field(default="gpt-4o-mini-tts", validation_alias="AI_RUNTIME_OPENAI_TTS_MODEL")
    elevenlabs_tts_model: str = Field(default="eleven_multilingual_v2", validation_alias="AI_RUNTIME_ELEVENLABS_TTS_MODEL")
    ai_runtime_stt_provider: str = Field(default="MOCK", validation_alias="AI_RUNTIME_STT_PROVIDER")
    ai_runtime_mock_stt_transcript: str = Field(default="How can you help my business?", validation_alias="AI_RUNTIME_MOCK_STT_TRANSCRIPT")
    openai_stt_model: str = Field(default="whisper-1", validation_alias="AI_RUNTIME_OPENAI_STT_MODEL")
    deepgram_api_key: str = Field(default="", validation_alias="DEEPGRAM_API_KEY")
    deepgram_stt_model: str = Field(default="nova-2", validation_alias="AI_RUNTIME_DEEPGRAM_STT_MODEL")
    ai_runtime_avatar_media_provider: str = Field(default="MOCK", validation_alias="AI_RUNTIME_AVATAR_MEDIA_PROVIDER")
    ai_runtime_mock_avatar_video_url: str = Field(default="", validation_alias="AI_RUNTIME_MOCK_AVATAR_VIDEO_URL")
    did_api_key: str = Field(default="", validation_alias="DID_API_KEY")
    did_base_url: str = Field(default="https://api.d-id.com", validation_alias="DID_BASE_URL")
    did_poll_attempts: int = Field(default=6, validation_alias="DID_POLL_ATTEMPTS")
    tavus_api_key: str = Field(default="", validation_alias="TAVUS_API_KEY")
    tavus_base_url: str = Field(default="https://tavusapi.com/v2", validation_alias="TAVUS_BASE_URL")
    tavus_default_replica_id: str = Field(default="", validation_alias="TAVUS_DEFAULT_REPLICA_ID")
    tavus_default_persona_id: str = Field(default="", validation_alias="TAVUS_DEFAULT_PERSONA_ID")
    ai_runtime_self_hosted_avatar_mode: str = Field(default="DISABLED", validation_alias="AI_RUNTIME_SELF_HOSTED_AVATAR_MODE")
    ai_runtime_self_hosted_avatar_endpoint: str = Field(default="", validation_alias="AI_RUNTIME_SELF_HOSTED_AVATAR_ENDPOINT")
    ai_runtime_self_hosted_avatar_video_url: str = Field(default="", validation_alias="AI_RUNTIME_SELF_HOSTED_AVATAR_VIDEO_URL")
    ai_runtime_self_hosted_avatar_timeout_seconds: float = Field(default=60.0, validation_alias="AI_RUNTIME_SELF_HOSTED_AVATAR_TIMEOUT_SECONDS")
    ai_runtime_self_hosted_avatar_duration_seconds: float = Field(default=3.0, validation_alias="AI_RUNTIME_SELF_HOSTED_AVATAR_DURATION_SECONDS")
    environment: str = "development"


settings = Settings()
