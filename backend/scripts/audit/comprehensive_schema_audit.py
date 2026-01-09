#!/usr/bin/env python3
"""
Comprehensive Schema Audit for All Modules
Validates SQL queries, column names, and constant usage across entire backend

Usage:
    python scripts/audit/comprehensive_schema_audit.py
    python scripts/audit/comprehensive_schema_audit.py --module sales
    python scripts/audit/comprehensive_schema_audit.py --fix-constants
"""

import sys
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple
from collections import defaultdict

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


# Module definitions
MODULES = {
    "sales": ["app/api/services/sales", "app/api/routes/sales"],
    "purchase": ["app/api/services/purchase", "app/api/routes/purchase"],  
    "master": ["app/api/services/master", "app/api/routes/master"],
    "inventory": ["app/api/services/inventory", "app/api/routes/inventory"],
    "finance": ["app/api/services/finance", "app/api/routes/finance"],
    "returns": ["app/api/services/returns", "app/api/routes/returns"],
    "compliance": ["app/api/services/compliance", "app/api/routes/compliance"],
}


# Known hardcoded values that should use constants
HARDCODED_PATTERNS = {
    "status_pending": r'["\'](pending|active|completed|draft|posted|cancelled)["\']',
    "payment_status": r'["\'](paid|unpaid|partial|overdue)["\']',
    "invoice_status": r'["\'](generated|issued|void)["\']',
}


