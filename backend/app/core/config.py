"""
Core configuration for the application
"""
import os
from typing import Optional

class Settings:
    """Application settings"""
    
    # Organization settings
    DEFAULT_ORG_ID: str = os.environ.get(
        "DEFAULT_ORG_ID", 
        "ad808530-1ddb-4377-ab20-67bef145d80d"  # Demo Pharma Pvt Ltd
    )
    
    # Database settings
    DATABASE_URL: Optional[str] = os.environ.get("DATABASE_URL")
    
    # API settings
    API_V1_PREFIX: str = "/api/v1"
    API_V2_PREFIX: str = "/api/v2"
    
    # Security settings
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "your-secret-key-here")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Application settings
    PROJECT_NAME: str = "Pharma ERP Backend"
    VERSION: str = "2.0.0"
    DEBUG: bool = os.environ.get("DEBUG", "False").lower() == "true"
    
    # CORS settings
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:3001", 
        "https://pharma-frontend.railway.app",
        "https://pharma-erp.vercel.app"
    ]
    
    # File upload settings
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10 MB
    ALLOWED_UPLOAD_TYPES: list = [".pdf", ".jpg", ".jpeg", ".png"]
    
    # Cache settings
    CACHE_TTL: int = 300  # 5 minutes
    
    # Pagination defaults
    DEFAULT_PAGE_SIZE: int = 50
    MAX_PAGE_SIZE: int = 100


settings = Settings()

# For backward compatibility
DEFAULT_ORG_ID = settings.DEFAULT_ORG_ID