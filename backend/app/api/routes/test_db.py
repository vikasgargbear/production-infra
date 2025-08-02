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