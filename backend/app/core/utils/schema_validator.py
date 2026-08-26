"""Static SQL validation against the checked-in canonical domain catalogs."""

import hashlib
import json
import re
from typing import Dict, Iterable, Set, List, Tuple, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Cache for parsed schema
_SCHEMA_CACHE: Optional[Dict[str, Set[str]]] = None


def _default_canonical_domain_paths() -> List[Path]:
    """Return the sole reviewed static schema authority."""
    repository_root = Path(__file__).resolve().parents[4]
    return sorted((repository_root / "database" / "canonical" / "domains").glob("*.json"))


def _parse_canonical_domains(paths: Iterable[Path]) -> Dict[str, Set[str]]:
    schema_map: Dict[str, Set[str]] = {}
    for domain_path in paths:
        document = json.loads(domain_path.read_text(encoding="utf-8"))
        for table in document.get("tables", []):
            name = table.get("name")
            columns = table.get("columns", [])
            if not isinstance(name, str) or "." not in name:
                continue
            schema_map.setdefault(name, set()).update(
                column[0] for column in columns
                if isinstance(column, list) and column and isinstance(column[0], str)
            )
    return schema_map


def parse_schema_doc(required: bool = False) -> Dict[str, Set[str]]:
    """Load canonical domain catalogs as ``schema.table -> columns``."""
    global _SCHEMA_CACHE
    
    if _SCHEMA_CACHE is not None:
        return _SCHEMA_CACHE
    
    domain_paths = _default_canonical_domain_paths()
    if not domain_paths:
        message = "No canonical domain catalogs found under database/canonical/domains"
        if required:
            raise FileNotFoundError(message)
        logger.warning("%s. Skipping validation.", message)
        return {}

    schema_map = _parse_canonical_domains(domain_paths)
    if not schema_map:
        message = "Canonical domain catalogs contain no usable table definitions"
        if required:
            raise ValueError(message)
        logger.warning("%s. Skipping validation.", message)
        return {}

    _SCHEMA_CACHE = schema_map
    logger.info("Parsed canonical domain catalogs: %s tables", len(schema_map))
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
    table_tokens = set()
    
    # Find table aliases from FROM/JOIN clauses
    # Pattern: FROM schema.table alias or FROM table alias
    from_pattern = r'(?:FROM|JOIN)\s+(?:(\w+)\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?'
    for match in re.finditer(from_pattern, sql, re.IGNORECASE):
        schema = match.group(1)
        table = match.group(2)
        alias = match.group(3) or table
        
        full_table = f"{schema}.{table}" if schema else table
        alias_map[alias.lower()] = full_table
        table_tokens.add(full_table.lower())
    
    # Find column references
    # Pattern: identifier.column or just column
    column_pattern = r'\b(\w+)\.(\w+)\b'
    for match in re.finditer(column_pattern, sql):
        table_or_alias = match.group(1).lower()
        column = match.group(2)

        # A schema-qualified table in FROM/JOIN is not a column reference.
        if f"{table_or_alias}.{column}".lower() in table_tokens:
            continue
        
        # Skip common SQL keywords used as prefixes
        if table_or_alias in ['current_timestamp', 'current_date', 'information_schema']:
            continue
        
        # Resolve alias to actual table
        actual_table = alias_map.get(table_or_alias, table_or_alias)
        
        references.append((actual_table, column))
    
    return references


def validate_query(
    sql: str, strict: bool = True, schema_override: Optional[Dict[str, Set[str]]] = None
) -> Dict[str, any]:
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
    schema = schema_override or parse_schema_doc()
    
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
    schema_override = parse_schema_doc(required=True)
    
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
        query_metadata = {
            "line": content.count("\n", 0, match.start()) + 1,
            "query_sha256": hashlib.sha256(" ".join(sql.split()).encode("utf-8")).hexdigest(),
        }
        
        try:
            validation = validate_query(sql, strict=False, schema_override=schema_override)
            if validation["valid"]:
                results["valid_queries"] += 1
            else:
                results["errors"].append({
                    "query": sql[:100] + "..." if len(sql) > 100 else sql,
                    "issues": validation["errors"],
                    **query_metadata,
                })
        except Exception as e:
            results["errors"].append({
                "query": sql[:100] + "..." if len(sql) > 100 else sql,
                "issues": [str(e)],
                **query_metadata,
            })
    
    return results
