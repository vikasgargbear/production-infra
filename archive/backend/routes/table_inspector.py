"""
Table Inspector API - Get actual database table structure
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, List, Any

from ...core.database import get_db

router = APIRouter(prefix="/table-inspector", tags=["Table Inspector"])

@router.get("/columns/{schema}/{table}")
async def get_table_columns(schema: str, table: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get all columns for a specific table"""
    try:
        result = db.execute(text("""
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default,
                character_maximum_length,
                numeric_precision,
                numeric_scale
            FROM information_schema.columns
            WHERE table_schema = :schema
            AND table_name = :table
            ORDER BY ordinal_position
        """), {"schema": schema, "table": table})
        
        columns = []
        for row in result:
            columns.append({
                "name": row[0],
                "type": row[1],
                "nullable": row[2] == 'YES',
                "default": row[3],
                "max_length": row[4],
                "precision": row[5],
                "scale": row[6]
            })
        
        if not columns:
            raise HTTPException(status_code=404, detail=f"Table {schema}.{table} not found")
        
        return {
            "schema": schema,
            "table": table,
            "column_count": len(columns),
            "columns": columns
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sample-data/{schema}/{table}")
async def get_sample_data(schema: str, table: str, limit: int = 5, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get sample data from a table"""
    try:
        # First get column names
        cols_result = db.execute(text("""
            SELECT column_name 
            FROM information_schema.columns
            WHERE table_schema = :schema
            AND table_name = :table
            ORDER BY ordinal_position
        """), {"schema": schema, "table": table})
        
        columns = [row[0] for row in cols_result]
        
        if not columns:
            raise HTTPException(status_code=404, detail=f"Table {schema}.{table} not found")
        
        # Get sample data
        data_result = db.execute(text(f"""
            SELECT * FROM {schema}.{table}
            ORDER BY 1 DESC
            LIMIT :limit
        """), {"limit": limit})
        
        rows = []
        for row in data_result:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # Convert to JSON-serializable types
                if value is None:
                    row_dict[col] = None
                elif isinstance(value, (int, float, str, bool)):
                    row_dict[col] = value
                else:
                    row_dict[col] = str(value)
            rows.append(row_dict)
        
        return {
            "schema": schema,
            "table": table,
            "columns": columns,
            "row_count": len(rows),
            "data": rows
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/required-columns/{schema}/{table}")
async def get_required_columns(schema: str, table: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get only required (NOT NULL) columns for a table"""
    try:
        result = db.execute(text("""
            SELECT 
                column_name,
                data_type,
                column_default
            FROM information_schema.columns
            WHERE table_schema = :schema
            AND table_name = :table
            AND is_nullable = 'NO'
            ORDER BY ordinal_position
        """), {"schema": schema, "table": table})
        
        required = []
        for row in result:
            # Skip columns with defaults or auto-generated
            if row[2] and ('nextval' in str(row[2]) or 'CURRENT' in str(row[2]) or 'uuid_generate' in str(row[2])):
                continue
            required.append({
                "name": row[0],
                "type": row[1],
                "default": row[2]
            })
        
        return {
            "schema": schema,
            "table": table,
            "required_columns": required,
            "required_count": len(required)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))