#!/usr/bin/env python3
"""
Constants Usage Validator
Finds hardcoded status values and validates proper constants.py usage

Usage:
    python scripts/audit/validate_constants.py
    python scripts/audit/validate_constants.py --show-all
"""

import sys
import re
from pathlib import Path
from typing import Dict, List, Set
from collections import defaultdict

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


# Map of hardcoded values to their constants
CONSTANTS_MAP = {
    # Order statuses
    "pending": "OrderStatus.PENDING",
    "confirmed": "OrderStatus.CONFIRMED",
    "completed": "OrderStatus.COMPLETED",
    "cancelled": "OrderStatus.CANCELLED",
    "draft": "OrderStatus.DRAFT",
    
    # Invoice statuses
    "generated": "InvoiceStatus.GENERATED",
    "issued": "InvoiceStatus.ISSUED",
    "paid": "InvoiceStatus.PAID",
    
    # Payment statuses
    "unpaid": "InvoicePaymentStatus.UNPAID",
    "partial": "InvoicePaymentStatus.PARTIAL",
    "overdue": "InvoicePaymentStatus.OVERDUE",
    
    # Batch statuses
    "active": "BatchStatus.ACTIVE",
    "expired": "BatchStatus.EXPIRED",
    "quarantine": "BatchStatus.QUARANTINE",
    
    # Payment records
    "cleared": "PaymentRecordStatus.CLEARED",
    "processed": "PaymentRecordStatus.PROCESSED",
    "failed": "PaymentRecordStatus.FAILED",
    
    # GRN
    "received": "GRNStatus.RECEIVED",
    
    # Invoice types
    "tax_invoice": "InvoiceType.TAX_INVOICE",
    "posted": "JournalEntryStatus.POSTED",
}


class ConstantsValidator:
    """Validates constants usage across codebase"""
    
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.findings = []
        self.stats = defaultdict(int)
    
    def scan_file(self, file_path: Path):
        """Scan a single file for hardcoded constants"""
        try:
            content = file_path.read_text()
            rel_path = file_path.relative_to(self.base_dir)
            
            # Check if file imports constants
            has_constants_import = bool(re.search(
                r'from .+\.constants import',
                content
            ))
            
            # Find all potential hardcoded values
            pattern = r'=\s*["\'](' + '|'.join(CONSTANTS_MAP.keys()) + r')["\']'
            matches = re.finditer(pattern, content, re.IGNORECASE)
            
            for match in matches:
                value = match.group(1).lower()
                line_num = content[:match.start()].count('\n') + 1
                
                # Get line context
                lines = content.split('\n')
                line = lines[line_num - 1] if line_num <= len(lines) else ""
                
                # Skip SQL queries (these are OK)
                if re.search(r'text\s*\(["\']', line):
                    continue
                
                # Skip function parameters with defaults
                if "def " in line and "=" in line:
                    continue
                
                self.stats["hardcoded_found"] += 1
                
                self.findings.append({
                    "file": str(rel_path),
                    "line": line_num,
                    "value": value,
                    "suggested_constant": CONSTANTS_MAP.get(value, "UNKNOWN"),
                    "has_import": has_constants_import,
                    "line_content": line.strip()
                })
        
        except Exception as e:
            print(f"ERROR reading {file_path}: {e}")
    
    def scan_directory(self, directory: Path):
        """Scan all Python files in directory"""
        for py_file in directory.rglob("*.py"):
            # Skip migrations, tests, and venv
            if any(skip in str(py_file) for skip in ['migrations', '__pycache__', 'venv', 'test_', 'constants.py']):
                continue
            
            self.stats["files_scanned"] += 1
            self.scan_file(py_file)
    
    def print_report(self, show_all=False):
        """Print validation report"""
        print("\n" + "="*80)
        print("CONSTANTS USAGE VALIDATION REPORT")
        print("="*80 + "\n")
        
        if not self.findings:
            print("✅ NO HARDCODED VALUES FOUND!")
            print("✅ All code properly uses constants.py enums")
            return
        
        # Group by file
        by_file = defaultdict(list)
        for finding in self.findings:
            by_file[finding["file"]].append(finding)
        
        print(f"⚠️  Found {len(self.findings)} hardcoded values in {len(by_file)} files\n")
        
        # Show findings
        shown = 0
        for file_path, file_findings in sorted(by_file.items()):
            if not show_all and shown >= 10:
                print(f"\n... and {len(by_file) - 10} more files")
                print("Use --show-all to see full report")
                break
            
            print(f"\n📄 {file_path}")
            for finding in file_findings[:5]:  # Max 5 per file
                print(f"   Line {finding['line']}: {finding['value']}")
                print(f"   → Should use: {finding['suggested_constant']}")
                if not finding['has_import']:
                    print(f"   ⚠️  Missing constants import!")
                print()
            
            if len(file_findings) > 5:
                print(f"   ... and {len(file_findings) - 5} more in this file\n")
            
            shown += 1
        
        # Summary
        print("\n" + "="*80)
        print("SUMMARY")
        print("="*80)
        print(f"Files scanned: {self.stats['files_scanned']}")
        print(f"Hardcoded values: {len(self.findings)}")
        print(f"Files affected: {len(by_file)}")
        
        # Recommendations
        print("\n" + "="*80)
        print("RECOMMENDATIONS")
        print("="*80)
        print("\n1. Add constants import:")
        print("   from app.core.utils.constants import OrderStatus, InvoiceStatus, ...")
        print("\n2. Replace hardcoded strings:")
        print("   status = \"pending\"  →  status = OrderStatus.PENDING.value")
        print("\n3. In SQL queries, use .value:")
        print("   WHERE status = :status  (pass OrderStatus.PENDING.value)")


def main():
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--show-all", action="store_true", help="Show all findings")
    args = parser.parse_args()
    
    base_dir = Path(__file__).parent.parent.parent
    validator = ConstantsValidator(base_dir)
    
    print("Scanning codebase for hardcoded constants...")
    validator.scan_directory(base_dir / "app")
    
    validator.print_report(show_all=args.show_all)
    
    sys.exit(0 if not validator.findings else 1)


if __name__ == "__main__":
    main()
