"""Static SQL column validation against canonical domain catalogs.

This utility is used by CI and focused query-contract tests. It does not inspect
a live database and does not accept Markdown, retired captures, or legacy DDL as
schema authority.
"""

from __future__ import annotations

import ast
import hashlib
import json
import logging
from pathlib import Path
import re
from typing import Any, Iterable


logger = logging.getLogger(__name__)
_SCHEMA_CACHE: dict[str, set[str]] | None = None


def _default_canonical_domain_paths() -> list[Path]:
    repository_root = Path(__file__).resolve().parents[4]
    return sorted(
        (repository_root / "database" / "canonical" / "domains").glob("*.json")
    )


def _default_alembic_sql_paths() -> list[Path]:
    repository_root = Path(__file__).resolve().parents[4]
    return sorted((repository_root / "backend" / "alembic" / "sql").glob("*.sql"))


def _parse_canonical_domains(paths: Iterable[Path]) -> dict[str, set[str]]:
    schema_map: dict[str, set[str]] = {}
    for domain_path in paths:
        document = json.loads(domain_path.read_text(encoding="utf-8"))
        tables = document.get("tables", [])
        if not isinstance(tables, list):
            raise ValueError(f"{domain_path}: tables must be an array")
        for table in tables:
            if not isinstance(table, dict):
                raise ValueError(f"{domain_path}: table entries must be objects")
            name = table.get("name")
            columns = table.get("columns")
            if not isinstance(name, str) or "." not in name:
                raise ValueError(f"{domain_path}: invalid qualified table name {name!r}")
            if not isinstance(columns, list) or not columns:
                raise ValueError(f"{domain_path}: {name} has no column contract")
            if name in schema_map:
                raise ValueError(f"duplicate canonical table contract: {name}")
            parsed_columns = {
                column[0]
                for column in columns
                if isinstance(column, list)
                and column
                and isinstance(column[0], str)
            }
            if len(parsed_columns) != len(columns):
                raise ValueError(f"{domain_path}: {name} has invalid or duplicate columns")
            schema_map[name] = parsed_columns
    return schema_map


_QUALIFIED_RELATION = r'"?([a-z_][a-z0-9_]*)"?\."?([a-z_][a-z0-9_]*)"?'
_CREATE_TABLE = re.compile(
    rf"(?i)\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{_QUALIFIED_RELATION}\s*\("
)
_ALTER_TABLE = re.compile(
    rf"(?is)\bALTER\s+TABLE\s+{_QUALIFIED_RELATION}\s+(.*?);"
)
_ADD_COLUMN = re.compile(
    r'(?i)\bADD\s+COLUMN\s+"?([a-z_][a-z0-9_]*)"?\s+'
)


def _matching_parenthesis(source: str, opening_index: int) -> int:
    depth = 0
    quote: str | None = None
    index = opening_index
    while index < len(source):
        character = source[index]
        if quote:
            if character == quote:
                if index + 1 < len(source) and source[index + 1] == quote:
                    index += 2
                    continue
                quote = None
            index += 1
            continue
        if character in {"'", '"'}:
            quote = character
        elif character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
            if depth == 0:
                return index
        index += 1
    raise ValueError("Alembic CREATE TABLE statement has unbalanced parentheses")


def _top_level_items(body: str) -> list[str]:
    items: list[str] = []
    start = 0
    depth = 0
    quote: str | None = None
    index = 0
    while index < len(body):
        character = body[index]
        if quote:
            if character == quote:
                if index + 1 < len(body) and body[index + 1] == quote:
                    index += 2
                    continue
                quote = None
            index += 1
            continue
        if character in {"'", '"'}:
            quote = character
        elif character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
        elif character == "," and depth == 0:
            items.append(body[start:index])
            start = index + 1
        index += 1
    items.append(body[start:])
    return items


