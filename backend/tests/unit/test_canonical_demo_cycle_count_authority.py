from datetime import timedelta

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

    result = demo.seed_live18_cycle_count_evidence(connection)

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
    assert "active_command_evidence_in_use" in verify_query
    assert verify_parameters[1:4] == (
        authority.attachment_id,
        authority.storage_object_path,
        authority.original_filename,
    )
    assert verify_parameters[5] == authority.digest_input


def test_live18_cycle_count_seed_fails_if_india_date_changed(monkeypatch) -> None:
    monkeypatch.setattr(
        demo, "INDIA_BUSINESS_DATE", demo.INDIA_BUSINESS_DATE - timedelta(days=1)
    )

    with pytest.raises(RuntimeError, match="India-local business date changed"):
        demo.seed_live18_cycle_count_evidence(RecordingConnection())
