"""
Company Information API Routes
Handles company data, settings, and organization information
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
import logging
from datetime import datetime

from app.core.database import get_db_connection
from app.api.routes.api_wrapper import create_api_response

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
async def get_company_info():
    """Get company information"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        
        # Check if company info exists
        cursor.execute("""
            SELECT name, address, phone, email, gst_number, state, logo, 
                   drug_license, bank_name, account_number, ifsc_code, upi_id,
                   created_at, updated_at
            FROM company_info 
            ORDER BY updated_at DESC 
            LIMIT 1
        """)
        
        company = cursor.fetchone()
        cursor.close()
        connection.close()
        
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
        
        return create_api_response(True, "Company info retrieved successfully", company)
        
    except Exception as e:
        logger.error(f"Error getting company info: {e}")
        return create_api_response(False, f"Error getting company info: {str(e)}")

@router.put("/info")
async def update_company_info(company_info: CompanyInfo):
    """Update company information"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # Check if company info exists
        cursor.execute("SELECT id FROM company_info LIMIT 1")
        existing = cursor.fetchone()
        
        if existing:
            # Update existing record
            cursor.execute("""
                UPDATE company_info 
                SET name = %s, address = %s, phone = %s, email = %s, 
                    gst_number = %s, state = %s, logo = %s, drug_license = %s,
                    bank_name = %s, account_number = %s, ifsc_code = %s, upi_id = %s,
                    updated_at = %s
                WHERE id = %s
            """, (
                company_info.name, company_info.address, company_info.phone, 
                company_info.email, company_info.gst_number, company_info.state,
                company_info.logo, company_info.drug_license, company_info.bank_name,
                company_info.account_number, company_info.ifsc_code, company_info.upi_id,
                datetime.now(), existing[0]
            ))
        else:
            # Create new record
            cursor.execute("""
                INSERT INTO company_info 
                (name, address, phone, email, gst_number, state, logo, drug_license,
                 bank_name, account_number, ifsc_code, upi_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                company_info.name, company_info.address, company_info.phone, 
                company_info.email, company_info.gst_number, company_info.state,
                company_info.logo, company_info.drug_license, company_info.bank_name,
                company_info.account_number, company_info.ifsc_code, company_info.upi_id,
                datetime.now(), datetime.now()
            ))
        
        connection.commit()
        cursor.close()
        connection.close()
        
        return create_api_response(True, "Company info updated successfully", company_info.dict())
        
    except Exception as e:
        logger.error(f"Error updating company info: {e}")
        return create_api_response(False, f"Error updating company info: {str(e)}")

@router.get("/org-id")
async def get_organization_id():
    """Get organization ID"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        
        # Get org ID from settings or generate default
        cursor.execute("SELECT org_id FROM organization_settings LIMIT 1")
        result = cursor.fetchone()
        cursor.close()
        connection.close()
        
        if result and result.get('org_id'):
            org_id = result['org_id']
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
async def get_company_settings():
    """Get company settings"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT currency, timezone, financial_year_start, default_gst_rate,
                   auto_backup, notification_settings
            FROM company_settings 
            ORDER BY updated_at DESC 
            LIMIT 1
        """)
        
        settings = cursor.fetchone()
        cursor.close()
        connection.close()
        
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
        
        return create_api_response(True, "Settings retrieved successfully", settings)
        
    except Exception as e:
        logger.error(f"Error getting company settings: {e}")
        return create_api_response(False, f"Error getting settings: {str(e)}")

@router.put("/settings")
async def update_company_settings(settings: CompanySettings):
    """Update company settings"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # Check if settings exist
        cursor.execute("SELECT id FROM company_settings LIMIT 1")
        existing = cursor.fetchone()
        
        if existing:
            # Update existing record
            cursor.execute("""
                UPDATE company_settings 
                SET currency = %s, timezone = %s, financial_year_start = %s,
                    default_gst_rate = %s, auto_backup = %s, notification_settings = %s,
                    updated_at = %s
                WHERE id = %s
            """, (
                settings.currency, settings.timezone, settings.financial_year_start,
                settings.default_gst_rate, settings.auto_backup, 
                settings.notification_settings, datetime.now(), existing[0]
            ))
        else:
            # Create new record
            cursor.execute("""
                INSERT INTO company_settings 
                (currency, timezone, financial_year_start, default_gst_rate,
                 auto_backup, notification_settings, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                settings.currency, settings.timezone, settings.financial_year_start,
                settings.default_gst_rate, settings.auto_backup,
                settings.notification_settings, datetime.now(), datetime.now()
            ))
        
        connection.commit()
        cursor.close()
        connection.close()
        
        return create_api_response(True, "Settings updated successfully", settings.dict())
        
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        return create_api_response(False, f"Error updating settings: {str(e)}")

@router.post("/initialize")
async def initialize_company_data():
    """Initialize company data with default values"""
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # Create company_info table if it doesn't exist
        cursor.execute("""
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
        """)
        
        # Create company_settings table if it doesn't exist
        cursor.execute("""
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
        """)
        
        # Insert default company info if none exists
        cursor.execute("SELECT id FROM company_info LIMIT 1")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO company_info (name, address, phone, email, gst_number, state)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                "Your Company Name",
                "Company Address",
                "+91 00000 00000",
                "info@company.com",
                "GST_NUMBER",
                "Gujarat"
            ))
        
        # Insert default settings if none exist
        cursor.execute("SELECT id FROM company_settings LIMIT 1")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO company_settings (currency, timezone, financial_year_start, default_gst_rate)
                VALUES (%s, %s, %s, %s)
            """, ("INR", "Asia/Kolkata", "04-01", 18.00))
        
        connection.commit()
        cursor.close()
        connection.close()
        
        return create_api_response(True, "Company data initialized successfully")
        
    except Exception as e:
        logger.error(f"Error initializing company data: {e}")
        return create_api_response(False, f"Error initializing: {str(e)}")