from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_registration_setup_has_exact_capability_and_rls_activation():
    source = read("app/api/routes/canonical_tax_registration_setup.py")
    assert 'ExactPermissionChecker("tax.registration.manage")' in source
    assert "erp_security.activate_context" in source
    assert "confirmed: Literal[True]" in source
    assert "canonical_write_commands.establish_gst_registration" in source


def test_registration_write_is_canonical_and_branch_bound():
    source = read("app/infrastructure/canonical_write_commands.py")
    assert "INSERT INTO tax.registrations" in source
    assert "INSERT INTO tax.registration_branches" in source
    assert "'principal'" in source
    assert "GSTIN state must match the organization and principal branch" in source


def test_registration_route_is_mounted():
    source = read("app/main.py")
    assert "canonical_tax_registration_setup.router" in source
