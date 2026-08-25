from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest

from app.api.services.sales.tax_authority import resolve_sales_tax_authority


ORG = UUID("10000000-0000-7000-8000-000000000001")
BRANCH = UUID("10000000-0000-7000-8000-000000000002")
CUSTOMER = UUID("10000000-0000-7000-8000-000000000003")
PARTY = UUID("10000000-0000-7000-8000-000000000004")
PRODUCT = UUID("10000000-0000-7000-8000-000000000005")
VERSION = UUID("10000000-0000-7000-8000-000000000006")
RELEASE = UUID("10000000-0000-7000-8000-000000000007")
ADDRESS = UUID("10000000-0000-7000-8000-000000000008")


class _Mappings:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return _Mappings(self._rows)


class _Session:
    def __init__(self, *, branch_state="27", address_state="27", tax_rows=None):
        self.branch_state = branch_state
        self.address_state = address_state
        self.tax_rows = tax_rows
        self.calls = []

    def execute(self, statement, params):
        sql = str(statement)
        self.calls.append((sql, params))
        if "FROM core.branches" in sql:
            return _Result([{
                "branch_state_code": self.branch_state,
                "customer_party_id": PARTY,
            }])
        if "FROM parties.addresses" in sql:
            return _Result([{
                "id": ADDRESS,
                "address_kind": "shipping",
                "state_code": self.address_state,
                "country_code": "IN",
            }])
        if "FROM parties.tax_registrations" in sql:
            return _Result([])
        if "WITH requested AS" in sql:
            rows = self.tax_rows
            if rows is None:
                rows = [{
                    "line_number": 1,
                    "product_id": PRODUCT,
                    "hsn_code": "481910",
                    "tax_code_version_id": VERSION,
                    "tax_release_id": RELEASE,
                    "version_number": 4,
                    "effective_from": date(2026, 4, 1),
                    "effective_to": None,
                    "taxability": "taxable",
                    "cgst_rate": Decimal("6.00"),
                    "sgst_rate": Decimal("6.00"),
                    "igst_rate": Decimal("12.00"),
                    "cess_rate": Decimal("0.00"),
                    "ruleset_version": "gst-2026.04",
                }]
            return _Result(rows)
        raise AssertionError(sql)


def test_resolves_effective_versioned_hsn_rate_and_intra_state_supply() -> None:
    session = _Session()

    resolved = resolve_sales_tax_authority(
        session,
        org_id=ORG,
        branch_id=BRANCH,
        customer_account_id=CUSTOMER,
        product_ids=[PRODUCT],
        document_date=date(2026, 8, 25),
    )

    assert resolved.gst_type == "CGST/SGST"
    assert resolved.lines[0].gst_rate == Decimal("12.00")
    assert resolved.lines[0].tax_code_version_id == VERSION
    assert resolved.lines[0].tax_release_id == RELEASE
    tax_sql, params = session.calls[-1]
    assert "version.effective_from<=:document_date" in tax_sql
    assert "release.dataset_kind='hsn_sac_tax'" in tax_sql
    assert params["product_ids"] == [str(PRODUCT)]


def test_supply_type_is_derived_from_branch_and_customer_address() -> None:
    resolved = resolve_sales_tax_authority(
        _Session(branch_state="27", address_state="29"),
        org_id=ORG,
        branch_id=BRANCH,
        customer_account_id=CUSTOMER,
        product_ids=[PRODUCT],
        document_date=date(2026, 8, 25),
    )

    assert resolved.gst_type == "IGST"


def test_missing_or_overlapping_effective_tax_version_fails_closed() -> None:
    for rows in ([], [{"line_number": 1}, {"line_number": 1}]):
        with pytest.raises(ValueError, match="exactly one canonical record"):
            resolve_sales_tax_authority(
                _Session(tax_rows=rows),
                org_id=ORG,
                branch_id=BRANCH,
                customer_account_id=CUSTOMER,
                product_ids=[PRODUCT],
                document_date=date(2026, 8, 25),
            )


def test_non_taxable_hsn_resolves_zero_without_browser_default() -> None:
    row = {
        "line_number": 1,
        "product_id": PRODUCT,
        "hsn_code": "300490",
        "tax_code_version_id": VERSION,
        "tax_release_id": RELEASE,
        "version_number": 1,
        "effective_from": date(2026, 4, 1),
        "effective_to": None,
        "taxability": "exempt",
        "cgst_rate": Decimal("0"),
        "sgst_rate": Decimal("0"),
        "igst_rate": Decimal("0"),
        "cess_rate": Decimal("0"),
        "ruleset_version": "gst-2026.04",
    }
    resolved = resolve_sales_tax_authority(
        _Session(tax_rows=[row]),
        org_id=ORG,
        branch_id=BRANCH,
        customer_account_id=CUSTOMER,
        product_ids=[PRODUCT],
        document_date=date(2026, 8, 25),
    )

    assert resolved.lines[0].taxability == "exempt"
    assert resolved.lines[0].gst_rate == Decimal("0")


def test_cess_bearing_hsn_fails_closed_until_preview_contract_supports_it() -> None:
    row = {
        "line_number": 1,
        "product_id": PRODUCT,
        "hsn_code": "240220",
        "tax_code_version_id": VERSION,
        "tax_release_id": RELEASE,
        "version_number": 1,
        "effective_from": date(2026, 4, 1),
        "effective_to": None,
        "taxability": "taxable",
        "cgst_rate": Decimal("14"),
        "sgst_rate": Decimal("14"),
        "igst_rate": Decimal("28"),
        "cess_rate": Decimal("5"),
        "ruleset_version": "gst-2026.04",
    }
    with pytest.raises(ValueError, match="cess-bearing"):
        resolve_sales_tax_authority(
            _Session(tax_rows=[row]),
            org_id=ORG,
            branch_id=BRANCH,
            customer_account_id=CUSTOMER,
            product_ids=[PRODUCT],
            document_date=date(2026, 8, 25),
        )
