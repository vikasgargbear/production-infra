"""
Create default user for testing
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from ...core.database import get_db

router = APIRouter(prefix="/setup", tags=["setup"])

@router.post("/create-default-user")
async def create_default_user(db: Session = Depends(get_db)):
    """Create a default user for testing"""
    try:
        # Check if user already exists
        existing = db.execute(text("""
            SELECT user_id FROM master.org_users 
            WHERE username = 'admin'
        """)).first()
        
        if existing:
            return {"message": "Default user already exists", "user_id": existing.user_id}
        
        # Create user
        result = db.execute(text("""
            INSERT INTO master.org_users (
                org_id, username, email, full_name, 
                is_active, created_at, updated_at
            ) VALUES (
                'ad808530-1ddb-4377-ab20-67bef145d80d',
                'admin', 'admin@pharma.com', 'Admin User',
                true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING user_id
        """))
        
        user_id = result.scalar()
        db.commit()
        
        return {"message": "Default user created", "user_id": user_id}
        
    except Exception as e:
        db.rollback()
        return {"error": str(e)}