#!/usr/bin/env python3
"""
Schema Audit Script - Find all column name mismatches across codebase

Scans all Python files for SQL queries and validates them against schema doc.
Outputs a report of all issues found.

Usage:
    python scripts/audit_schema.py
    python scripts/audit_schema.py --fix  # Auto-fix common aliases
"""

import sys
from pathlib import Path
from typing import Dict, List
import json

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.utils.schema_validator import parse_schema_doc, validate_module


# Common column aliases that should be replaced
KNOWN_ALIASES = {
    "gstin": "gst_number",
    "rate": "unit_price",
    "sale_price": "unit_price",
    "selling_price": "unit_price",
    "discount": "discount_percent",
    "total": "total_amount",
    "line_total": "total_amount",
    "gross_amount": "subtotal_amount",
    "net_amount": "final_amount",
}


def scan_directory(directory: Path) -> List[Dict]:
    """Scan all Python files in directory for schema issues."""
    results = []
    
    for py_file in directory.rglob("*.py"):
        # Skip migrations, tests, and venv
        if any(skip in str(py_file) for skip in ['migrations', '__pycache__', 'venv', '.venv', 'test_']):
            continue
        
        result = validate_module(py_file)
        
        if result.get("errors"):
            results.append(result)
    
    return results


def main():
    print("=" * 80)
    print("SCHEMA AUDIT - Validating all SQL queries against schema doc")
    print("=" * 80)
    print()
    
    # Parse schema first
    print("📖 Parsing schema doc...")
    schema = parse_schema_doc()
    print(f"✅ Found {len(schema)} tables in schema doc")
    print()
    
    # Scan backend code
    backend_dir = Path(__file__).parent.parent / "app"
    
    print(f"🔍 Scanning {backend_dir}...")
    results = scan_directory(backend_dir)
    
    # Print results
    print()
    print("=" * 80)
    print(f"AUDIT RESULTS: Found {len(results)} files with schema issues")
    print("=" * 80)
    print()
    
    total_errors = 0
    
    for result in results:
        file_path = result["file"]
        rel_path = Path(file_path).relative_to(Path.cwd())
        
        print(f"\n📄 {rel_path}")
        print(f"   Queries: {result['total_queries']} | Valid: {result['valid_queries']} | Issues: {len(result['errors'])}")
        
        for error in result["errors"]:
            total_errors += 1
            print(f"\n   ❌ Query: {error['query']}")
            for issue in error["issues"]:
                print(f"      {issue}")
    
    print()
    print("=" * 80)
    print(f"SUMMARY: {total_errors} schema errors found across {len(results)} files")
    print("=" * 80)
    
    if total_errors > 0:
        print()
        print("🔧 FIX REQUIRED: Review and fix the schema errors above")
        print()
        print("Common fixes:")
        for old, new in KNOWN_ALIASES.items():
            print(f"  - Replace '{old}' with '{new}'")
        
        sys.exit(1)
    else:
        print("\n✅ All SQL queries validated successfully!")
        sys.exit(0)


if __name__ == "__main__":
    main()
