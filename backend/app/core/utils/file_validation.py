"""
Secure File Upload Validation Utility

Provides:
- File size limit enforcement
- Magic number (file signature) validation
- Filename sanitization (prevent path traversal)
- Content type verification

Usage:
    from app.core.utils.file_validation import validate_upload, sanitize_filename

    @router.post("/upload")
    async def upload(file: UploadFile = File(...)):
        validate_upload(file, allowed_types=["pdf"], max_size_mb=10)
        safe_name = sanitize_filename(file.filename)
"""
import os
import re
from typing import List, Optional
from fastapi import UploadFile, HTTPException

# File signature (magic number) table
# Maps extension to expected first bytes
MAGIC_NUMBERS = {
    "pdf": [b"%PDF"],
    "json": None,  # JSON is text-based, no magic number
    "csv": None,   # CSV is text-based
    "xlsx": [b"PK\x03\x04"],  # ZIP-based format
    "xls": [b"\xd0\xcf\x11\xe0"],  # OLE2
    "jpeg": [b"\xff\xd8\xff"],
    "jpg": [b"\xff\xd8\xff"],
    "png": [b"\x89PNG"],
}

# Default max file size: 10MB
DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024


def sanitize_filename(filename: str) -> str:
    """
    Sanitize a filename to prevent path traversal and injection.

    - Strips directory components (../, /, \\)
    - Removes special characters
    - Limits length to 255 chars
    """
    if not filename:
        return "unnamed_file"

    # Extract just the filename (no directory path)
    filename = os.path.basename(filename)

    # Remove null bytes
    filename = filename.replace("\x00", "")

    # Replace path separators and dangerous chars
    filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', filename)

    # Remove leading/trailing dots and spaces
    filename = filename.strip(". ")

    # Limit length
    if len(filename) > 255:
        name, ext = os.path.splitext(filename)
        filename = name[:255 - len(ext)] + ext

    return filename or "unnamed_file"


async def validate_upload(
    file: UploadFile,
    allowed_types: Optional[List[str]] = None,
    max_size_mb: float = 10,
) -> bytes:
    """
    Validate an uploaded file for size, type, and content.

    Args:
        file: FastAPI UploadFile
        allowed_types: List of allowed extensions (e.g., ["pdf", "json"])
        max_size_mb: Maximum file size in MB (default 10)

    Returns:
        File content as bytes (already read, so caller doesn't need to re-read)

    Raises:
        HTTPException 400: Invalid file type or content
        HTTPException 413: File too large
    """
    max_size_bytes = int(max_size_mb * 1024 * 1024)

    # Check extension
    if allowed_types and file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"File type '.{ext}' not allowed. Accepted: {', '.join(allowed_types)}"
            )

    # Read content with size limit
    content = await file.read()

    if len(content) > max_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) // (1024*1024)}MB). Maximum: {max_size_mb}MB"
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    # Validate magic number (file signature)
    if allowed_types and file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        expected_magic = MAGIC_NUMBERS.get(ext)

        if expected_magic is not None:
            if not any(content.startswith(magic) for magic in expected_magic):
                raise HTTPException(
                    status_code=400,
                    detail=f"File content does not match expected format for '.{ext}'"
                )

    # Reset file position for potential re-read by caller
    await file.seek(0)

    return content
