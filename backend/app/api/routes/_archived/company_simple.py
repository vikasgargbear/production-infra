"""
Simple Company Information API Routes
Minimal implementation to avoid import issues
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/company", tags=["company"])

# In-memory storage for now
company_data = {
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

class CompanyInfo(BaseModel):
    name: str
    address: str
    phone: str
    email: str
    gst_number: Optional[str] = None
    state: Optional[str] = "Gujarat"
    logo: Optional[str] = None
    drug_license: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None

@router.get("/info")
async def get_company_info():
    """Get company information"""
    return {
        "success": True,
        "message": "Company info retrieved successfully",
        "data": company_data
    }

@router.put("/info")
async def update_company_info(company_info: CompanyInfo):
    """Update company information"""
    global company_data
    company_data = company_info.dict()
    return {
        "success": True,
        "message": "Company info updated successfully",
        "data": company_data
    }

@router.get("/org-id")
async def get_organization_id():
    """Get organization ID"""
    return {
        "success": True,
        "message": "Organization ID retrieved",
        "data": {"org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"}
    }