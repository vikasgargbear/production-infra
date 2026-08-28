"""Canonical, effective-dated GST authority for sales calculation previews."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Sequence
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.money import decimal_value


_SALES_PARTY_CONTEXT_SQL = text(
    """
    SELECT branch.state_code AS branch_state_code,
           customer.party_id AS customer_party_id
      FROM core.branches AS branch
      JOIN parties.customer_accounts AS customer
        ON customer.org_id=branch.org_id
       AND customer.id=:customer_account_id
       AND customer.status='active'
     WHERE branch.org_id=:org_id
       AND branch.id=:branch_id
       AND branch.status='active'
    """
)

_EFFECTIVE_ADDRESSES_SQL = text(
    """
    SELECT address.id,address.address_kind,address.state_code,address.country_code
      FROM parties.addresses AS address
     WHERE address.org_id=:org_id
       AND address.party_id=:party_id
       AND address.is_primary
       AND address.status='active'
       AND address.valid_from<=:document_date
       AND (address.valid_until IS NULL OR address.valid_until>=:document_date)
       AND address.address_kind IN ('shipping','billing','registered')
     ORDER BY address.address_kind,address.id
    """
)

_EFFECTIVE_CUSTOMER_REGISTRATIONS_SQL = text(
    """
    SELECT registration.id,registration.state_code,registration.taxpayer_type
      FROM parties.tax_registrations AS registration
     WHERE registration.org_id=:org_id
       AND registration.party_id=:party_id
       AND registration.registration_type='GSTIN'
       AND registration.status='active'
       AND (registration.valid_from IS NULL OR registration.valid_from<=:document_date)
       AND (registration.valid_until IS NULL OR registration.valid_until>=:document_date)
     ORDER BY registration.state_code,registration.id
    """
)

_EFFECTIVE_PRODUCT_TAX_SQL = text(
    """
    WITH requested AS (
        SELECT request.product_id,request.ordinality::integer AS line_number
          FROM unnest(CAST(:product_ids AS uuid[])) WITH ORDINALITY
               AS request(product_id,ordinality)
    )
    SELECT requested.line_number,product.id AS product_id,product.hsn_code,
           version.id AS tax_code_version_id,version.release_id AS tax_release_id,
           version.version_number,version.effective_from,version.effective_to,
           version.taxability,version.cgst_rate,version.sgst_rate,
           version.igst_rate,version.cess_rate,version.ruleset_version
      FROM requested
      JOIN catalog.products AS product
        ON product.org_id=:org_id
       AND product.id=requested.product_id
       AND product.status='active'
      JOIN tax.tax_code_versions AS version
        ON version.code=product.hsn_code
       AND version.code_kind='hsn'
       AND version.status='active'
       AND version.effective_from<=:document_date
       AND (version.effective_to IS NULL OR version.effective_to>=:document_date)
      JOIN core.reference_data_releases AS release
        ON release.id=version.release_id
       AND release.dataset_kind='hsn_sac_tax'
       AND release.status='active'
       AND release.effective_from<=:document_date
       AND (release.effective_to IS NULL OR release.effective_to>=:document_date)
     ORDER BY requested.line_number
    """
)


@dataclass(frozen=True)
class ResolvedSalesTaxLine:
    product_id: UUID
    hsn_code: str
    gst_rate: Decimal
    taxability: str
    tax_code_version_id: UUID
    tax_release_id: UUID
    tax_version_number: int
    tax_effective_from: date
    tax_effective_to: date | None
    tax_ruleset_version: str


@dataclass(frozen=True)
class ResolvedSalesTaxAuthority:
    gst_type: str
    lines: tuple[ResolvedSalesTaxLine, ...]


def _mapping_rows(result: Any) -> list[dict[str, Any]]:
    return [dict(row) for row in result.mappings().all()]


def _one(rows: list[dict[str, Any]], label: str) -> dict[str, Any]:
    if len(rows) != 1:
        raise ValueError(f"{label} must resolve to exactly one canonical record")
    return rows[0]


def resolve_sales_tax_authority(
    db: Session,
    *,
    org_id: UUID,
    branch_id: UUID,
    customer_account_id: UUID,
    product_ids: Sequence[UUID],
    document_date: date,
) -> ResolvedSalesTaxAuthority:
    """Resolve supply type and every line rate without request-owned tax facts."""
    if not product_ids:
        raise ValueError("at least one product is required for GST resolution")
    context = _one(
        _mapping_rows(
            db.execute(
                _SALES_PARTY_CONTEXT_SQL,
                {
                    "org_id": org_id,
                    "branch_id": branch_id,
                    "customer_account_id": customer_account_id,
                },
            )
        ),
        "sales party context",
    )
    party_id = UUID(str(context["customer_party_id"]))
    shared_params = {
        "org_id": org_id,
        "party_id": party_id,
        "document_date": document_date,
    }
    addresses = _mapping_rows(db.execute(_EFFECTIVE_ADDRESSES_SQL, shared_params))
    selected_address = None
    for kind in ("shipping", "billing", "registered"):
        candidates = [row for row in addresses if row["address_kind"] == kind]
        if len(candidates) > 1:
            raise ValueError(f"customer has ambiguous effective primary {kind} addresses")
        if candidates:
            selected_address = candidates[0]
            break
    if selected_address is None:
        raise ValueError("customer has no effective primary sales address")
    if selected_address["country_code"] != "IN":
        raise ValueError("export sales preview is unavailable in the current canonical scope")

    registrations = _mapping_rows(
        db.execute(_EFFECTIVE_CUSTOMER_REGISTRATIONS_SQL, shared_params)
    )
    state_registrations = [
        row for row in registrations if row["state_code"] == selected_address["state_code"]
    ]
    if len(state_registrations) > 1:
        raise ValueError("customer has ambiguous effective GST registrations")
    if state_registrations and state_registrations[0]["taxpayer_type"] in {
        "sez_unit",
        "sez_developer",
    }:
        raise ValueError("SEZ sales preview requires the reviewed canonical command")
    gst_type = (
        "CGST/SGST"
        if context["branch_state_code"] == selected_address["state_code"]
        else "IGST"
    )

    tax_rows = _mapping_rows(
        db.execute(
            _EFFECTIVE_PRODUCT_TAX_SQL,
            {
                "org_id": org_id,
                "product_ids": [str(product_id) for product_id in product_ids],
                "document_date": document_date,
            },
        )
    )
    by_line: dict[int, list[dict[str, Any]]] = {}
    for row in tax_rows:
        by_line.setdefault(int(row["line_number"]), []).append(row)

    resolved_lines: list[ResolvedSalesTaxLine] = []
    for line_number, product_id in enumerate(product_ids, start=1):
        row = _one(
            by_line.get(line_number, []),
            f"product {product_id} effective HSN tax version",
        )
        taxability = str(row["taxability"])
        if taxability not in {"taxable", "exempt", "nil_rated", "non_gst"}:
            raise ValueError("effective HSN taxability is unsupported")
        cgst_rate = decimal_value(row["cgst_rate"], "cgst_rate")
        sgst_rate = decimal_value(row["sgst_rate"], "sgst_rate")
        igst_rate = decimal_value(row["igst_rate"], "igst_rate")
        cess_rate = decimal_value(row["cess_rate"], "cess_rate")
        if cgst_rate + sgst_rate != igst_rate:
            raise ValueError("effective HSN GST components do not reconcile")
        if cess_rate != 0:
            raise ValueError("cess-bearing sales preview requires the canonical command review")
        resolved_lines.append(
            ResolvedSalesTaxLine(
                product_id=UUID(str(row["product_id"])),
                hsn_code=str(row["hsn_code"]),
                gst_rate=igst_rate if taxability == "taxable" else Decimal("0"),
                taxability=taxability,
                tax_code_version_id=UUID(str(row["tax_code_version_id"])),
                tax_release_id=UUID(str(row["tax_release_id"])),
                tax_version_number=int(row["version_number"]),
                tax_effective_from=row["effective_from"],
                tax_effective_to=row["effective_to"],
                tax_ruleset_version=str(row["ruleset_version"]),
            )
        )
    return ResolvedSalesTaxAuthority(gst_type=gst_type, lines=tuple(resolved_lines))


__all__ = [
    "ResolvedSalesTaxAuthority",
    "ResolvedSalesTaxLine",
    "resolve_sales_tax_authority",
]
