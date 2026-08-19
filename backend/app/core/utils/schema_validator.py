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

import hashlib
import json
import re
from typing import Dict, Iterable, Set, List, Tuple, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Cache for parsed schema
_SCHEMA_CACHE: Optional[Dict[str, Set[str]]] = None


def _default_schema_doc_paths() -> List[Path]:
    """Return checked-in schema documents in deterministic order."""
    repository_root = Path(__file__).resolve().parents[4]
    schema_directory = repository_root / "docs" / "backend" / "database" / "schemas"
    return sorted(schema_directory.glob("*.md"))


def _default_live_evidence_path() -> Path:
    repository_root = Path(__file__).resolve().parents[4]
    return repository_root / "database" / "live-schema-evidence.json"


def _load_live_verified_columns(path: Optional[Path] = None) -> Dict[str, Set[str]]:
    """Load the deliberately narrow query contract proven by a live capture."""
    evidence_path = path or _default_live_evidence_path()
    if not evidence_path.is_file():
        return {}

    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    if evidence.get("evidence_state") != "captured_not_baselined":
        raise ValueError("Live schema evidence must remain captured_not_baselined")

    for hash_field in ("artifact_sha256", "capture_sql_sha256"):
        value = evidence.get(hash_field, "")
        if not re.fullmatch(r"[0-9a-f]{64}", value):
            raise ValueError(f"Live schema evidence has invalid {hash_field}")

    verified = evidence.get("query_contract_verification", {}).get("verified_columns")
    if not isinstance(verified, dict):
        raise ValueError("Live schema evidence has no verified_columns mapping")

    schema_map: Dict[str, Set[str]] = {}
    qualified_table = re.compile(r"^[A-Za-z_]\w*\.[A-Za-z_]\w*$")
    identifier = re.compile(r"^[A-Za-z_]\w*$")
    for table, columns in verified.items():
        if not qualified_table.fullmatch(table) or not isinstance(columns, list):
            raise ValueError("Live schema evidence contains an invalid table contract")
        if not columns or any(
            not isinstance(column, str) or not identifier.fullmatch(column)
            for column in columns
        ):
            raise ValueError(f"Live schema evidence contains invalid columns for {table}")
        schema_map[table] = set(columns)

    return schema_map


def _parse_schema_docs(paths: Iterable[Path]) -> Dict[str, Set[str]]:
    """Parse schema-qualified Markdown table headings and their column tables."""
    schema_map: Dict[str, Set[str]] = {}
    table_heading = re.compile(r"^###\s+([A-Za-z_]\w*\.[A-Za-z_]\w*)\s*$")

    for schema_path in paths:
        current_table = None

        with schema_path.open("r", encoding="utf-8") as schema_file:
            for raw_line in schema_file:
                line = raw_line.strip()
                heading_match = table_heading.match(line)
                if heading_match:
                    current_table = heading_match.group(1)
                    schema_map.setdefault(current_table, set())
                    continue

                if line.startswith("### ") or line.startswith("---"):
                    current_table = None
                    continue

                if current_table is None or not line.startswith("|"):
                    continue

                parts = [part.strip() for part in line.split("|")]
                if len(parts) < 3:
                    continue

                column_name = parts[1].strip("`")
                if (
                    not column_name
                    or column_name.lower() in {"column", "field"}
                    or set(column_name) <= {"-", ":"}
                ):
                    continue

                schema_map[current_table].add(column_name)

    return {table: columns for table, columns in schema_map.items() if columns}


def parse_schema_doc(required: bool = False) -> Dict[str, Set[str]]:
    """
    Parse the 07-DATABASE-SCHEMA.md file to extract all table columns.
    
    Returns:
        Dict mapping "schema.table" -> Set of valid column names
    """
    global _SCHEMA_CACHE
    
    if _SCHEMA_CACHE is not None:
        return _SCHEMA_CACHE
    
    schema_paths = _default_schema_doc_paths()
    if not schema_paths:
        message = "No schema documentation found under docs/backend/database/schemas"
        if required:
            raise FileNotFoundError(message)
        logger.warning("%s. Skipping validation.", message)
        return {}

    schema_map = _parse_schema_docs(schema_paths)
    if not schema_map:
        message = "Schema documentation contains no usable table definitions"
        if required:
            raise ValueError(message)
        logger.warning("%s. Skipping validation.", message)
        return {}

    for table, columns in _load_live_verified_columns().items():
        schema_map.setdefault(table, set()).update(columns)
    
    _SCHEMA_CACHE = schema_map
    logger.info("Parsed schema docs: %s tables", len(schema_map))
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
        query_metadata = {
            "line": content.count("\n", 0, match.start()) + 1,
            "query_sha256": hashlib.sha256(" ".join(sql.split()).encode("utf-8")).hexdigest(),
        }
        
        try:
            validation = validate_query(sql, strict=False)
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
