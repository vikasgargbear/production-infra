"""
Authentication endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import timedelta
from typing import Dict, Any, List
import uuid

from ...database import get_db
from ...core.jwt_auth import (
    verify_password, get_password_hash, create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES, get_current_user_and_org,
    verify_user_org_access
)

router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login and get access token"""
    # Find user by email
    user = db.execute(text("""
        SELECT u.user_id, u.full_name, u.email, u.password_hash, 
               u.org_id, u.role, u.is_active,
               o.org_name, o.is_active as org_active
        FROM org_users u
        JOIN organizations o ON u.org_id = o.org_id
        WHERE u.email = :email
    """), {"email": form_data.username}).fetchone()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )
    
    if not user.org_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization is not active"
        )
    
    # Update last login
    db.execute(text("""
        UPDATE org_users 
        SET last_login_at = CURRENT_TIMESTAMP
        WHERE user_id = :user_id
    """), {"user_id": user.user_id})
    db.commit()
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "user_id": user.user_id,
            "email": user.email,
            "org_id": str(user.org_id),
            "role": user.role
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "user_id": user.user_id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role
        },
        "organization": {
            "org_id": str(user.org_id),
            "org_name": user.org_name
        }
    }

@router.get("/me")
async def get_current_user_info(
    current_user: Dict = Depends(get_current_user_and_org)
):
    """Get current user information"""
    return {
        "user": {
            "user_id": current_user["user_id"],
            "full_name": current_user["full_name"],
            "email": current_user["email"],
            "role": current_user["role"]
        },
        "organization": {
            "org_id": current_user["org_id"],
            "org_name": current_user["org_name"]
        }
    }

@router.get("/organizations")
async def get_user_organizations(
    current_user: Dict = Depends(get_current_user_and_org),
    db: Session = Depends(get_db)
):
    """Get all organizations the user has access to"""
    organizations = db.execute(text("""
        SELECT DISTINCT o.org_id, o.org_name, o.business_type,
               u.role as user_role
        FROM org_users u
        JOIN organizations o ON u.org_id = o.org_id
        WHERE u.email = :email
        AND u.is_active = true
        AND o.is_active = true
        ORDER BY o.org_name
    """), {"email": current_user["email"]}).fetchall()
    
    return {
        "organizations": [
            {
                "org_id": str(org.org_id),
                "org_name": org.org_name,
                "business_type": org.business_type,
                "user_role": org.user_role,
                "is_current": str(org.org_id) == current_user["org_id"]
            }
            for org in organizations
        ],
        "current_org_id": current_user["org_id"]
    }

@router.post("/switch-organization")
async def switch_organization(
    org_id: str,
    current_user: Dict = Depends(get_current_user_and_org),
    db: Session = Depends(get_db)
):
    """Switch to a different organization"""
    # Verify user has access to the requested organization
    has_access = await verify_user_org_access(
        current_user["user_id"], 
        org_id, 
        db
    )
    
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this organization"
        )
    
    # Get organization details
    org = db.execute(text("""
        SELECT o.org_id, o.org_name, u.role
        FROM organizations o
        JOIN org_users u ON u.org_id = o.org_id
        WHERE o.org_id = :org_id
        AND u.user_id = :user_id
        AND o.is_active = true
    """), {
        "org_id": org_id,
        "user_id": current_user["user_id"]
    }).fetchone()
    
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or inactive"
        )
    
    # Create new access token with the new organization
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "user_id": current_user["user_id"],
            "email": current_user["email"],
            "org_id": str(org.org_id),
            "role": org.role
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "organization": {
            "org_id": str(org.org_id),
            "org_name": org.org_name
        },
        "message": f"Switched to {org.org_name}"
    }

@router.post("/register")
async def register_user(
    user_data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """Register a new user and organization"""
    try:
        # Check if email already exists
        existing_user = db.execute(text("""
            SELECT user_id FROM org_users WHERE email = :email
        """), {"email": user_data["email"]}).scalar()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Create organization if needed
        if user_data.get("create_new_org", True):
            org_id = str(uuid.uuid4())
            
            # Create organization
            db.execute(text("""
                INSERT INTO organizations (
                    org_id, org_name, business_type,
                    primary_contact_name, primary_email, primary_phone,
                    business_address
                ) VALUES (
                    :org_id, :org_name, :business_type,
                    :contact_name, :email, :phone,
                    :address
                )
            """), {
                "org_id": org_id,
                "org_name": user_data["org_name"],
                "business_type": user_data.get("business_type", "pharmaceutical"),
                "contact_name": user_data["full_name"],
                "email": user_data["email"],
                "phone": user_data.get("phone"),
                "address": "{}"
            })
        else:
            # Join existing organization (would need invitation system)
            org_id = user_data["org_id"]
        
        # Create user
        password_hash = get_password_hash(user_data["password"])
        
        result = db.execute(text("""
            INSERT INTO org_users (
                org_id, full_name, email, phone,
                password_hash, role, is_active
            ) VALUES (
                :org_id, :full_name, :email, :phone,
                :password_hash, :role, true
            )
            RETURNING user_id
        """), {
            "org_id": org_id,
            "full_name": user_data["full_name"],
            "email": user_data["email"],
            "phone": user_data.get("phone"),
            "password_hash": password_hash,
            "role": "owner" if user_data.get("create_new_org", True) else "staff"
        })
        
        user_id = result.scalar()
        db.commit()
        
        # Create access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={
                "user_id": user_id,
                "email": user_data["email"],
                "org_id": org_id,
                "role": "owner" if user_data.get("create_new_org", True) else "staff"
            },
            expires_delta=access_token_expires
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "message": "Registration successful"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )

@router.post("/change-password")
async def change_password(
    password_data: Dict[str, str],
    current_user: Dict = Depends(get_current_user_and_org),
    db: Session = Depends(get_db)
):
    """Change user password"""
    # Verify current password
    user = db.execute(text("""
        SELECT password_hash
        FROM org_users
        WHERE user_id = :user_id
    """), {"user_id": current_user["user_id"]}).fetchone()
    
    if not verify_password(password_data["current_password"], user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Update password
    new_password_hash = get_password_hash(password_data["new_password"])
    
    db.execute(text("""
        UPDATE org_users
        SET password_hash = :password_hash,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = :user_id
    """), {
        "password_hash": new_password_hash,
        "user_id": current_user["user_id"]
    })
    
    db.commit()
    
    return {"message": "Password changed successfully"}