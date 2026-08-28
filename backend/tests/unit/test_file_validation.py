import asyncio
from io import BytesIO
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile

from app.main import app


MODULE_PATH = Path(__file__).parents[2] / "app/core/utils/file_validation.py"
SPEC = spec_from_file_location("upload_file_validation", MODULE_PATH)
assert SPEC and SPEC.loader
FILE_VALIDATION = module_from_spec(SPEC)
SPEC.loader.exec_module(FILE_VALIDATION)
sanitize_filename = FILE_VALIDATION.sanitize_filename
validate_upload = FILE_VALIDATION.validate_upload


def upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(filename=filename, file=BytesIO(content))


def test_validate_upload_accepts_a_pdf_with_matching_signature() -> None:
    content = b"%PDF-1.7\nsynthetic test invoice"
    assert asyncio.run(validate_upload(upload("invoice.pdf", content), ["pdf"], 10)) == content


@pytest.mark.parametrize(
    ("filename", "content", "status"),
    [
        ("invoice.txt", b"%PDF-1.7", 400),
        ("invoice.pdf", b"not a pdf", 400),
        ("invoice.pdf", b"", 400),
    ],
)
def test_validate_upload_rejects_invalid_files(
    filename: str,
    content: bytes,
    status: int,
) -> None:
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(validate_upload(upload(filename, content), ["pdf"], 1))
    assert exc_info.value.status_code == status


def test_validate_upload_rejects_oversized_pdf() -> None:
    content = b"%PDF" + (b"x" * (1024 * 1024))
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(validate_upload(upload("invoice.pdf", content), ["pdf"], 1))
    assert exc_info.value.status_code == 413


def test_sanitize_filename_removes_path_and_control_characters() -> None:
    assert sanitize_filename("../unsafe/invoice\x00?.pdf") == "invoice_.pdf"


def test_purchase_invoice_parser_exposes_one_validated_authenticated_endpoint() -> None:
    paths = app.openapi()["paths"]
    operation = paths["/api/purchase-upload/parse-invoice-safe"]["post"]

    assert operation["security"]
    assert "/api/purchase-upload/parse-invoice" not in paths
    assert "/api/purchase-upload/parse-pdf" not in paths
    assert "/api/purchase-upload/validate-invoice" not in paths

    source = (
        Path(__file__).resolve().parents[2]
        / "app/api/routes/purchase/upload/routes.py"
    ).read_text()
    assert 'validate_upload(file, allowed_types=["pdf"], max_size_mb=10)' in source
    assert 'PermissionChecker("purchase", "view")' in source
    assert "shutil.copyfileobj" not in source
