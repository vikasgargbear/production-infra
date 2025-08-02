"""
Test database connection and tables
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from ...core.database import get_db
import traceback

router = APIRouter(prefix="/test", tags=["test"])

@router.get("/tables")
async def get_tables(db: Session = Depends(get_db)):
    """List all tables in the database"""
    try:
        # Query to get all tables
        result = db.execute(text("""
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_type = 'BASE TABLE' 
            AND table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name
        """))
        
        tables = []
        for row in result:
            tables.append({
                "schema": row.table_schema,
                "table": row.table_name,
                "full_name": f"{row.table_schema}.{row.table_name}"
            })
        
        return {
            "total_tables": len(tables),
            "tables": tables
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/check-customers")
async def check_customers_table(db: Session = Depends(get_db)):
    """Check if customers table exists in any schema"""
    try:
        result = db.execute(text("""
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_name = 'customers'
            AND table_type = 'BASE TABLE'
        """))
        
        tables = []
        for row in result:
            tables.append({
                "schema": row.table_schema,
                "table": row.table_name,
                "full_name": f"{row.table_schema}.{row.table_name}"
            })
        
        # Also try to query from parties.customers
        try:
            count = db.execute(text("SELECT COUNT(*) FROM parties.customers")).scalar()
            master_exists = True
            master_count = count
        except:
            master_exists = False
            master_count = 0
            
        # Try parties.customers
        try:
            count = db.execute(text("SELECT COUNT(*) FROM parties.customers")).scalar()
            parties_exists = True
            parties_count = count
        except:
            parties_exists = False
            parties_count = 0
            
        return {
            "found_tables": tables,
            "master.customers_exists": master_exists,
            "master.customers_count": master_count,
            "parties.customers_exists": parties_exists,
            "parties.customers_count": parties_count
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/check-customer-columns")
async def check_customer_columns(db: Session = Depends(get_db)):
    """Check columns in parties.customers table"""
    try:
        result = db.execute(text("""
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_schema = 'parties'
            AND table_name = 'customers'
            ORDER BY ordinal_position
        """))
        
        columns = []
        for row in result:
            columns.append({
                "name": row.column_name,
                "type": row.data_type,
                "nullable": row.is_nullable == 'YES',
                "default": row.column_default
            })
        
        return {
            "table": "parties.customers",
            "columns": columns,
            "total_columns": len(columns)
        }
        
    except Exception as e:
        return {"error": str(e)}

@router.get("/check-organizations")
async def check_organizations(db: Session = Depends(get_db)):
    """Check existing organizations"""
    try:
        # First check columns
        cols_result = db.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'master'
            AND table_name = 'organizations'
        """))
        
        columns = [row.column_name for row in cols_result]
        
        # Then get data
        result = db.execute(text("""
            SELECT *
            FROM master.organizations
            LIMIT 10
        """))
        
        orgs = []
        for row in result:
            org_dict = dict(row._mapping)
            if 'org_id' in org_dict:
                org_dict['org_id'] = str(org_dict['org_id'])
            orgs.append(org_dict)
        
        return {
            "columns": columns,
            "organizations": orgs,
            "count": len(orgs)
        }
        
    except Exception as e:
        return {"error": str(e)}

@router.get("/check-suppliers")
async def check_suppliers_table(db: Session = Depends(get_db)):
    """Check suppliers table structure"""
    try:
        # Get table info
        result = db.execute(text("""
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_schema = 'parties' 
                AND table_name = 'suppliers'
            ORDER BY ordinal_position
        """))
        
        columns = [dict(row._mapping) for row in result]
        
        # Try to get a sample supplier
        sample_result = db.execute(text("""
            SELECT * FROM parties.suppliers LIMIT 1
        """))
        
        sample = None
        for row in sample_result:
            sample = dict(row._mapping)
            break
        
        return {
            "table": "parties.suppliers",
            "columns": columns,
            "sample_data": sample,
            "column_count": len(columns)
        }
        
    except Exception as e:
        return {"error": str(e), "traceback": traceback.format_exc()}