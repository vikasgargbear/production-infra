"""
Database Schema Documentation Generator

This script queries the database to generate accurate schema documentation.
Run from: backend/scripts/generate_schema_docs.py
"""
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def configured_database_url() -> str:
    """Return the explicitly configured URL without providing a hidden fallback."""
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for schema documentation")
    return database_url

def get_table_columns(engine, schema: str, table: str):
    """Get all columns for a table with their types and descriptions"""
    query = text("""
        SELECT 
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            COALESCE(pgd.description, '') as description
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_statio_all_tables st 
            ON c.table_schema = st.schemaname AND c.table_name = st.relname
        LEFT JOIN pg_catalog.pg_description pgd 
            ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = :schema AND c.table_name = :table
        ORDER BY c.ordinal_position
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query, {"schema": schema, "table": table})
        return [dict(row._mapping) for row in result]

def get_all_schemas_and_tables(engine):
    """Get all schemas and tables in the database"""
    query = text("""
        SELECT table_schema, table_name 
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query)
        return [dict(row._mapping) for row in result]

def generate_markdown_for_table(schema: str, table: str, columns: list) -> str:
    """Generate markdown documentation for a table"""
    lines = [
        f"### {schema}.{table}",
        "",
        "| Column | Type | Nullable | Default | Description |",
        "|--------|------|----------|---------|-------------|"
    ]
    
    for col in columns:
        nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
        default = col['column_default'] or ""
        if len(default) > 30:
            default = default[:30] + "..."
        desc = col['description'] or ""
        lines.append(f"| `{col['column_name']}` | {col['data_type']} | {nullable} | {default} | {desc} |")
    
    lines.append("")
    return "\n".join(lines)

def main():
    database_url = configured_database_url()
    safe_endpoint = make_url(database_url).render_as_string(hide_password=True)
    print("[SchemaGen] Connecting to database")
    print(f"[SchemaGen] Endpoint: {safe_endpoint}")

    engine = create_engine(
        database_url,
        connect_args={"options": "-c default_transaction_read_only=on"},
    )
    
    # Get all tables grouped by schema
    tables = get_all_schemas_and_tables(engine)
    
    schemas_dict = {}
    for t in tables:
        schema = t['table_schema']
        if schema not in schemas_dict:
            schemas_dict[schema] = []
        schemas_dict[schema].append(t['table_name'])
    
    print(f"[SchemaGen] Found {len(schemas_dict)} schemas with {len(tables)} tables")
    
    # Generate documentation for each schema
    for schema, table_list in sorted(schemas_dict.items()):
        print(f"\n=== Schema: {schema} ===")
        for table in table_list:
            columns = get_table_columns(engine, schema, table)
            print(generate_markdown_for_table(schema, table, columns))

if __name__ == "__main__":
    main()
