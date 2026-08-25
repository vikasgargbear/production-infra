"""Prove promotion snapshots detect nonnumeric canonical row-content drift."""

from __future__ import annotations

import os

import psycopg2

from scripts.audit.application_promotion_evidence import capture_snapshot


def main() -> None:
    database_url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE catalog.promotion_digest_probe (
                    id uuid PRIMARY KEY,
                    label text NOT NULL,
                    recorded_at timestamptz NOT NULL,
                    payload jsonb NOT NULL,
                    evidence bytea NOT NULL,
                    amount numeric(18,2) NOT NULL
                )
            """)
            cursor.execute("""
                INSERT INTO catalog.promotion_digest_probe (
                    id, label, recorded_at, payload, evidence, amount
                ) VALUES (
                    'd3900000-0000-7000-8000-000000000001',
                    'before',
                    '2026-08-25T12:00:00+05:30',
                    '{"nested":{"answer":42},"ordered":[2,1]}'::jsonb,
                    decode('00ff10', 'hex'),
                    168.00
                )
            """)
        before = capture_snapshot(connection)
        with connection.cursor() as cursor:
            cursor.execute("""
                UPDATE catalog.promotion_digest_probe
                   SET label='after'
                 WHERE id='d3900000-0000-7000-8000-000000000001'
            """)
        after = capture_snapshot(connection)
        relation = "catalog.promotion_digest_probe"
        assert before["relation_counts"] == after["relation_counts"]
        assert before["exact_numeric_sums"] == after["exact_numeric_sums"]
        assert (
            before["table_content_sha256"][relation]
            != after["table_content_sha256"][relation]
        )
        connection.rollback()


if __name__ == "__main__":
    main()
