"""
Test database connection and tables
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from ...core.database import get_db

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
        result = db.execute(text("""
            SELECT 
                org_id,
                organization_name,
                organization_code
            FROM master.organizations
            LIMIT 10
        """))
        
        orgs = []
        for row in result:
            orgs.append({
                "org_id": str(row.org_id),
                "name": row.organization_name,
                "code": row.organization_code
            })
        
        return {
            "organizations": orgs,
            "count": len(orgs)
        }
        
    except Exception as e:
        return {"error": str(e)}