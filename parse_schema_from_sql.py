#!/usr/bin/env python3
"""
Schema Documentation Parser
Extracts table structures from SQL files and updates schema documentation
"""
import os
import re
import json
from pathlib import Path

def parse_sql_file(file_path):
    """Parse a SQL file and extract table definitions"""
    with open(file_path, 'r') as f:
        content = f.read()
    
    tables = {}
    
    # Find all CREATE TABLE statements
    table_pattern = r'CREATE TABLE\s+(\w+)\.(\w+)\s*\((.*?)\);'
    matches = re.findall(table_pattern, content, re.DOTALL | re.IGNORECASE)
    
    for schema, table, definition in matches:
        if schema not in tables:
            tables[schema] = {}
        
        # Parse column definitions
        columns = []
        foreign_keys = []
        
        lines = definition.split('\n')
        for line in lines:
            line = line.strip()
            if not line or line.startswith('--'):
                continue
                
            # Skip constraints and other non-column lines
            if any(keyword in line.upper() for keyword in ['CONSTRAINT', 'UNIQUE(', 'CHECK(', 'INDEX', 'PRIMARY KEY(']):
                continue
                
            # Parse column definition
            if ',' in line:
                line = line.rstrip(',')
            
            # Column pattern: column_name TYPE constraints
            col_match = re.match(r'(\w+)\s+([A-Z][A-Z0-9_()]*(?:\s*\[\])?)', line)
            if col_match:
                col_name = col_match.group(1)
                col_type = col_match.group(2)
                
                # Check if it's a primary key
                is_primary = 'PRIMARY KEY' in line
                
                # Check if it's required (NOT NULL)
                is_required = 'NOT NULL' in line and 'DEFAULT' not in line
                
                # Extract default value
                default_match = re.search(r'DEFAULT\s+([^,\n]+)', line)
                default_value = default_match.group(1).strip() if default_match else None
                
                # Check for foreign key reference
                fk_match = re.search(r'REFERENCES\s+(\w+)\.(\w+)\((\w+)\)', line)
                if fk_match:
                    foreign_keys.append({
                        'column_name': col_name,
                        'foreign_schema': fk_match.group(1),
                        'foreign_table': fk_match.group(2),
                        'foreign_column': fk_match.group(3)
                    })
                
                columns.append({
                    'name': col_name,
                    'type': col_type,
                    'primary_key': is_primary,
                    'required': is_required,
                    'default': default_value,
                    'nullable': 'YES' if not is_required else 'NO'
                })
        
        tables[schema][table] = {
            'columns': columns,
            'foreign_keys': foreign_keys
        }
    
    return tables

def get_all_schemas():
    """Parse all table SQL files and extract schema information"""
    base_path = '/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/database/02-tables'
    all_schemas = {}
    
    sql_files = [
        '01_master_tables.sql',
        '02_party_tables.sql', 
        '03_inventory_tables.sql',
        '04_sales_tables.sql',
        '05_procurement_tables.sql',
        '06_financial_tables.sql',
        '07_gst_tables.sql',
        '08_compliance_tables.sql',
        '09_analytics_tables.sql',
        '10_system_tables.sql'
    ]
    
    for sql_file in sql_files:
        file_path = os.path.join(base_path, sql_file)
        if os.path.exists(file_path):
            print(f"Parsing {sql_file}...")
            tables = parse_sql_file(file_path)
            for schema, schema_tables in tables.items():
                if schema not in all_schemas:
                    all_schemas[schema] = {}
                all_schemas[schema].update(schema_tables)
        else:
            print(f"File not found: {sql_file}")
    
    return all_schemas

