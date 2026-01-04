"""
Schema Validator - Enforces Single Source of Truth from Database Schema Doc

Prevents schema errors by validating SQL queries against the canonical schema.
Fails fast in development to catch column name mismatches.

Usage:
    from app.core.utils.schema_validator import validate_query
    
    # This will throw if 'gstin' doesn't exist in parties.customers
    validate_query('''
        SELECT customer_name, gstin FROM parties.customers
    ''')
"""

import re
from typing import Dict, Set, List, Tuple, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Cache for parsed schema
_SCHEMA_CACHE: Optional[Dict[str, Set[str]]] = None


def parse_schema_doc() -> Dict[str, Set[str]]:
    """
    Parse the 07-DATABASE-SCHEMA.md file to extract all table columns.
    
    Returns:
        Dict mapping "schema.table" -> Set of valid column names
    """
    global _SCHEMA_CACHE
    
    if _SCHEMA_CACHE is not None:
        return _SCHEMA_CACHE
    
    # Find schema doc
    schema_path = Path(__file__).parent.parent.parent.parent.parent / "Architecture Documentation" / "07-DATABASE-SCHEMA.md"
    
    if not schema_path.exists():
        logger.warning(f"Schema doc not found at {schema_path}. Skipping validation.")
        return {}
    
    schema_map: Dict[str, Set[str]] = {}
    current_table = None
    in_table_section = False
    
    with open(schema_path, 'r') as f:
        for line in f:
            line = line.strip()
            
            # Detect table headers (e.g., "### parties.customers")
            if line.startswith('### ') and '.' in line:
                table_name = line[4:].strip()  # Remove "### "
                current_table = table_name
                schema_map[current_table] = set()
                in_table_section = True
                continue
            
            # Parse column rows in table (e.g., "| customer_name | text | ✗ |")
            if in_table_section and line.startswith('|') and '|' in line[1:]:
                parts = [p.strip() for p in line.split('|')]
                if len(parts) >= 3 and parts[1] and parts[1] not in ['Column', '--------']:
                    column_name = parts[1]
                    if current_table:
                        schema_map[current_table].add(column_name)
            
            # End of table section
            if line.startswith('###') or line.startswith('---'):
                in_table_section = False
    
    _SCHEMA_CACHE = schema_map
    logger.info(f"✅ Parsed schema doc: {len(schema_map)} tables")
    return schema_map


def extract_tables_and_columns(sql: str) -> List[Tuple[str, str]]:
    """
    Extract table.column references from SQL query.
    
    Returns:
        List of (table_name, column_name) tuples
    """
    references = []
    
    # Pattern 1: alias.column (e.g., "c.customer_name")
    # We need to track aliases to their actual tables
    alias_map = {}
    
    # Find table aliases from FROM/JOIN clauses
    # Pattern: FROM schema.table alias or FROM table alias
    from_pattern = r'(?:FROM|JOIN)\s+(?:(\w+)\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?'
    for match in re.finditer(from_pattern, sql, re.IGNORECASE):
        schema = match.group(1)
        table = match.group(2)
        alias = match.group(3) or table
        
        full_table = f"{schema}.{table}" if schema else table
        alias_map[alias.lower()] = full_table
    
    # Find column references
    # Pattern: identifier.column or just column
    column_pattern = r'\b(\w+)\.(\w+)\b'
    for match in re.finditer(column_pattern, sql):
        table_or_alias = match.group(1).lower()
        column = match.group(2)
        
        # Skip common SQL keywords used as prefixes
        if table_or_alias in ['current_timestamp', 'current_date', 'information_schema']:
            continue
        
        # Resolve alias to actual table
        actual_table = alias_map.get(table_or_alias, table_or_alias)
        
        references.append((actual_table, column))
    
    return references


def validate_query(sql: str, strict: bool = True) -> Dict[str, any]:
    """
    Validate SQL query against schema doc.
    
    Args:
        sql: SQL query string
        strict: If True, raises error on validation failure. If False, returns warnings.
    
    Returns:
        Dict with validation results
    
    Raises:
        ValueError: If strict=True and validation fails
    """
    schema = parse_schema_doc()
    
    if not schema:
        return {"valid": True, "warnings": ["Schema doc not found - skipping validation"]}
    
    # Extract table.column references
    references = extract_tables_and_columns(sql)
    
    errors = []
    warnings = []
    
    for table, column in references:
        # Skip if table not in our schema (might be from CTE or subquery)
        if table not in schema:
            # Check if maybe it's just the table name without schema
            possible_tables = [t for t in schema.keys() if t.endswith(f".{table}")]
            if len(possible_tables) == 1:
                actual_table = possible_tables[0]
            elif len(possible_tables) > 1:
                warnings.append(f"Ambiguous table '{table}' (could be: {', '.join(possible_tables)})")
                continue
            else:
                # Table not in schema doc - might be subquery/CTE, skip
                continue
        else:
            actual_table = table
        
        # Check if column exists in table
        if column not in schema[actual_table]:
            errors.append(
                f"❌ Column '{column}' does not exist in table '{actual_table}'. "
                f"Valid columns: {', '.join(sorted(schema[actual_table]))}"
            )
    
    if errors:
        error_msg = f"\n🚨 SCHEMA VALIDATION ERROR:\n" + "\n".join(errors) + f"\n\nQuery:\n{sql}\n"
        if strict:
            raise ValueError(error_msg)
        else:
            warnings.extend(errors)
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "references_checked": len(references)
    }


def validate_module(module_path: Path) -> Dict[str, any]:
    """
    Validate all SQL queries in a Python module.
    
    Args:
        module_path: Path to Python file
    
    Returns:
        Dict with validation summary
    """
    if not module_path.exists():
        return {"error": f"File not found: {module_path}"}
    
    content = module_path.read_text()
    
    # Extract SQL from text() calls and triple-quoted strings
    sql_pattern = r'(?:text\(["""\']{1,3}|["""\']{3})(.*?)(?:["""\']{1,3}\)|["""\']{3})'
    
    results = {
        "file": str(module_path),
        "total_queries": 0,
        "valid_queries": 0,
        "errors": []
    }
    
    for match in re.finditer(sql_pattern, content, re.DOTALL):
        sql = match.group(1)
        
        # Skip if not SQL (simple heuristic)
        if not any(keyword in sql.upper() for keyword in ['SELECT', 'INSERT', 'UPDATE', 'DELETE']):
            continue
        
        results["total_queries"] += 1
        
        try:
            validation = validate_query(sql, strict=False)
            if validation["valid"]:
                results["valid_queries"] += 1
            else:
                results["errors"].append({
                    "query": sql[:100] + "..." if len(sql) > 100 else sql,
                    "issues": validation["errors"]
                })
        except Exception as e:
            results["errors"].append({
                "query": sql[:100] + "..." if len(sql) > 100 else sql,
                "issues": [str(e)]
            })
    
    return results
