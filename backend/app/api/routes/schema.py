"""
Database Schema Documentation Endpoint

This endpoint queries the live database to generate accurate schema documentation.
It's the single source of truth for all table names, column names, and data types.

Usage:
  GET /api/schema/all - Get complete schema documentation
  GET /api/schema/{schema_name} - Get specific schema (e.g., 'inventory', 'parties')
  GET /api/schema/{schema_name}/{table_name} - Get specific table columns
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.auth.org_context import get_org_context, OrgContext
from ...core.security.permissions import PermissionChecker

router = APIRouter(prefix="/schema", tags=["Schema Documentation"])

# Data-bearing schemas installed by the canonical Alembic baseline.  Command,
# invariant, and security function schemas are intentionally not exposed as
# application data catalogs.
CANONICAL_DATA_SCHEMAS = (
    "automation",
    "calculation",
    "catalog",
    "compliance",
    "core",
    "finance",
    "hr",
    "inventory",
    "parties",
    "procurement",
    "sales",
    "tax",
)
_CANONICAL_DATA_SCHEMA_SET = frozenset(CANONICAL_DATA_SCHEMAS)


def _require_canonical_data_schema(schema_name: str) -> str:
    if schema_name not in _CANONICAL_DATA_SCHEMA_SET:
        raise HTTPException(
            status_code=404,
            detail=f"Canonical data schema '{schema_name}' is not published",
        )
    return schema_name


@router.get("/all")
async def get_all_schemas(
    _: dict = Depends(PermissionChecker("master", "view")),
    db: Session = Depends(get_db),
    context: OrgContext = Depends(get_org_context),
):
    """
    Get complete database schema documentation.
    Returns all schemas, tables, and columns from the live database.
    """
    try:
        # Publish only the data schemas owned by the canonical Alembic chain.
        schemas_query = """
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name = ANY(CAST(:schema_names AS text[]))
            ORDER BY schema_name
        """
        # P3-9: Safety LIMIT to prevent loading entire DB
        schemas_result = db.execute(
            text(schemas_query + " LIMIT 100"),
            {"schema_names": list(CANONICAL_DATA_SCHEMAS)},
        )
        schemas = [row[0] for row in schemas_result]
        
        result = {}
        
        for schema_name in schemas:
            # Get all tables in this schema
            tables_query = """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = :schema_name
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
            LIMIT 200  -- P3-9: Safety limit per schema
            """
            tables_result = db.execute(text(tables_query), {"schema_name": schema_name})
            tables = [row[0] for row in tables_result]
            
            schema_tables = {}
            
            for table_name in tables:
                # Get all columns for this table
                columns_query = """
                    SELECT 
                        column_name,
                        data_type,
                        is_nullable,
                        column_default,
                        character_maximum_length,
                        numeric_precision,
                        numeric_scale
                    FROM information_schema.columns
                    WHERE table_schema = :schema_name
                      AND table_name = :table_name
                    ORDER BY ordinal_position
                    LIMIT 500  -- P3-9: Safety limit for columns
                """
                columns_result = db.execute(text(columns_query), {
                    "schema_name": schema_name,
                    "table_name": table_name
                })
                
                columns = []
                for col in columns_result:
                    col_info = {
                        "name": col[0],
                        "type": col[1],
                        "nullable": col[2] == "YES",
                        "default": col[3],
                    }
                    if col[4]:  # character_maximum_length
                        col_info["max_length"] = col[4]
                    if col[5]:  # numeric_precision
                        col_info["precision"] = col[5]
                    if col[6]:  # numeric_scale
                        col_info["scale"] = col[6]
                    columns.append(col_info)
                
                schema_tables[table_name] = {
                    "full_name": f"{schema_name}.{table_name}",
                    "columns": columns,
                    "column_names": [c["name"] for c in columns]
                }
            
            result[schema_name] = {
                "tables": schema_tables,
                "table_names": list(schema_tables.keys())
            }
        
        return {
            "success": True,
            "data": result,
            "schema_names": schemas,
            "generated_at": "live from database"
        }
        
    except Exception as e:
        logging.getLogger(__name__).error(f"Schema query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve schema information")


@router.get("/{schema_name}")
async def get_schema(
    schema_name: str,
    _: dict = Depends(PermissionChecker("master", "view")),
    db: Session = Depends(get_db),
    context: OrgContext = Depends(get_org_context),
):
    """
    Get all tables and columns for a specific schema.
    """
    schema_name = _require_canonical_data_schema(schema_name)
    try:
        # Get all tables in this schema
        tables_query = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = :schema_name
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
            LIMIT 200  -- P3-9: Safety limit
        """
        tables_result = db.execute(text(tables_query), {"schema_name": schema_name})
        tables = [row[0] for row in tables_result]
        
        if not tables:
            raise HTTPException(status_code=404, detail=f"Schema '{schema_name}' not found or has no tables")
        
        schema_tables = {}
        
        for table_name in tables:
            # Get all columns for this table
            columns_query = """
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema = :schema_name
                  AND table_name = :table_name
                ORDER BY ordinal_position
                LIMIT 500  -- P3-9: Safety limit
            """
            columns_result = db.execute(text(columns_query), {
                "schema_name": schema_name,
                "table_name": table_name
            })
            
            columns = []
            for col in columns_result:
                columns.append({
                    "name": col[0],
                    "type": col[1],
                    "nullable": col[2] == "YES",
                    "default": col[3]
                })
            
            schema_tables[table_name] = {
                "full_name": f"{schema_name}.{table_name}",
                "columns": columns,
                "column_names": [c["name"] for c in columns]
            }
        
        return {
            "success": True,
            "schema": schema_name,
            "tables": schema_tables,
            "table_names": list(schema_tables.keys())
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Schema query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve schema information")


@router.get("/{schema_name}/{table_name}")
async def get_table(
    schema_name: str,
    table_name: str,
    _: dict = Depends(PermissionChecker("master", "view")),
    db: Session = Depends(get_db),
    context: OrgContext = Depends(get_org_context),
):
    """
    Get column details for a specific table.
    """
    schema_name = _require_canonical_data_schema(schema_name)
    try:
        # Get all columns for this table
        columns_query = """
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default,
                character_maximum_length,
                numeric_precision,
                numeric_scale
            FROM information_schema.columns
            WHERE table_schema = :schema_name
              AND table_name = :table_name
            ORDER BY ordinal_position
            LIMIT 500  -- P3-9: Safety limit
        """
        columns_result = db.execute(text(columns_query), {
            "schema_name": schema_name,
            "table_name": table_name
        })
        
        columns = []
        for col in columns_result:
            col_info = {
                "name": col[0],
                "type": col[1],
                "nullable": col[2] == "YES",
                "default": col[3],
            }
            if col[4]:
                col_info["max_length"] = col[4]
            if col[5]:
                col_info["precision"] = col[5]
            if col[6]:
                col_info["scale"] = col[6]
            columns.append(col_info)
        
        if not columns:
            raise HTTPException(status_code=404, detail=f"Table '{schema_name}.{table_name}' not found")
        
        return {
            "success": True,
            "full_name": f"{schema_name}.{table_name}",
            "columns": columns,
            "column_names": [c["name"] for c in columns],
            "column_count": len(columns)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Table query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve table information")
