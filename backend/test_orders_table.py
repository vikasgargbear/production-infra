#!/usr/bin/env python3
"""Test script to check sales.orders table structure"""
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not found in environment")
    exit(1)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if sales.orders table exists and get its columns
    result = conn.execute(text("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'sales' 
        AND table_name = 'orders'
        ORDER BY ordinal_position
    """))
    
    columns = list(result)
    if columns:
        print("sales.orders table columns:")
        for col in columns:
            print(f"  - {col.column_name}: {col.data_type} {'NULL' if col.is_nullable == 'YES' else 'NOT NULL'}")
        
        # Check if paid_amount exists
        column_names = [col.column_name for col in columns]
        print(f"\npaid_amount exists: {'paid_amount' in column_names}")
        print(f"balance_amount exists: {'balance_amount' in column_names}")
    else:
        print("sales.orders table not found!")