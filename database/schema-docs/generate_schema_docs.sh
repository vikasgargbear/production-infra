#!/bin/bash

# Script to generate current schema documentation from live database
# Date: 2025-10-16

echo "Generating schema documentation from live Railway database..."
echo "Date: $(date)"
echo ""

# Get database URL
DB_URL=$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")

# Function to get table list for a schema
get_tables() {
    schema=$1
    psql "$DB_URL" -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = '$schema' ORDER BY table_name;"
}

# Function to get column details for a table
get_columns() {
    schema=$1
    table=$2
    psql "$DB_URL" -t -c "
        SELECT
            column_name,
            data_type,
            character_maximum_length,
            is_nullable,
            column_default
        FROM information_schema.columns
        WHERE table_schema = '$schema' AND table_name = '$table'
        ORDER BY ordinal_position;
    "
}

# Core business schemas to document
SCHEMAS=("master" "parties" "inventory" "sales" "procurement" "financial" "gst" "compliance" "system_config" "analytics" "crm")

echo "=== SCHEMA TABLE COUNTS ==="
for schema in "${SCHEMAS[@]}"; do
    count=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$schema';")
    echo "$schema: $count tables"
done

echo ""
echo "=== TABLE LISTS BY SCHEMA ==="
for schema in "${SCHEMAS[@]}"; do
    echo ""
    echo "## $schema schema"
    get_tables "$schema"
done

echo ""
echo "Documentation generation complete!"
echo "Review output and update schema-docs/*.md files accordingly"