def format_table_for_markdown(table_name, table_data):
    """Format table data for markdown documentation"""
    md_content = f"\n### {table_name}\n"
    md_content += "**Purpose**: [Business purpose description]\n"
    md_content += f"**API Endpoint**: `api.get_{table_name}()`, `api.create_{table_name.rstrip('s')}()`\n\n"
    
    # Table header
    md_content += "| Field | Type | Required | Description | Frontend Usage |\n"
    md_content += "|-------|------|----------|-------------|----------------|\n"
    
    # Table rows
    for col in table_data['columns']:
        required_mark = "✓" if col['required'] or col['primary_key'] else "-"
        col_type = col['type']
        
        # Add description placeholder
        description = "Description needed"
        if col['primary_key']:
            description = "Primary key identifier"
        elif 'org_id' in col['name']:
            description = "Organization ID"
        elif col['name'].endswith('_id') and not col['primary_key']:
            description = "Reference to related entity"
        elif col['name'].endswith('_at'):
            description = "Timestamp field"
        elif col['name'] in ['is_active', 'is_enabled']:
            description = "Active status flag"
        elif col['name'].startswith('created_'):
            description = "Creation audit field"
        elif col['name'].startswith('updated_'):
            description = "Update audit field"
        
        frontend_usage = "Standard field usage"
        if col['primary_key']:
            frontend_usage = "Primary key"
        elif 'org_id' in col['name']:
            frontend_usage = "Organization filtering"
        elif col['name'].endswith('_id') and not col['primary_key']:
            frontend_usage = "Association/lookup"
        
        md_content += f"| `{col['name']}` | {col_type} | {required_mark} | {description} | {frontend_usage} |\n"
    
    # Add foreign key information if present
    if table_data['foreign_keys']:
        md_content += "\n**Foreign Key Relationships**:\n"
        for fk in table_data['foreign_keys']:
            md_content += f"- `{fk['column_name']}` → `{fk['foreign_schema']}.{fk['foreign_table']}.{fk['foreign_column']}`\n"
    
    md_content += "\n---\n"
    return md_content

def update_schema_documentation(schema_name, schema_data):
    """Update schema documentation file"""
    schema_files = {
        'master': '01_master_schema.md',
        'parties': '02_parties_schema.md',
        'inventory': '03_inventory_schema.md',
        'sales': '04_sales_schema.md',
        'procurement': '05_procurement_schema.md',
        'financial': '06_financial_schema.md',
        'gst': '07_gst_schema.md',
        'compliance': '08_compliance_schema.md',
        'analytics': '10_analytics_schema.md',
        'system_config': '09_system_config_schema.md'
    }
    
    if schema_name not in schema_files:
        print(f"No documentation file mapped for schema: {schema_name}")
        return
    
    doc_file_path = f'/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/database/schema-docs/{schema_files[schema_name]}'
    
    # Read existing content to preserve structure
    if os.path.exists(doc_file_path):
        with open(doc_file_path, 'r') as f:
            existing_content = f.read()
    else:
        existing_content = ""
    
    # Extract header and overview sections
    header_end = existing_content.find('## Tables')
    if header_end > 0:
        header_content = existing_content[:header_end]
    else:
        header_content = f"# {schema_name.title()} Schema Documentation\n\n## Overview\nThe `{schema_name}` schema [description needed].\n\n---\n\n"
    
    # Generate tables section
    tables_content = "## Tables\n"
    for i, (table_name, table_data) in enumerate(schema_data.items(), 1):
        tables_content += f"\n### {i}. {table_name}\n"
        tables_content += format_table_for_markdown(table_name, table_data)
    
    # Combine content
    new_content = header_content + tables_content
    
    # Write updated content
    with open(doc_file_path, 'w') as f:
        f.write(new_content)
    
    print(f"Updated {doc_file_path}")

def main():
    """Main function to parse and update documentation"""
    print("Starting schema documentation update...")
    
    # Parse all schemas
    all_schemas = get_all_schemas()
    
    # Save raw data for reference
    with open('/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/parsed_schema_structure.json', 'w') as f:
        json.dump(all_schemas, f, indent=2)
    
    print(f"\nFound schemas: {list(all_schemas.keys())}")
    
    # Update documentation for each schema
    for schema_name, schema_data in all_schemas.items():
        print(f"\nUpdating {schema_name} schema documentation...")
        print(f"  Tables found: {list(schema_data.keys())}")
        update_schema_documentation(schema_name, schema_data)
    
    # Generate summary report
    summary = {
        'total_schemas': len(all_schemas),
        'schemas': {}
    }
    
    for schema_name, schema_data in all_schemas.items():
        summary['schemas'][schema_name] = {
            'table_count': len(schema_data),
            'tables': list(schema_data.keys())
        }
    
    with open('/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/schema_summary.json', 'w') as f:
        json.dump(summary, f, indent=2)
    
    print("\n" + "="*60)
    print("SCHEMA DOCUMENTATION UPDATE COMPLETE")
    print("="*60)
    print(f"Total schemas processed: {len(all_schemas)}")
    for schema_name, schema_data in all_schemas.items():
        print(f"  {schema_name}: {len(schema_data)} tables")
    print("\nFiles generated:")
    print("  - parsed_schema_structure.json (raw data)")
    print("  - schema_summary.json (summary)")
    print("  - Updated schema documentation files")

if __name__ == "__main__":
    main()