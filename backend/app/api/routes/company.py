"""
Company Information API Routes
Handles company data, settings, and organization information
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
import json

from ...core.database import get_db
from ..routes.api_wrapper import create_api_response

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/company", tags=["company"])

class CompanyInfo(BaseModel):
    name: str
    address: str
    phone: str
    email: EmailStr
    gst_number: Optional[str] = None
    state: Optional[str] = "Gujarat"
    logo: Optional[str] = None
    drug_license: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None

class CompanySettings(BaseModel):
    currency: Optional[str] = "INR"
    timezone: Optional[str] = "Asia/Kolkata"
    financial_year_start: Optional[str] = "04-01"  # DD-MM format
    default_gst_rate: Optional[float] = 18.0
    auto_backup: Optional[bool] = True
    notification_settings: Optional[dict] = {}

@router.get("/info")
async def get_company_info(db: Session = Depends(get_db)):
    """Get company information"""
    try:
        # Check if company info exists
        result = db.execute(text("""
            SELECT name, address, phone, email, gst_number, state, logo, 
                   drug_license, bank_name, account_number, ifsc_code, upi_id,
                   created_at, updated_at
            FROM company_info 
            ORDER BY updated_at DESC 
            LIMIT 1
        """))
        
        company = result.fetchone()
        
        if not company:
            # Return default company info if none exists
            default_company = {
                "name": "Your Company Name",
                "address": "Company Address",
                "phone": "+91 00000 00000", 
                "email": "info@company.com",
                "gst_number": "GST_NUMBER",
                "state": "Gujarat",
                "logo": None,
                "drug_license": None,
                "bank_name": None,
                "account_number": None,
                "ifsc_code": None,
                "upi_id": None
            }
            return create_api_response(True, "Default company info returned", default_company)
        
        # Convert row to dictionary
        company_dict = dict(company._mapping) if hasattr(company, '_mapping') else dict(zip(result.keys(), company))
        
        return create_api_response(True, "Company info retrieved successfully", company_dict)
        
    except Exception as e:
        logger.error(f"Error getting company info: {e}")
        return create_api_response(False, f"Error getting company info: {str(e)}")

@router.put("/info")
async def update_company_info(company_info: CompanyInfo, db: Session = Depends(get_db)):
    """Update company information"""
    try:
        # Check if company info exists
        result = db.execute(text("SELECT id FROM company_info LIMIT 1"))
        existing = result.fetchone()
        
        if existing:
            # Update existing record
            db.execute(text("""
                UPDATE company_info 
                SET name = :name, address = :address, phone = :phone, email = :email, 
                    gst_number = :gst_number, state = :state, logo = :logo, drug_license = :drug_license,
                    bank_name = :bank_name, account_number = :account_number, ifsc_code = :ifsc_code, 
                    upi_id = :upi_id, updated_at = :updated_at
                WHERE id = :id
            """), {
                "name": company_info.name, "address": company_info.address, "phone": company_info.phone, 
                "email": company_info.email, "gst_number": company_info.gst_number, "state": company_info.state,
                "logo": company_info.logo, "drug_license": company_info.drug_license, 
                "bank_name": company_info.bank_name, "account_number": company_info.account_number, 
                "ifsc_code": company_info.ifsc_code, "upi_id": company_info.upi_id,
                "updated_at": datetime.now(), "id": existing[0]
            })
        else:
            # Create new record
            db.execute(text("""
                INSERT INTO company_info 
                (name, address, phone, email, gst_number, state, logo, drug_license,
                 bank_name, account_number, ifsc_code, upi_id, created_at, updated_at)
                VALUES (:name, :address, :phone, :email, :gst_number, :state, :logo, :drug_license,
                         :bank_name, :account_number, :ifsc_code, :upi_id, :created_at, :updated_at)
            """), {
                "name": company_info.name, "address": company_info.address, "phone": company_info.phone, 
                "email": company_info.email, "gst_number": company_info.gst_number, "state": company_info.state,
                "logo": company_info.logo, "drug_license": company_info.drug_license, 
                "bank_name": company_info.bank_name, "account_number": company_info.account_number, 
                "ifsc_code": company_info.ifsc_code, "upi_id": company_info.upi_id,
                "created_at": datetime.now(), "updated_at": datetime.now()
            })
        
        db.commit()
        
        return create_api_response(True, "Company info updated successfully", company_info.dict())
        
    except Exception as e:
        logger.error(f"Error updating company info: {e}")
        return create_api_response(False, f"Error updating company info: {str(e)}")

@router.get("/org-id")
async def get_organization_id(db: Session = Depends(get_db)):
    """Get organization ID"""
    try:
        # Get org ID from settings or generate default
        result = db.execute(text("SELECT org_id FROM organization_settings LIMIT 1"))
        row = result.fetchone()
        
        if row and row[0]:
            org_id = row[0]
        else:
            # Use default org ID if none exists
            org_id = "ad808530-1ddb-4377-ab20-67bef145d80d"
        
        return create_api_response(True, "Organization ID retrieved", {"org_id": org_id})
        
    except Exception as e:
        logger.error(f"Error getting org ID: {e}")
        # Return default org ID on error
        default_org_id = "ad808530-1ddb-4377-ab20-67bef145d80d"
        return create_api_response(True, "Default org ID returned", {"org_id": default_org_id})

@router.get("/settings")
async def get_company_settings(db: Session = Depends(get_db)):
    """Get company settings"""
    try:
        result = db.execute(text("""
            SELECT currency, timezone, financial_year_start, default_gst_rate,
                   auto_backup, notification_settings
            FROM company_settings 
            ORDER BY updated_at DESC 
            LIMIT 1
        """))
        
        settings = result.fetchone()
        
        if not settings:
            # Return default settings
            default_settings = {
                "currency": "INR",
                "timezone": "Asia/Kolkata",
                "financial_year_start": "04-01",
                "default_gst_rate": 18.0,
                "auto_backup": True,
                "notification_settings": {}
            }
            return create_api_response(True, "Default settings returned", default_settings)
        
        # Convert row to dictionary
        settings_dict = dict(settings._mapping) if hasattr(settings, '_mapping') else dict(zip(result.keys(), settings))
        
        return create_api_response(True, "Settings retrieved successfully", settings_dict)
        
    except Exception as e:
        logger.error(f"Error getting company settings: {e}")
        return create_api_response(False, f"Error getting settings: {str(e)}")

@router.put("/settings")
async def update_company_settings(settings: CompanySettings, db: Session = Depends(get_db)):
    """Update company settings"""
    try:
        # Check if settings exist
        result = db.execute(text("SELECT id FROM company_settings LIMIT 1"))
        existing = result.fetchone()
        
        if existing:
            # Update existing record
            db.execute(text("""
                UPDATE company_settings 
                SET currency = :currency, timezone = :timezone, financial_year_start = :fys,
                    default_gst_rate = :gst_rate, auto_backup = :auto_backup, 
                    notification_settings = :notif_settings, updated_at = :updated_at
                WHERE id = :id
            """), {
                "currency": settings.currency, "timezone": settings.timezone, 
                "fys": settings.financial_year_start, "gst_rate": settings.default_gst_rate, 
                "auto_backup": settings.auto_backup, 
                "notif_settings": json.dumps(settings.notification_settings) if settings.notification_settings else None,
                "updated_at": datetime.now(), "id": existing[0]
            })
        else:
            # Create new record
            db.execute(text("""
                INSERT INTO company_settings 
                (currency, timezone, financial_year_start, default_gst_rate,
                 auto_backup, notification_settings, created_at, updated_at)
                VALUES (:currency, :timezone, :fys, :gst_rate, :auto_backup, :notif_settings, :created_at, :updated_at)
            """), {
                "currency": settings.currency, "timezone": settings.timezone, 
                "fys": settings.financial_year_start, "gst_rate": settings.default_gst_rate,
                "auto_backup": settings.auto_backup, 
                "notif_settings": json.dumps(settings.notification_settings) if settings.notification_settings else None,
                "created_at": datetime.now(), "updated_at": datetime.now()
            })
        
        db.commit()
        
        return create_api_response(True, "Settings updated successfully", settings.dict())
        
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        return create_api_response(False, f"Error updating settings: {str(e)}")

@router.post("/initialize")
async def initialize_company_data(db: Session = Depends(get_db)):
    """Initialize company data with default values"""
    try:
        
        # Create company_info table if it doesn't exist
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS company_info (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                address TEXT,
                phone VARCHAR(20),
                email VARCHAR(100),
                gst_number VARCHAR(15),
                state VARCHAR(50) DEFAULT 'Gujarat',
                logo TEXT,
                drug_license VARCHAR(50),
                bank_name VARCHAR(100),
                account_number VARCHAR(20),
                ifsc_code VARCHAR(11),
                upi_id VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """))
        
        # Create company_settings table if it doesn't exist
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS company_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                currency VARCHAR(3) DEFAULT 'INR',
                timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
                financial_year_start VARCHAR(5) DEFAULT '04-01',
                default_gst_rate DECIMAL(5,2) DEFAULT 18.00,
                auto_backup BOOLEAN DEFAULT TRUE,
                notification_settings JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """))
        
        # Insert default company info if none exists
        result = db.execute(text("SELECT id FROM company_info LIMIT 1"))
        if not result.fetchone():
            db.execute(text("""
                INSERT INTO company_info (name, address, phone, email, gst_number, state)
                VALUES (:name, :address, :phone, :email, :gst_number, :state)
            """), {
                "name": "Your Company Name",
                "address": "Company Address",
                "phone": "+91 00000 00000",
                "email": "info@company.com",
                "gst_number": "GST_NUMBER",
                "state": "Gujarat"
            })
        
        # Insert default settings if none exist
        result = db.execute(text("SELECT id FROM company_settings LIMIT 1"))
        if not result.fetchone():
            db.execute(text("""
                INSERT INTO company_settings (currency, timezone, financial_year_start, default_gst_rate)
                VALUES (:currency, :timezone, :fys, :gst_rate)
            """), {
                "currency": "INR", 
                "timezone": "Asia/Kolkata", 
                "fys": "04-01", 
                "gst_rate": 18.00
            })
        
        db.commit()
        
        return create_api_response(True, "Company data initialized successfully")
        
    except Exception as e:
        logger.error(f"Error initializing company data: {e}")
        return create_api_response(False, f"Error initializing: {str(e)}")