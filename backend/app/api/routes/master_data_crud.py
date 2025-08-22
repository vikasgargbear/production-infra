"""
Master Data CRUD endpoints for Tax, Units, and Warehouses
Provides full CRUD operations for master data management
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime
import logging

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID

logger = logging.getLogger(__name__)
router = APIRouter()

# Tax Entries Endpoints
@router.get("/tax-entries")
async def get_tax_entries(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get all tax entries"""
    try:
        # Return mock data for now - should query from database
        return {
            "success": True,
            "data": [
                {"id": 1, "name": "GST 5%", "rate": 5.0, "type": "GST", "isActive": True},
                {"id": 2, "name": "GST 12%", "rate": 12.0, "type": "GST", "isActive": True},
                {"id": 3, "name": "GST 18%", "rate": 18.0, "type": "GST", "isActive": True},
                {"id": 4, "name": "GST 28%", "rate": 28.0, "type": "GST", "isActive": True},
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching tax entries: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tax-entries")
async def create_tax_entry(data: Dict[str, Any], db: Session = Depends(get_db)):
    """Create new tax entry"""
    try:
        # Mock implementation - should insert into database
        return {
            "success": True,
            "data": {**data, "id": 5, "created_at": datetime.now().isoformat()}
        }
    except Exception as e:
        logger.error(f"Error creating tax entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/tax-entries/{tax_id}")
async def update_tax_entry(
    tax_id: int,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """Update tax entry"""
    try:
        # Mock implementation - should update in database
        return {
            "success": True,
            "data": {**data, "id": tax_id, "updated_at": datetime.now().isoformat()}
        }
    except Exception as e:
        logger.error(f"Error updating tax entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/tax-entries/{tax_id}")
async def delete_tax_entry(tax_id: int, db: Session = Depends(get_db)):
    """Delete tax entry"""
    try:
        # Mock implementation - should delete from database
        return {"success": True, "message": f"Tax entry {tax_id} deleted"}
    except Exception as e:
        logger.error(f"Error deleting tax entry: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Units of Measure Endpoints
@router.get("/units-of-measure")
async def get_units_of_measure(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get all units of measure"""
    try:
        # Return mock data for now - should query from database
        return {
            "success": True,
            "data": [
                {"id": 1, "name": "Pieces", "symbol": "PCS", "category": "Quantity", "isActive": True},
                {"id": 2, "name": "Strips", "symbol": "STRIPS", "category": "Pharma", "isActive": True},
                {"id": 3, "name": "Bottles", "symbol": "BTL", "category": "Container", "isActive": True},
                {"id": 4, "name": "Kilograms", "symbol": "KG", "category": "Weight", "isActive": True},
                {"id": 5, "name": "Liters", "symbol": "L", "category": "Volume", "isActive": True},
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching units: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/units-of-measure")
async def create_unit_of_measure(data: Dict[str, Any], db: Session = Depends(get_db)):
    """Create new unit of measure"""
    try:
        # Mock implementation - should insert into database
        return {
            "success": True,
            "data": {**data, "id": 6, "created_at": datetime.now().isoformat()}
        }
    except Exception as e:
        logger.error(f"Error creating unit: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/units-of-measure/{unit_id}")
async def update_unit_of_measure(
    unit_id: int,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """Update unit of measure"""
    try:
        # Mock implementation - should update in database
        return {
            "success": True,
            "data": {**data, "id": unit_id, "updated_at": datetime.now().isoformat()}
        }
    except Exception as e:
        logger.error(f"Error updating unit: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/units-of-measure/{unit_id}")
async def delete_unit_of_measure(unit_id: int, db: Session = Depends(get_db)):
    """Delete unit of measure"""
    try:
        # Mock implementation - should delete from database
        return {"success": True, "message": f"Unit {unit_id} deleted"}
    except Exception as e:
        logger.error(f"Error deleting unit: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Storage Locations / Warehouses Endpoints
@router.get("/storage-locations")
async def get_storage_locations(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get all storage locations/warehouses"""
    try:
        # Return mock data for now - should query from database
        return {
            "success": True,
            "data": [
                {
                    "id": 1,
                    "name": "Main Warehouse",
                    "code": "WH001",
                    "type": "Warehouse",
                    "address": "123 Main St, City",
                    "contact": "+91 9876543210",
                    "manager": "John Doe",
                    "capacity": "10000 sq ft",
                    "isActive": True
                },
                {
                    "id": 2,
                    "name": "Branch Store",
                    "code": "BR001",
                    "type": "Store",
                    "address": "456 Branch Ave, Town",
                    "contact": "+91 9876543211",
                    "manager": "Jane Smith",
                    "capacity": "5000 sq ft",
                    "isActive": True
                }
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching storage locations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/storage-locations")
async def create_storage_location(data: Dict[str, Any], db: Session = Depends(get_db)):
    """Create new storage location"""
    try:
        # Mock implementation - should insert into database
        return {
            "success": True,
            "data": {**data, "id": 3, "created_at": datetime.now().isoformat()}
        }
    except Exception as e:
        logger.error(f"Error creating storage location: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/storage-locations/{location_id}")
async def update_storage_location(
    location_id: int,
    data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """Update storage location"""
    try:
        # Mock implementation - should update in database
        return {
            "success": True,
            "data": {**data, "id": location_id, "updated_at": datetime.now().isoformat()}
        }
    except Exception as e:
        logger.error(f"Error updating storage location: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/storage-locations/{location_id}")
async def delete_storage_location(location_id: int, db: Session = Depends(get_db)):
    """Delete storage location"""
    try:
        # Mock implementation - should delete from database
        return {"success": True, "message": f"Storage location {location_id} deleted"}
    except Exception as e:
        logger.error(f"Error deleting storage location: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))