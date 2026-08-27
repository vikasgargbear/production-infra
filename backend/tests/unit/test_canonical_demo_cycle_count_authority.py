from datetime import date, datetime

import pytest

from scripts import provision_canonical_demo as demo


class RecordingCursor:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, parameters=None) -> None:
        self.calls.append((query, parameters))

    @staticmethod
    def fetchone():
        return (demo.LIVE18_CYCLE_COUNT_AUTHORITY.attachment_id,)


class RecordingConnection:
    def __init__(self) -> None:
        self.recording_cursor = RecordingCursor()

    def cursor(self) -> RecordingCursor:
        return self.recording_cursor


def test_live18_cycle_count_seed_uses_one_exact_unused_authority() -> None:
    connection = RecordingConnection()

    business_date = date(2026, 8, 28)
    result = demo.seed_live18_cycle_count_evidence(
        connection, business_date=business_date
    )

    authority = demo.LIVE18_CYCLE_COUNT_AUTHORITY
    assert result == {
        "attachment_id": authority.attachment_id,
        "storage_object_path": authority.storage_object_path,
    }
    insert_query, insert_parameters = connection.recording_cursor.calls[-2]
    verify_query, verify_parameters = connection.recording_cursor.calls[-1]
    assert "INSERT INTO core.attachments" in insert_query
    assert "ON CONFLICT (org_id,id) DO NOTHING" in insert_query
    assert insert_parameters[1:5] == (
        authority.attachment_id,
        authority.storage_object_path,
        authority.original_filename,
        authority.digest_input,
    )
    assert insert_parameters[5] == business_date
    assert "active_command_evidence_in_use" in verify_query
    assert verify_parameters[1:4] == (
        authority.attachment_id,
        authority.storage_object_path,
        authority.original_filename,
    )
    assert verify_parameters[5] == authority.digest_input


@pytest.mark.parametrize("business_date", ["2026-08-28", datetime(2026, 8, 28)])
def test_live18_cycle_count_seed_requires_database_business_date(
    business_date: object,
) -> None:
    with pytest.raises(ValueError, match="authoritative organization business date"):
        demo.seed_live18_cycle_count_evidence(
            RecordingConnection(), business_date=business_date
        )
