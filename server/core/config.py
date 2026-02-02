import os
from urllib.parse import quote_plus
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

    DB_HOST: str = _env_config("POSTGRES_DB_HOST")
    DB_PORT: int = _env_config("POSTGRES_DB_PORT", cast=int)
    DB_USER: str = _env_config("POSTGRES_DB_USER")
    DB_PASSWORD: str = _env_config("POSTGRES_DB_PASSWORD")
    DB_NAME: str = _env_config("POSTGRES_DB_NAME_PESA_PLAN")

    @property
    def DATABASE_URL(self) -> str:
        """Construct database URL from separate components, properly encoding password."""
        encoded_password = quote_plus(self.DB_PASSWORD)
        return f"postgresql://{self.DB_USER}:{encoded_password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


settings = Settings()
