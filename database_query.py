#!/usr/bin/env python3
import os
import sys
from sqlalchemy import create_engine, text
import json

# Add the backend directory to Python path to use existing database configuration
sys.path.append('/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/backend')

# Use Railway connection string directly
DATABASE_URL = "postgresql://postgres:rCDLAhOCCnGfuslwJkxjgBAPJPRKjlbf@junction.proxy.rlwy.net:51470/railway"

def get_database_structure():
    try:
        # Create engine similar to backend configuration
        engine = create_engine(
            DATABASE_URL,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            echo=False,
            connect_args={
                "sslmode": "require",
                "connect_timeout": 30,
                "application_name": "schema_documentation_updater"
            }
        )
        
        print("Testing connection...")
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("Connection successful!")
            
            # Test if we can access information_schema
            result = conn.execute(text("SELECT schema_name FROM information_schema.schemata LIMIT 1"))
            print("Information schema access confirmed!")
        
        # Get actual database structure
        database_structure = {}
        
        with engine.connect() as conn:
            # Get all schemas
            print("Getting schemas...")
            result = conn.execute(text("""
                SELECT schema_name 
                FROM information_schema.schemata 
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast') 
                ORDER BY schema_name
            """))
            schemas = [row[0] for row in result.fetchall()]
            print(f"Found schemas: {schemas}")
            
            for schema in schemas:
                print(f"\nProcessing schema: {schema}")
                database_structure[schema] = {}
                
                # Get tables in this schema
                result = conn.execute(text("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = :schema
                    ORDER BY table_name
                """), {"schema": schema})
                tables = [row[0] for row in result.fetchall()]
                print(f"  Tables in {schema}: {tables}")
                
                for table in tables:
                    print(f"    Processing table: {table}")
                    database_structure[schema][table] = {
                        'columns': [],
                        'foreign_keys': []
                    }
                    
                    # Get column information
                    result = conn.execute(text("""
                        SELECT 
                            column_name,
                            data_type,
                            character_maximum_length,
                            is_nullable,
                            column_default,
                            CASE WHEN column_name IN (
                                SELECT column_name 
                                FROM information_schema.key_column_usage 
                                WHERE table_name = :table
                                AND table_schema = :schema
                                AND constraint_name LIKE '%_pkey'
                            ) THEN 'PRIMARY KEY' ELSE '' END as key_type
                        FROM information_schema.columns 
                        WHERE table_name = :table
                        AND table_schema = :schema
                        ORDER BY ordinal_position
                    """), {"table": table, "schema": schema})
                    
                    columns = result.fetchall()
                    for col in columns:
                        database_structure[schema][table]['columns'].append({
                            'name': col[0],
                            'type': col[1],
                            'max_length': col[2],
                            'nullable': col[3],
                            'default': col[4],
                            'key_type': col[5]
                        })
                    
                    # Get foreign key relationships
                    result = conn.execute(text("""
                        SELECT 
                            tc.constraint_name,
                            kcu.column_name,
                            ccu.table_schema AS foreign_table_schema,
                            ccu.table_name AS foreign_table_name,
                            ccu.column_name AS foreign_column_name
                        FROM information_schema.table_constraints AS tc 
                        JOIN information_schema.key_column_usage AS kcu
                            ON tc.constraint_name = kcu.constraint_name
                            AND tc.table_schema = kcu.table_schema
                        JOIN information_schema.constraint_column_usage AS ccu
                            ON ccu.constraint_name = tc.constraint_name
                            AND ccu.table_schema = tc.table_schema
                        WHERE tc.constraint_type = 'FOREIGN KEY' 
                        AND tc.table_schema = :schema
                        AND tc.table_name = :table
                    """), {"schema": schema, "table": table})
                    
                    foreign_keys = result.fetchall()
                    for fk in foreign_keys:
                        database_structure[schema][table]['foreign_keys'].append({
                            'constraint_name': fk[0],
                            'column_name': fk[1],
                            'foreign_schema': fk[2],
                            'foreign_table': fk[3],
                            'foreign_column': fk[4]
                        })
        
        engine.dispose()
        
        # Save to JSON file for processing
        with open('/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/database_structure.json', 'w') as f:
            json.dump(database_structure, f, indent=2, default=str)
        
        print(f"\nDatabase structure saved to database_structure.json")
        return database_structure
        
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    get_database_structure()