def _parse_alembic_schema_additions(
    paths: Iterable[Path], schema_map: dict[str, set[str]]
) -> dict[str, set[str]]:
    """Layer current post-baseline table/column DDL over reviewed catalogs."""
    result = {table: set(columns) for table, columns in schema_map.items()}
    canonical_schemas = {table.split(".", 1)[0] for table in result}
    for sql_path in paths:
        source = sql_path.read_text(encoding="utf-8")
        for match in _CREATE_TABLE.finditer(source):
            if match.group(1) not in canonical_schemas:
                continue
            table = f"{match.group(1)}.{match.group(2)}"
            closing = _matching_parenthesis(source, match.end() - 1)
            columns: set[str] = set()
            for item in _top_level_items(source[match.end():closing]):
                token = item.strip().split(None, 1)[0].strip('"') if item.strip() else ""
                if token.upper() in {
                    "CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "EXCLUDE"
                }:
                    continue
                if re.fullmatch(r"[a-z_][a-z0-9_]*", token):
                    columns.add(token)
            if not columns:
                raise ValueError(f"{sql_path}: {table} has no parseable columns")
            if table in result and not columns.issubset(result[table]):
                # The immutable baseline is represented by the domain catalogs;
                # later CREATE TABLE statements must not redefine it differently.
                raise ValueError(f"{sql_path}: conflicting CREATE TABLE for {table}")
            result.setdefault(table, set()).update(columns)
        for match in _ALTER_TABLE.finditer(source):
            if match.group(1) not in canonical_schemas:
                continue
            table = f"{match.group(1)}.{match.group(2)}"
            additions = set(_ADD_COLUMN.findall(match.group(3)))
            if additions:
                if table not in result:
                    raise ValueError(f"{sql_path}: ADD COLUMN targets unknown table {table}")
                result[table].update(additions)
    return result


def parse_schema_catalog(required: bool = False) -> dict[str, set[str]]:
    """Load the reviewed canonical table and column contracts."""
    global _SCHEMA_CACHE

    if _SCHEMA_CACHE is not None:
        return _SCHEMA_CACHE

    paths = _default_canonical_domain_paths()
    if not paths:
        message = "No canonical domain catalogs found under database/canonical/domains"
        if required:
            raise FileNotFoundError(message)
        logger.warning("%s. Skipping validation.", message)
        return {}

    schema_map = _parse_alembic_schema_additions(
        _default_alembic_sql_paths(), _parse_canonical_domains(paths)
    )
    if not schema_map:
        message = "Canonical domain catalogs contain no table definitions"
        if required:
            raise ValueError(message)
        logger.warning("%s. Skipping validation.", message)
        return {}

    _SCHEMA_CACHE = schema_map
    logger.info("Parsed canonical schema catalog: %s tables", len(schema_map))
    return schema_map


def extract_tables_and_columns(sql: str) -> list[tuple[str, str]]:
    """Extract resolvable alias.column references from one SQL string."""
    references: list[tuple[str, str]] = []
    alias_map: dict[str, set[str]] = {}
    table_tokens: set[str] = set()
    derived_aliases = {
        match.group(1).lower()
        for match in re.finditer(
            r"\)\s+(?:AS\s+)?(\w+)\s+ON\b", sql, re.IGNORECASE
        )
    }

    from_pattern = r"(?:FROM|JOIN)\s+(?:(\w+)\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?"
    reserved_aliases = {
        "cross", "full", "group", "having", "inner", "join", "left", "limit",
        "on", "order", "outer", "right", "union", "where",
    }
    for match in re.finditer(from_pattern, sql, re.IGNORECASE):
        schema = match.group(1)
        table = match.group(2)
        alias = match.group(3) or table
        if alias.lower() in reserved_aliases:
            alias = table
        full_table = f"{schema}.{table}" if schema else table
        alias_map.setdefault(alias.lower(), set()).add(full_table)
        table_tokens.add(full_table.lower())

    for match in re.finditer(r"\b(\w+)\.(\w+)\b", sql):
        table_or_alias = match.group(1).lower()
        column = match.group(2)
        if f"{table_or_alias}.{column}".lower() in table_tokens:
            continue
        if table_or_alias in derived_aliases:
            continue
        if table_or_alias in {"current_timestamp", "current_date", "information_schema"}:
            continue
        candidates = alias_map.get(table_or_alias)
        references.append(
            (next(iter(candidates)) if candidates and len(candidates) == 1 else table_or_alias, column)
        )

    return references