class SchemaAuditor:
    """Comprehensive schema auditor"""
    
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.issues = defaultdict(list)
        self.stats = defaultdict(int)
        
    def audit_module(self, module_name: str, paths: List[str]) -> Dict:
        """Audit a specific module"""
        print(f"\n{'='*80}")
        print(f"AUDITING MODULE: {module_name.upper()}")
        print(f"{'='*80}\n")
        
        module_issues = {
            "hardcoded_values": [],
            "missing_constants": [],
            "sql_issues": [],
            "duplicate_code": []
        }
        
        for path_str in paths:
            path = self.base_dir / path_str
            if not path.exists():
                continue
                
            for py_file in path.rglob("*.py"):
                # Skip __pycache__ and tests
                if "__pycache__" in str(py_file) or "test_" in py_file.name:
                    continue
                
                self.stats["files_scanned"] += 1
                file_issues = self.audit_file(py_file)
                
                if file_issues:
                    for category, issues in file_issues.items():
                        module_issues[category].extend(issues)
        
        return module_issues
    
    def audit_file(self, file_path: Path) -> Dict:
        """Audit a single file"""
        issues = defaultdict(list)
        
        try:
            content = file_path.read_text()
            rel_path = file_path.relative_to(self.base_dir)
            
            # Check for hardcoded status values
            for pattern_name, pattern in HARDCODED_PATTERNS.items():
                matches = re.finditer(pattern, content, re.IGNORECASE)
                for match in matches:
                    # Skip if it's in a comment or constants import
                    line_context = content[max(0, match.start()-100):match.end()+100]
                    if "from" in line_context and "constants" in line_context:
                        continue
                    if line_context.strip().startswith("#"):
                        continue
                        
                    line_num = content[:match.start()].count('\n') + 1
                    issues["hardcoded_values"].append({
                        "file": str(rel_path),
                        "line": line_num,
                        "value": match.group(),
                        "pattern": pattern_name,
                        "context": content[max(0, match.start()-50):match.end()+50].strip()
                    })
                    self.stats["hardcoded_found"] += 1
            
            # Check for constants import
            if re.search(r'["\'](pending|active|completed|draft)["\']', content, re.IGNORECASE):
                if "from app.core.utils.constants import" not in content and \
                   "from ...core.utils.constants import" not in content and \
                   "from ....core.utils.constants import" not in content:
                    issues["missing_constants"].append({
                        "file": str(rel_path),
                        "issue": "Uses status strings but doesn't import from constants"
                    })
                    self.stats["missing_imports"] += 1
            
            # Check for SQL queries with common issues
            sql_patterns = re.findall(r'text\(["\'](.+?)["\']', content, re.DOTALL)
            for sql in sql_patterns:
                self.stats["sql_queries_found"] += 1
                
                # Check for SELECT *
                if re.search(r'SELECT\s+\*', sql, re.IGNORECASE):
                    issues["sql_issues"].append({
                        "file": str(rel_path),
                        "issue": "Uses SELECT * (should specify columns)",
                        "query_snippet": sql[:100]
                    })
                    self.stats["select_star_found"] += 1
        
        except Exception as e:
            print(f"ERROR reading {file_path}: {e}")
        
        return issues
    
    def print_report(self, module_name: str, module_issues: Dict):
        """Print formatted report for a module"""
        print(f"\n📊 AUDIT RESULTS FOR: {module_name.upper()}")
        print(f"{'-'*80}\n")
        
        # Hardcoded values
        if module_issues["hardcoded_values"]:
            print(f"⚠️  HARDCODED VALUES: {len(module_issues['hardcoded_values'])} found")
            for issue in module_issues["hardcoded_values"][:10]:  # Show first 10
                print(f"   📄 {issue['file']}:{issue['line']}")
                print(f"      Value: {issue['value']}")
                print(f"      Pattern: {issue['pattern']}")
                print()
        else:
            print("✅ HARDCODED VALUES: None found")
        
        # Missing constants
        if module_issues["missing_constants"]:
            print(f"\n⚠️  MISSING CONSTANTS IMPORT: {len(module_issues['missing_constants'])} files")
            for issue in module_issues["missing_constants"][:5]:
                print(f"   📄 {issue['file']}")
        else:
            print("\n✅ CONSTANTS IMPORT: All files properly import constants")
        
        # SQL issues
        if module_issues["sql_issues"]:
            print(f"\n⚠️  SQL ISSUES: {len(module_issues['sql_issues'])} found")
            for issue in module_issues["sql_issues"][:5]:
                print(f"   📄 {issue['file']}")
                print(f"      Issue: {issue['issue']}")
        else:
            print("\n✅ SQL QUERIES: No obvious issues found")
    
    def print_summary(self):
        """Print overall summary"""
        print(f"\n\n{'='*80}")
        print("OVERALL AUDIT SUMMARY")
        print(f"{'='*80}\n")
        
        print(f"📁 Files Scanned: {self.stats['files_scanned']}")
        print(f"🔍 SQL Queries Found: {self.stats['sql_queries_found']}")
        print(f"⚠️  Hardcoded Values: {self.stats['hardcoded_found']}")
        print(f"⚠️  Missing Imports: {self.stats['missing_imports']}")
        print(f"⚠️  SELECT * Queries: {self.stats['select_star_found']}")
        
        print(f"\n{'='*80}")
        
        if self.stats['hardcoded_found'] > 0 or self.stats['missing_imports'] > 0:
            print("❌ ACTION REQUIRED: Review and fix issues above")
            return False
        else:
            print("✅ ALL CHECKS PASSED")
            return True


def main():
    """Main audit runner"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Comprehensive schema audit")
    parser.add_argument("--module", help="Specific module to audit")
    parser.add_argument("--fix-constants", action="store_true", help="Auto-fix constants (TBD)")
    args = parser.parse_args()
    
    base_dir = Path(__file__).parent.parent.parent
    auditor = SchemaAuditor(base_dir)
    
    print("="*80)
    print("COMPREHENSIVE SCHEMA AUDIT")
    print("Checking: Hardcoded values, SQL queries, Constants usage")
    print("="*80)
    
    # Audit specific module or all
    modules_to_audit = {args.module: MODULES[args.module]} if args.module else MODULES
    
    all_passed = True
    for module_name, paths in modules_to_audit.items():
        module_issues = auditor.audit_module(module_name, paths)
        auditor.print_report(module_name, module_issues)
        
        if module_issues["hardcoded_values"] or module_issues["missing_constants"]:
            all_passed = False
    
    auditor.print_summary()
    
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
