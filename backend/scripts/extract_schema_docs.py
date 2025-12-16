#!/usr/bin/env python3
"""
Database Schema Documentation Extractor
Queries the actual database to get accurate column information.

Usage:
    python extract_schema_docs.py [--format=md|csv|json] [--output=path]
    
Environment:
    DATABASE_URL - PostgreSQL connection string (uses app config if not set)
"""

import os
import sys
import json
import argparse
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
except ImportError:
    print("Error: SQLAlchemy not installed. Run: pip install sqlalchemy psycopg2-binary")
    sys.exit(1)


def get_database_url():
    """Get database URL from environment or app config."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        try:
            from app.core.database import DATABASE_URL
            url = DATABASE_URL
        except ImportError:
            print("Error: DATABASE_URL not set and couldn't import from app config.")
            print("Set DATABASE_URL environment variable or run from backend directory.")
            sys.exit(1)
    return url


def extract_schema_info(session):
    """Extract all schema, table, and column information from the database."""
    
    # Query to get all tables and columns with their details
    query = text("""
        SELECT 
            c.table_schema,
            c.table_name,
            c.column_name,
            c.ordinal_position,
            c.data_type,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale,
            c.is_nullable,
            c.column_default,
            COALESCE(
                (SELECT pg_catalog.col_description(
                    (SELECT oid FROM pg_catalog.pg_class WHERE relname = c.table_name AND relnamespace = 
                        (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = c.table_schema)),
                    c.ordinal_position
                )), ''
            ) as column_comment,
            CASE 
                WHEN pk.column_name IS NOT NULL THEN 'PK'
                WHEN fk.column_name IS NOT NULL THEN 'FK'
                ELSE ''
            END as key_type,
            fk.foreign_table_name,
            fk.foreign_column_name
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT kcu.table_schema, kcu.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.table_schema = pk.table_schema 
            AND c.table_name = pk.table_name 
            AND c.column_name = pk.column_name
        LEFT JOIN (
            SELECT 
                kcu.table_schema,
                kcu.table_name, 
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu 
                ON tc.constraint_name = ccu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
        ) fk ON c.table_schema = fk.table_schema 
            AND c.table_name = fk.table_name 
            AND c.column_name = fk.column_name
        WHERE c.table_schema IN (
            'master', 'parties', 'inventory', 'sales', 'procurement',
            'financial', 'gst', 'compliance', 'analytics', 'system_config',
            'testing', 'api', 'public'
        )
        ORDER BY 
            CASE c.table_schema
                WHEN 'master' THEN 1
                WHEN 'parties' THEN 2
                WHEN 'inventory' THEN 3
                WHEN 'sales' THEN 4
                WHEN 'procurement' THEN 5
                WHEN 'financial' THEN 6
                WHEN 'gst' THEN 7
                WHEN 'compliance' THEN 8
                WHEN 'analytics' THEN 9
                WHEN 'system_config' THEN 10
                WHEN 'public' THEN 11
                ELSE 12
            END,
            c.table_name,
            c.ordinal_position
    """)
    
    results = session.execute(query).fetchall()
    return results


def format_data_type(row):
    """Format the data type with precision/length info."""
    data_type = row.data_type.upper()
    
    if row.character_maximum_length:
        return f"{data_type}({row.character_maximum_length})"
    elif row.numeric_precision and row.numeric_scale:
        return f"{data_type}({row.numeric_precision},{row.numeric_scale})"
    elif row.numeric_precision:
        return f"{data_type}({row.numeric_precision})"
    
    return data_type


def generate_markdown(results, output_path):
    """Generate Markdown documentation from schema results."""
    
    # Organize data by schema > table > columns
    schemas = {}
    for row in results:
        if row.table_schema not in schemas:
            schemas[row.table_schema] = {}
        if row.table_name not in schemas[row.table_schema]:
            schemas[row.table_schema][row.table_name] = []
        schemas[row.table_schema][row.table_name].append(row)
    
    # Generate Markdown
    lines = [
        "# Database Schema Reference",
        "",
        f"> **Auto-generated from database on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}**",
        "> This documentation is extracted directly from the production database schema.",
        "",
        "## Table of Contents",
        ""
    ]
    
    # TOC
    for schema_name in schemas:
        lines.append(f"- [{schema_name}](#{schema_name})")
        for table_name in schemas[schema_name]:
            lines.append(f"  - [{table_name}](#{schema_name}{table_name})")
    
    lines.append("")
    lines.append("---")
    lines.append("")
    
    # Schema Overview
    lines.append("## Schema Overview")
    lines.append("")
    lines.append("| Schema | Tables | Description |")
    lines.append("|--------|--------|-------------|")
    
    schema_descriptions = {
        'master': 'Core organizational and configuration data',
        'parties': 'Customers, suppliers, and business partners',
        'inventory': 'Product, batch, stock, and warehouse management',
        'sales': 'Orders, invoices, deliveries, and sales returns',
        'procurement': 'Purchase orders, goods receipts, and supplier management',
        'financial': 'Accounting, payments, banking, and financial reporting',
        'gst': 'GST compliance, returns, and tax management',
        'compliance': 'Licenses, inspections, and regulatory compliance',
        'analytics': 'Business intelligence, KPIs, and reporting',
        'system_config': 'System settings, integrations, and monitoring',
        'public': 'Shared functions and utilities',
        'testing': 'Testing framework and test utilities',
        'api': 'REST-style API functions'
    }
    
    for schema_name, tables in schemas.items():
        desc = schema_descriptions.get(schema_name, '')
        lines.append(f"| `{schema_name}` | {len(tables)} | {desc} |")
    
    lines.append("")
    lines.append("---")
    lines.append("")
    
    # Detailed schema sections
    for schema_name, tables in schemas.items():
        lines.append(f"## {schema_name}")
        lines.append("")
        lines.append(f"**Tables:** {', '.join([f'`{t}`' for t in tables.keys()])}")
        lines.append("")
        
        for table_name, columns in tables.items():
            lines.append(f"### {schema_name}.{table_name}")
            lines.append("")
            lines.append("| Column | Type | Key | Nullable | Default | Description |")
            lines.append("|--------|------|-----|----------|---------|-------------|")
            
            for col in columns:
                col_type = format_data_type(col)
                nullable = "YES" if col.is_nullable == 'YES' else "NO"
                default = col.column_default or ""
                if len(default) > 30:
                    default = default[:27] + "..."
                comment = col.column_comment or ""
                key = col.key_type
                if key == 'FK' and col.foreign_table_name:
                    key = f"FK→{col.foreign_table_name}"
                
                lines.append(f"| `{col.column_name}` | {col_type} | {key} | {nullable} | {default} | {comment} |")
            
            lines.append("")
    
    # Write output
    output = "\n".join(lines)
    
    if output_path:
        with open(output_path, 'w') as f:
            f.write(output)
        print(f"✅ Markdown documentation written to: {output_path}")
    else:
        print(output)


def generate_csv(results, output_path):
    """Generate CSV from schema results."""
    import csv
    
    headers = [
        'schema', 'table', 'column', 'position', 'data_type', 
        'max_length', 'precision', 'scale', 'nullable', 'default',
        'comment', 'key_type', 'fk_table', 'fk_column'
    ]
    
    rows = []
    for row in results:
        rows.append([
            row.table_schema,
            row.table_name,
            row.column_name,
            row.ordinal_position,
            row.data_type,
            row.character_maximum_length or '',
            row.numeric_precision or '',
            row.numeric_scale or '',
            row.is_nullable,
            row.column_default or '',
            row.column_comment or '',
            row.key_type,
            row.foreign_table_name or '',
            row.foreign_column_name or ''
        ])
    
    if output_path:
        with open(output_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            writer.writerows(rows)
        print(f"✅ CSV documentation written to: {output_path}")
    else:
        import io
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerows(rows)
        print(output.getvalue())


def generate_json(results, output_path):
    """Generate JSON from schema results."""
    
    # Organize data by schema > table > columns
    schemas = {}
    for row in results:
        if row.table_schema not in schemas:
            schemas[row.table_schema] = {"tables": {}}
        if row.table_name not in schemas[row.table_schema]["tables"]:
            schemas[row.table_schema]["tables"][row.table_name] = {"columns": []}
        
        schemas[row.table_schema]["tables"][row.table_name]["columns"].append({
            "name": row.column_name,
            "type": format_data_type(row),
            "nullable": row.is_nullable == 'YES',
            "default": row.column_default,
            "comment": row.column_comment,
            "key_type": row.key_type,
            "fk_reference": f"{row.foreign_table_name}.{row.foreign_column_name}" if row.foreign_table_name else None
        })
    
    output = {
        "generated_at": datetime.now().isoformat(),
        "schemas": schemas
    }
    
    if output_path:
        with open(output_path, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"✅ JSON documentation written to: {output_path}")
    else:
        print(json.dumps(output, indent=2))


def main():
    parser = argparse.ArgumentParser(description='Extract database schema documentation')
    parser.add_argument('--format', '-f', choices=['md', 'csv', 'json'], default='md',
                        help='Output format (default: md)')
    parser.add_argument('--output', '-o', type=str, default=None,
                        help='Output file path (default: stdout)')
    args = parser.parse_args()
    
    # Get database URL
    database_url = get_database_url()
    print(f"🔗 Connecting to database...")
    
    # Create engine and session
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        print("📊 Extracting schema information...")
        results = extract_schema_info(session)
        print(f"✅ Found {len(results)} columns across all schemas")
        
        # Generate output
        if args.format == 'md':
            generate_markdown(results, args.output)
        elif args.format == 'csv':
            generate_csv(results, args.output)
        elif args.format == 'json':
            generate_json(results, args.output)
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        session.close()


if __name__ == "__main__":
    main()