def _module_sql_strings(tree: ast.AST) -> list[tuple[str, int]]:
    """Return complete static SQL strings, including reconstructed f-strings.

    Formatted values cannot add relation or column identifiers to production
    queries. Replacing them with bind-like literals preserves the surrounding
    SQL structure while avoiding validation of incomplete f-string fragments.
    """
    strings: list[tuple[str, int]] = []

    class Visitor(ast.NodeVisitor):
        def visit_JoinedStr(self, node: ast.JoinedStr) -> None:  # noqa: N802
            parts: list[str] = []
            for value in node.values:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    parts.append(value.value)
                elif isinstance(value, ast.FormattedValue):
                    parts.append(":dynamic_value")
            strings.append(("".join(parts), node.lineno))
            # Do not visit Constant children as independent SQL fragments.

        def visit_Constant(self, node: ast.Constant) -> None:  # noqa: N802
            if isinstance(node.value, str):
                strings.append((node.value, node.lineno))

    Visitor().visit(tree)
    return strings


def validate_query(
    sql: str,
    strict: bool = True,
    schema_override: dict[str, set[str]] | None = None,
) -> dict[str, Any]:
    """Validate resolvable SQL column references against canonical catalogs."""
    schema = schema_override if schema_override is not None else parse_schema_catalog()
    if not schema:
        return {
            "valid": True,
            "errors": [],
            "warnings": ["Canonical schema catalog not found - skipping validation"],
            "references_checked": 0,
        }

    errors: list[str] = []
    warnings: list[str] = []
    references = extract_tables_and_columns(sql)
    for table, column in references:
        if table in schema:
            actual_table = table
        else:
            possible_tables = [name for name in schema if name.endswith(f".{table}")]
            if len(possible_tables) == 1:
                actual_table = possible_tables[0]
            elif len(possible_tables) > 1:
                warnings.append(
                    f"Ambiguous table '{table}' (could be: {', '.join(possible_tables)})"
                )
                continue
            else:
                # CTEs and subqueries do not have an independent catalog entry.
                continue
        if column not in schema[actual_table]:
            errors.append(
                f"Column '{column}' does not exist in canonical table "
                f"'{actual_table}'. Valid columns: "
                f"{', '.join(sorted(schema[actual_table]))}"
            )

    if errors and strict:
        raise ValueError(
            "SCHEMA VALIDATION ERROR:\n" + "\n".join(errors) + f"\n\nQuery:\n{sql}\n"
        )
    warnings.extend(errors if not strict else [])
    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "references_checked": len(references),
    }


def validate_module(module_path: Path) -> dict[str, Any]:
    """Validate SQL strings discoverable in a Python module."""
    if not module_path.exists():
        return {"error": f"File not found: {module_path}"}

    content = module_path.read_text(encoding="utf-8")
    results: dict[str, Any] = {
        "file": str(module_path),
        "total_queries": 0,
        "valid_queries": 0,
        "errors": [],
    }

    try:
        tree = ast.parse(content, filename=str(module_path))
    except SyntaxError as exc:
        return {**results, "errors": [{"line": exc.lineno or 1, "query_sha256": "", "query": "", "issues": [str(exc)]}]}

    for sql, line_number in _module_sql_strings(tree):
        if not re.search(r"(?i)\b(?:SELECT|INSERT|UPDATE|DELETE)\b", sql):
            continue
        if not re.search(r"(?i)\b(?:FROM|INTO|UPDATE)\b", sql):
            continue
        results["total_queries"] += 1
        metadata = {
            "line": line_number,
            "query_sha256": hashlib.sha256(
                " ".join(sql.split()).encode("utf-8")
            ).hexdigest(),
        }
        try:
            validation = validate_query(sql, strict=False)
        except Exception as exc:  # Report malformed catalog/query facts per file.
            results["errors"].append({
                "query": sql[:100] + "..." if len(sql) > 100 else sql,
                "issues": [str(exc)],
                **metadata,
            })
            continue
        if validation["valid"]:
            results["valid_queries"] += 1
        else:
            results["errors"].append({
                "query": sql[:100] + "..." if len(sql) > 100 else sql,
                "issues": validation["errors"],
                **metadata,
            })

    return results
