import os
from decouple import config, Config, RepositoryEnv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Get the project root directory (pesa-plan folder)
_project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
_env_file = os.path.join(_project_root, ".env")

# Create a config instance that reads from the .env file in project root
_env_config = Config(RepositoryEnv(_env_file))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file,
        extra="ignore",  # Ignore extra environment variables that don't match field names
    )

    DATABASE_URL: str = _env_config("PESA_PLAN_DATABASE_URL")


settings = Settings()
