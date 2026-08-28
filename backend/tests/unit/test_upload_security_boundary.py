"""
Static and unit tests for the parse-invoice security boundary.

Verifies that the authoritative /parse-invoice-safe endpoint:
- Uses validate_upload() (magic number + size check), not a content_type string check
- Does not read files unbounded via shutil.copyfileobj
- Rejects files whose bytes do not match the declared extension
- Rejects files exceeding 10 MB
"""
from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi import UploadFile
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.core.utils.file_validation import validate_upload


ROUTE_SOURCE = (
    Path(__file__).resolve().parents[2]
    / "app/api/routes/purchase/upload/routes.py"
).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Static source guards
# ---------------------------------------------------------------------------

def test_parse_invoice_uses_validate_upload_not_content_type_check() -> None:
    # The handler must delegate to validate_upload for magic number + size.
    assert "validate_upload(" in ROUTE_SOURCE


def test_parse_invoice_does_not_use_shutil_copyfileobj() -> None:
    # shutil.copyfileobj reads without a size limit — must not appear in the handler.
    assert "shutil.copyfileobj" not in ROUTE_SOURCE


def test_purchase_invoice_handler_is_pdf_only() -> None:
    assert '@router.post("/parse-invoice-safe")' in ROUTE_SOURCE
    assert 'allowed_types=["pdf"]' in ROUTE_SOURCE
    assert '@router.post("/parse-invoice")' not in ROUTE_SOURCE


# ---------------------------------------------------------------------------
# validate_upload unit tests (same function called by parse-invoice)
# ---------------------------------------------------------------------------

def _make_upload(content: bytes, filename: str, content_type: str = "application/octet-stream") -> UploadFile:
    return UploadFile(
        filename=filename,
        file=io.BytesIO(content),
        headers={"content-type": content_type},
    )


@pytest.mark.asyncio
async def test_valid_pdf_magic_bytes_pass_validation() -> None:
    content = b"%PDF-1.4 fake pdf content"
    upload = _make_upload(content, "invoice.pdf", "application/pdf")
    result = await validate_upload(upload, allowed_types=["pdf"], max_size_mb=10)
    assert result == content


@pytest.mark.asyncio
async def test_spoofed_pdf_extension_with_wrong_magic_is_rejected() -> None:
    from fastapi import HTTPException
    # File named .pdf but starts with PNG magic bytes — magic check must catch it.
    content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    upload = _make_upload(content, "invoice.pdf", "application/pdf")
    with pytest.raises(HTTPException) as exc_info:
        await validate_upload(upload, allowed_types=["pdf"], max_size_mb=10)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_oversized_file_is_rejected() -> None:
    from fastapi import HTTPException
    # 11 MB file — exceeds the 10 MB limit.
    content = b"%PDF" + b"\x00" * (11 * 1024 * 1024)
    upload = _make_upload(content, "huge.pdf", "application/pdf")
    with pytest.raises(HTTPException) as exc_info:
        await validate_upload(upload, allowed_types=["pdf"], max_size_mb=10)
    assert exc_info.value.status_code == 413


@pytest.mark.asyncio
async def test_disallowed_extension_is_rejected() -> None:
    from fastapi import HTTPException
    # .exe is not in the allowed list.
    content = b"MZ" + b"\x00" * 100
    upload = _make_upload(content, "malware.exe", "application/octet-stream")
    with pytest.raises(HTTPException) as exc_info:
        await validate_upload(upload, allowed_types=["pdf"], max_size_mb=10)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_purchase_parser_rejects_jpeg_even_with_valid_magic_bytes() -> None:
    from fastapi import HTTPException

    content = b"\xff\xd8\xff" + b"\x00" * 200
    upload = _make_upload(content, "scan.jpg", "image/jpeg")
    with pytest.raises(HTTPException) as exc_info:
        await validate_upload(upload, allowed_types=["pdf"], max_size_mb=10)
    assert exc_info.value.status_code == 400
