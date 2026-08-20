#!/usr/bin/env python3
"""Generate an agent-readable dictionary from the canonical column authority."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG_ROOT = REPO_ROOT / "database" / "canonical" / "domains"
DEFAULT_OUTPUT = REPO_ROOT / "docs" / "architecture" / "canonical-field-dictionary.json"
FORBIDDEN_COLUMN_ALIASES = {
    "allocated_amount",
    "amount_total",
    "credit_amount",
    "final_amount",
    "generate_no",
    "gst_percent",
    "gst_percentage",
    "invoice_status",
    "order_status",
    "price_mode",
    "qty",
    "tax_percent",
    "unit_rate",
    "version",
}
POLYMORPHIC_TYPE_NAMES = {"code", "description", "id", "name"}
CONTEXTUAL_SEMANTIC_NAMES = {
    "code",
    "description",
    "id",
    "name",
    "reason",
    "status",
}
CONFUSION_NOTES = {
    "billed_quantity": "Billed quantity excludes free quantity and is not a base-UOM quantity.",
    "free_quantity": "Free quantity is commercial supply quantity, not a zero-price billed quantity.",
    "base_billed_quantity": "Base billed quantity is converted with the persisted UOM factor; do not recompute it from a current product conversion.",
    "base_free_quantity": "Base free quantity is converted free supply; it is not included in billed quantity.",
    "gross_amount": "Gross amount precedes discounts; it is not GST taxable value or final payable value.",
    "net_value_amount": "Net value is pre-tax value after discounts; exempt/non-GST value can be included while GST taxable value is lower.",
    "gst_taxable_value": "GST taxable value is the legal GST basis, not total pre-tax net value.",
    "counterparty_payable_amount": "Counterparty payable excludes organization self-assessed reverse-charge tax.",
    "self_assessed_tax_amount": "Self-assessed tax is an organization liability and is not payable to the counterparty.",
    "recipient_assessed_tax_amount": "Recipient-assessed tax is compliance evidence; direction determines whether this organization self-assesses it.",
    "quoted_unit_rate": "Quoted rate is the persisted commercial quote; do not replace it with a rounded derived tax-exclusive unit rate.",
    "rounding_adjustment": "Rounding adjustment is a signed final residual, not a discount or tax component.",
    "document_number": "Business document number is human/legal identity; the UUID id remains the relational identity.",
    "status": "Status is the lifecycle state of this exact aggregate, not payment, tax, or inventory state from another table.",
    "mrp": "MRP is the tax-inclusive INR ceiling for one marketed pack; it is not a transaction unit rate or a price per base UOM.",
    "mrp_uom_conversion_id": "The MRP UOM conversion fixes the marketed-pack basis; it is not an optional sale-line conversion selected at order time.",
    "drug_schedule": "Drugs Rules prescription schedules are independent of Schedule H2 traceability and NDPS classification.",
    "itc_eligibility": "ITC eligibility is an inward-tax-credit decision; it is not the line's GST taxability or reverse-charge mechanism.",
    "zero_rated_payment_mode": "Zero-rated IGST payment mode is not the same fact as exemption, nil rating, or non-GST taxability.",
}

EXACT_FIELD_DEFINITIONS = {
    "catalog.products.name": (
        "Canonical product name presented in product selection and retained product identity; "
        "generic ingredient name and strength are separate fields."
    ),
    "inventory.batches.mrp": (
        "Tax-inclusive Maximum Retail Price in INR for one marketed pack of this batch, "
        "with the pack fixed by mrp_uom_conversion_id."
    ),
    "inventory.batches.mrp_uom_conversion_id": (
        "Required catalog.uom_conversions row that fixes the marketed pack carrying this "
        "batch MRP and converts that pack to the same product's base UOM; it must be active "
        "and effective on the batch creation date."
    ),
    "catalog.products.drug_schedule": (
        "Drugs Rules prescription-sale schedule classification of this product. NONE means "
        "no G, H, H1, or X classification; this field does not represent Schedule H2 "
        "traceability or NDPS control."
    ),
    "parties.tax_registrations.taxpayer_type": (
        "GST registration taxpayer category recorded for the counterparty, using the exact "
        "reviewed GST vocabulary that governs registration-specific tax handling."
    ),
    "procurement.supplier_invoice_lines.itc_eligibility": (
        "Input Tax Credit eligibility snapshot for this inward-supply line: eligible may be "
        "claimed, blocked or ineligible may not be claimed, and deferred awaits a later "
        "claim event."
    ),
    "sales.invoices.zero_rated_payment_mode": (
        "IGST payment route for a zero-rated sales invoice: with_igst records payment of "
        "IGST, without_payment records supply under the no-payment route, and "
        "not_applicable is required for a non-zero-rated invoice."
    ),
}

SHARED_FIELD_GLOSSARY = {
    "arn": "GST return Acknowledgement Reference Number issued by the portal for the filed return evidence.",
    "attestation_method": "Method by which the calculation authority attested that the exact input produced the exact output.",
    "calculator_principal": "Authenticated calculator identity that produced and attested this calculation artifact.",
    "calculation_ruleset_version": "Exact reviewed tax and decimal calculation ruleset version persisted with this document; later rule changes do not reinterpret it.",
    "chain_sequence": "Monotonic sequence number of this event within its tenant audit hash chain.",
    "cin": "Corporate Identity Number assigned to the organization under Indian company registration records.",
    "document_discount_basis": "Value basis over which the document-level discount is allocated; taxable_value and price_value are not interchangeable.",
    "document_discount_kind": "Document-level discount input form: none, percentage, or exact currency amount as constrained by this table.",
    "counterparty_gstin": "GSTIN of the counterparty snapshotted on the tax document used for filing and reconciliation.",
    "deposit_due_day": "Calendar day number used by this withholding rule to derive the statutory deposit due date.",
    "deposit_month_offset": "Whole-month offset from the deduction period used by this withholding rule to derive the deposit due month.",
    "dosage_form": "Human-readable pharmaceutical dosage form recorded for the product, such as tablet, capsule, liquid, or injection; it is not ingredient strength.",
    "free_supply_tax_treatment": "Rule determining whether free commercial quantity contributes zero taxable value or contributes value at the persisted unit rate.",
    "fiscal_year": "Starting calendar year of the Indian April-to-March fiscal year that owns this document number.",
    "fiscal_year_start_from": "First Indian fiscal-year starting year for which this withholding rule version applies.",
    "fiscal_year_start_to": "Last Indian fiscal-year starting year for which this withholding rule version applies; null means no declared upper bound.",
    "fiscal_year_start_year": "Starting calendar year of the Indian April-to-March fiscal year represented by this tax fact.",
    "gtin": "Global Trade Item Number recorded for the marketed product package, preserving its check-digit-bearing identifier.",
    "gstin": "15-character Goods and Services Tax Identification Number recorded as statutory registration evidence.",
    "gst_tax_treatment": "GST consequence selected for this return or adjustment, including whether output tax or input tax credit is reversed.",
    "itc_eligibility": "Input Tax Credit eligibility snapshot for this inward-supply or adjustment fact; it is distinct from GST taxability and reverse charge.",
    "ifsc": "Indian Financial System Code identifying the bank branch for this settlement account.",
    "irn": "Invoice Reference Number returned by the GST e-invoice system for the exact invoice payload.",
    "line_discount_basis": "Value basis to which this line discount applies; taxable_value and price_value produce different GST outcomes.",
    "line_discount_kind": "Line-level discount input form: none, percentage, or exact currency amount as constrained by this table.",
    "line_kind": "Commercial line classification distinguishing a product quantity from a typed non-product charge.",
    "next_value": "Next unallocated integer in this document sequence; allocation advances it atomically and formatted document identity uses the configured prefix and suffix.",
    "operation": "Canonical operation key naming the exact reviewed command or calculation performed.",
    "pan": "Permanent Account Number recorded as Indian direct-tax identity evidence.",
    "price_basis": "Whether the persisted quoted price includes GST or excludes GST before the canonical decimal calculation.",
    "prefix": "Literal text prepended to the numeric portion allocated by this document sequence.",
    "required_approval_count": "Exact number of distinct qualifying approvals required before this command may execute.",
    "response_status": "HTTP-style status code retained with the exact command response envelope for deterministic replay.",
    "rounding_policy": "Reviewed rule used to convert the exact pre-round document total into the persisted payable total.",
    "tax_regime": "Indian direct-tax regime under which this withholding fact or rule is evaluated.",
    "tan": "Tax Deduction and Collection Account Number recorded for the deductor organization.",
    "supply_type": "India GST place-of-supply classification for this document; it controls intra-state, inter-state, export, or SEZ tax treatment as allowed here.",
    "strength_display": "Human-readable product strength presentation; normalized ingredient strength and basis remain in product composition fields.",
    "suffix": "Literal text appended after the numeric portion allocated by this document sequence.",
    "supplier_gstin": "Supplier GSTIN recorded on the GST portal document line used for matching and reconciliation.",
    "tax_charge_mechanism": "GST liability mechanism: normal charges tax through the supplier document, while reverse_charge records recipient self-assessment.",
    "tax_classification_code_snapshot": "Immutable HSN or SAC code copied from the exact tax authority used when this line was calculated.",
    "taxability_snapshot": "Immutable GST taxability category effective when this line was calculated; it must not be replaced by a later master value.",
    "transporter_gstin": "GSTIN of the transporter recorded for the physical movement evidence.",
    "witness_credential": "Credential or authority description presented by the destruction witness and retained with the destruction evidence.",
    "zero_rated_payment_mode": "IGST payment route for a zero-rated supply: with_igst, without_payment, or not_applicable when the supply is not zero-rated.",
}


class DictionaryError(RuntimeError):
    pass


def _load_catalog():
    sys.path.insert(0, str(REPO_ROOT / "backend"))
    from scripts.generate_canonical_baseline import load_and_validate_catalog

    return load_and_validate_catalog(CATALOG_ROOT)


def _column_definition(
    table: dict[str, Any],
    column: list[Any],
    fk: dict[str, Any] | None,
    allowed_values: tuple[str, ...],
) -> tuple[str, str]:
    name, sql_type, _nullable, _default, classification = column
    owner = table["fact_owner"].replace("_", " ")
    label = name.replace("_", " ")
    qualified_name = f"{table['name']}.{name}"
    if name == "org_id":
        return f"Tenant organization that owns this {owner} fact and forms its RLS boundary.", "structural_rule"
    if name == "id":
        scope = "within the owning organization" if table["tenant_class"] != "global_reference" else "globally"
        return f"Stable relational identifier for one {owner} fact, unique {scope}; application-generated UUIDv7 is preferred.", "structural_rule"
    if qualified_name in EXACT_FIELD_DEFINITIONS:
        return EXACT_FIELD_DEFINITIONS[qualified_name], "exact_glossary"
    if name in SHARED_FIELD_GLOSSARY:
        return SHARED_FIELD_GLOSSARY[name], "exact_glossary"
    if fk:
        target_columns = ", ".join(fk["referenced_columns"])
        return (
            f"Foreign-key component selecting {fk['references']} ({target_columns}) for this {owner}; "
            f"declared cardinality {fk['cardinality']}."
        ), "structural_rule"
    if name == "status":
        states = ", ".join(table["lifecycle"]["states"])
        return f"Lifecycle state of this {owner}; allowed states are {states}.", "structural_rule"
    if name == "row_version":
        return f"Monotonic optimistic-concurrency version of this {owner}; incremented by reviewed mutations.", "structural_rule"
    if name.endswith("_hash") or name.endswith("_sha256"):
        return f"Immutable cryptographic digest of the exact {label.removesuffix(' hash').removesuffix(' sha256')} bytes or canonical payload.", "structural_rule"
    if sql_type == "bytea" or name.endswith("_bytes"):
        return f"Exact retained binary representation of {label.removesuffix(' bytes')} used for reproducible evidence and hashing.", "structural_rule"
    if sql_type.startswith("numeric"):
        scale_match = re.search(r"numeric\((\d+),(\d+)\)", sql_type)
        scale = f" at {scale_match.group(2)} decimal places" if scale_match else ""
        if any(token in name for token in ("amount", "total", "value", "rate")):
            if name == "quoted_unit_rate":
                unit = "the row's declared currency per selected UOM"
            elif name == "fx_rate":
                unit = "functional-currency units per transaction-currency unit"
            elif name.endswith("_rate"):
                unit = "percentage-rate precision"
            else:
                unit = "the row's declared currency"
            return f"Persisted {label} for this {owner}, stored in {unit}{scale}; never calculate it with binary floating point.", "numeric_rule"
        if "quantity" in name or name.endswith("_qty"):
            return f"Persisted {label} for this {owner}{scale}, interpreted in the explicitly linked or snapshotted UOM.", "numeric_rule"
        return f"Exact decimal {label} for this {owner}{scale}.", "numeric_rule"
    if sql_type == "date" or name.endswith(("_date", "_on")):
        return f"Civil calendar date on which {label.removesuffix(' date').removesuffix(' on')} applies, without time-zone conversion.", "temporal_rule"
    if sql_type == "timestamptz" or name.endswith("_at"):
        return f"UTC-normalized instant at which {label.removesuffix(' at')} occurred or became true.", "temporal_rule"
    if sql_type == "boolean":
        return f"Whether {label} applies to this {owner}; absence is not inferred from another field.", "boolean_rule"
    if name.endswith("_number"):
        return f"Human or statutory {label} for this {owner}; it is not the relational primary key.", "identifier_rule"
    if name.endswith("_code") or name == "code":
        return f"Typed code identifying {label.removesuffix(' code')} under this table's checks or reference authority.", "identifier_rule"
    if name.endswith("_reason") or name == "reason":
        return f"Retained human-readable reason supporting the related {owner} decision or reversal.", "evidence_rule"
    if name.endswith("_id"):
        return f"Typed identifier for {label.removesuffix(' id')} recorded by this {owner}; see table invariants for polymorphic constraints.", "identifier_rule"
    if classification == "regulated":
        if name.endswith("_snapshot"):
            return f"Immutable {label.removesuffix(' snapshot')} evidence copied into this {owner} when the fact was created; later master-data changes do not rewrite it.", "snapshot_rule"
        if allowed_values:
            return f"Controlled {label} classification for this {owner}; agents must send the exact canonical value rather than a synonym.", "controlled_vocabulary_rule"
        if name.endswith(("_version", "_ruleset_version")):
            return f"Exact retained {label} that identifies the authority used for this {owner}; later authority releases do not reinterpret the row.", "version_rule"
        if name.endswith("_reference"):
            return f"Human or statutory {label} retained as external evidence for this {owner}; it is not a relational identifier.", "evidence_rule"
        if name.endswith("_media_type"):
            return f"Exact media type of the retained {label.removesuffix(' media type')} representation for this {owner}; it controls decoding and canonical replay.", "representation_rule"
        if name.endswith(("_type", "_kind")):
            return f"Typed discriminator naming the exact {label} category represented by this {owner}; do not substitute an unreviewed synonym.", "discriminator_rule"
        if name.endswith(("_notes", "_remarks", "_summary", "_message", "_text")) or name in {"remarks", "summary"}:
            return f"Exact human-readable {label} retained as regulated evidence for this {owner}; it is not a machine-derived status or code.", "evidence_rule"
        if name.endswith("_days"):
            return f"Whole calendar-day count used as {label} for this {owner}; zero-day and null behavior remain governed by the table checks.", "duration_rule"
        if name.endswith("_identifier"):
            return f"Exact external {label} retained for this {owner}; its kind or issuing authority is recorded separately where required.", "identifier_rule"
        if name in {"line1", "line2", "city", "district"}:
            return f"Exact address {label} recorded for this {owner}; preserve the source spelling and do not resolve it from a newer master record.", "recorded_text_rule"
        if name == "issuing_authority":
            return f"Exact legal or regulatory authority that issued this {owner}; preserve the name printed on the source licence.", "evidence_rule"
        if name.endswith(("_name", "_line1", "_line2", "_city", "_pincode")):
            return f"Exact {label} recorded for this {owner}; preserve the source spelling and do not resolve it from a newer master record.", "recorded_text_rule"
        return (
            f"Explicit semantic exception: regulated {label} retained by the {owner}; no legal or operational meaning beyond the named field, checks, and invariants is asserted by this dictionary."
        ), "exception_requires_domain_glossary"
    definition = f"Persisted {label} owned by the {owner} fact; interpretation is constrained by this table's checks and invariants."
    if allowed_values:
        definition += f" Allowed values: {', '.join(allowed_values)}."
    return definition, "generic_inference"


def _semantic_id(
    table: dict[str, Any],
    column: list[Any],
    fk: dict[str, Any] | None,
    allowed_values: tuple[str, ...],
    shared_vocabulary: bool,
) -> str:
    name = column[0]
    if name in CONTEXTUAL_SEMANTIC_NAMES:
        return f"{table['name']}.{name}"
    if fk:
        if name == "org_id" and fk["references"] == "core.organizations":
            return "reference.core.organizations.org_id"
        return f"reference.{fk['references']}.{name}"
    if allowed_values:
        return f"vocabulary.{name}" if shared_vocabulary else f"{table['name']}.{name}"
    if any(token in name for token in ("cgst", "sgst", "igst", "cess", "taxable")):
        return f"gst.{name}"
    return f"common.{name}"


def _allowed_values(column_name: str, expressions: list[str]) -> tuple[str, ...]:
    values: set[str] = set()
    pattern = re.compile(
        rf"\b{re.escape(column_name)}\b\s+IN\s*\(([^)]+)\)",
        flags=re.IGNORECASE,
    )
    for expression in expressions:
        for match in pattern.finditer(expression):
            values.update(re.findall(r"'((?:''|[^'])*)'", match.group(1)))
    return tuple(sorted(value.replace("''", "'") for value in values))


def _dictionary() -> dict[str, Any]:
    catalog = _load_catalog()
    vocabularies_by_name: dict[str, set[tuple[str, ...]]] = {}
    for table in catalog.tables:
        expressions = [check["expression"] for check in table.get("checks", [])]
        for column in table["columns"]:
            values = _allowed_values(column[0], expressions)
            if values:
                vocabularies_by_name.setdefault(column[0], set()).add(values)
    columns_by_name: dict[str, set[str]] = {}
    table_entries: list[dict[str, Any]] = []
    qualified_names: set[str] = set()

    for table in sorted(catalog.tables, key=lambda item: item["name"]):
        fk_by_column: dict[str, dict[str, Any]] = {}
        for fk in table.get("foreign_keys", []):
            for column in fk["columns"]:
                fk_by_column.setdefault(column, fk)
        checks_by_column: dict[str, list[str]] = {}
        check_expressions_by_column: dict[str, list[str]] = {}
        for check in table.get("checks", []):
            expression = check["expression"]
            for column in table["columns"]:
                if re.search(rf"\b{re.escape(column[0])}\b", expression):
                    checks_by_column.setdefault(column[0], []).append(check["name"])
                    check_expressions_by_column.setdefault(column[0], []).append(expression)

        field_entries = []
        for column in table["columns"]:
            name, sql_type, nullable, default, classification = column
            if name in FORBIDDEN_COLUMN_ALIASES:
                raise DictionaryError(f"legacy or ambiguous column alias is forbidden: {table['name']}.{name}")
            columns_by_name.setdefault(name, set()).add(sql_type)
            qualified_name = f"{table['name']}.{name}"
            if qualified_name in qualified_names:
                raise DictionaryError(f"duplicate qualified column: {qualified_name}")
            qualified_names.add(qualified_name)
            fk = fk_by_column.get(name)
            allowed_values = _allowed_values(
                name, check_expressions_by_column.get(name, [])
            )
            definition, definition_source = _column_definition(
                table, column, fk, allowed_values
            )
            if allowed_values and "Allowed values:" not in definition:
                definition += f" Allowed values: {', '.join(allowed_values)}."
            field_entries.append(
                {
                    "name": name,
                    "qualified_name": qualified_name,
                    "semantic_id": _semantic_id(
                        table,
                        column,
                        fk,
                        allowed_values,
                        len(vocabularies_by_name.get(name, ())) == 1,
                    ),
                    "definition": definition,
                    "definition_source": definition_source,
                    "sql_type": sql_type,
                    "nullable": nullable,
                    "default": default,
                    "data_classification": classification,
                    "foreign_key": (
                        {
                            "target": fk["references"],
                            "target_columns": fk["referenced_columns"],
                            "cardinality": fk["cardinality"],
                            "on_delete": fk["on_delete"],
                        }
                        if fk
                        else None
                    ),
                    "check_constraints": sorted(checks_by_column.get(name, [])),
                    "allowed_values": list(allowed_values),
                    "do_not_confuse_with": CONFUSION_NOTES.get(name),
                }
            )
        table_entries.append(
            {
                "name": table["name"],
                "fact_owner": table["fact_owner"],
                "definition": (
                    f"Canonical {table['fact_owner'].replace('_', ' ')} facts in the "
                    f"{table['name'].split('.', 1)[0]} domain."
                ),
                "tenant_class": table["tenant_class"],
                "mutation_class": table["mutation_class"],
                "lifecycle": table["lifecycle"],
                "retention": table["retention"],
                "fields": field_entries,
            }
        )

    conflicting_types = {
        name: sorted(types)
        for name, types in columns_by_name.items()
        if len(types) > 1 and name not in POLYMORPHIC_TYPE_NAMES
    }
    if conflicting_types:
        raise DictionaryError(f"same column name has conflicting SQL types: {conflicting_types}")

    semantic_ids_by_name: dict[str, set[str]] = {}
    for table in table_entries:
        for field in table["fields"]:
            semantic_ids_by_name.setdefault(field["name"], set()).add(field["semantic_id"])
    ambiguous_shared_names = {
        name: sorted(semantic_ids)
        for name, semantic_ids in semantic_ids_by_name.items()
        if len(semantic_ids) > 1
    }
    semantic_signatures: dict[str, set[tuple[Any, ...]]] = {}
    for table in table_entries:
        for field in table["fields"]:
            foreign_key = field["foreign_key"]
            signature = (
                field["sql_type"],
                foreign_key["target"] if foreign_key else None,
                tuple(field["allowed_values"]),
            )
            semantic_signatures.setdefault(field["semantic_id"], set()).add(signature)
    semantic_conflicts = {
        semantic_id: sorted(signatures, key=repr)
        for semantic_id, signatures in semantic_signatures.items()
        if len(signatures) > 1
    }
    if semantic_conflicts:
        raise DictionaryError(
            f"semantic ID has conflicting type, authority, or vocabulary: {semantic_conflicts}"
        )

    catalog_hash = hashlib.sha256(
        json.dumps(catalog.tables, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    field_count = sum(len(table["fields"]) for table in table_entries)
    return {
        "contract_version": "1.0.0",
        "catalog_sha256": catalog_hash,
        "table_count": len(table_entries),
        "field_count": field_count,
        "naming_contract": {
            "identity": "Use fully qualified schema.table.column names in agent plans and generated tools.",
            "shared_names": "Never infer semantics from an unqualified field name. Fields with different FK authorities or controlled vocabularies have distinct semantic_id values and are listed in ambiguous_shared_names.",
            "money": "Amounts are Decimal strings at API/MCP boundaries and exact NUMERIC in PostgreSQL.",
            "time": "*_date and *_on are civil dates; *_at is a UTC-normalized instant; effective_from/effective_to are civil dates.",
            "definition_provenance": "exact_glossary is reviewed business meaning; named semantic rules are deterministic structural meaning; exception_requires_domain_glossary explicitly refuses to invent unresolved regulated meaning.",
            "forbidden_aliases": sorted(FORBIDDEN_COLUMN_ALIASES),
            "ambiguous_shared_names": ambiguous_shared_names,
        },
        "tables": table_entries,
    }


def generated_text() -> str:
    return json.dumps(_dictionary(), indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    group.add_argument("--check", type=Path)
    args = parser.parse_args()
    try:
        text = generated_text()
    except Exception as exc:
        print(f"canonical data dictionary: BLOCKED ({exc})", file=sys.stderr)
        return 1
    if args.check:
        if not args.check.exists() or args.check.read_text(encoding="utf-8") != text:
            print(f"canonical data dictionary is stale: {args.check}", file=sys.stderr)
            return 1
        print("canonical data dictionary: OK")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text, encoding="utf-8")
    document = json.loads(text)
    print(
        f"canonical data dictionary: wrote {document['table_count']} tables / "
        f"{document['field_count']} fields to {args.output}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
