from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Financas Pessoais API"
    database_url: str = "sqlite:///./finance.db"


settings = Settings()
