from scripts.audit import capture_transaction_integrity_evidence as capture


class _Cursor:
    def __init__(self, connection):
        self.connection = connection
        self.value = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, _parameters=()):
        normalized = " ".join(query.split())
        self.connection.queries.append(normalized)
        if "SELECT version_num FROM public.alembic_version" in normalized:
            self.value = "20260825_0010"
        elif normalized == "SELECT session_user":
            self.value = "erp_runtime"
        elif "pg_catalog.jsonb_build_object" in normalized:
            self.value = {
                "session_user": "erp_runtime",
                "superuser": False,
                "bypass_rls": False,
                "owns_business_relations": False,
            }
        else:
            self.value = True

    def fetchone(self):
        return (self.value,)


class _Connection:
    def __init__(self):
        self.queries = []
        self.rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self):
        return _Cursor(self)

    def rollback(self):
        self.rolled_back = True


def test_capture_uses_read_only_catalog_facts_and_emits_reviewed_contract(monkeypatch):
    admin = _Connection()
    runtime = _Connection()
    connections = iter((admin, runtime))
    monkeypatch.setattr(capture, "_read_only_connection", lambda _url: next(connections))

    evidence = capture.capture(
        runtime_database_url="postgresql://runtime",
        admin_database_url="postgresql://admin",
        project_ref=capture.EXPECTED_PROJECT_REF,
        git_commit="a" * 40,
    )

    assert evidence["project_ref"] == capture.EXPECTED_PROJECT_REF
    assert evidence["git_commit"] == "a" * 40
    assert evidence["alembic_revision"] == "20260825_0010"
    assert evidence["runtime_role"] == {
        "session_user": "erp_runtime",
        "superuser": False,
        "bypass_rls": False,
        "owns_business_relations": False,
    }
    assert evidence["transaction_checks"] == {
        "payment_idempotency_unique": True,
        "allocation_table_present": True,
        "allocation_projection_owner": "canonical_database_invariant",
        "bank_reconciliation_contract": "bank_statements_and_reconciliation_matches",
        "posted_journal_immutability": True,
        "order_invoice_generation_owner": "canonical_command_functions",
        "grn_inventory_effect_owner": "canonical_command_functions",
        "finance_rls_enabled_and_forced": True,
    }
    assert admin.rolled_back is True
    assert runtime.rolled_back is True
    assert any("relforcerowsecurity" in query for query in runtime.queries)
    assert any("command_requests_idempotency_uq" in query for query in runtime.queries)


def test_capture_refuses_retired_source_project_before_connecting(monkeypatch):
    monkeypatch.setattr(
        capture,
        "_read_only_connection",
        lambda _url: (_ for _ in ()).throw(AssertionError("must not connect")),
    )

    try:
        capture.capture(
            runtime_database_url="postgresql://runtime",
            admin_database_url="postgresql://admin",
            project_ref="jfrairkkzxwkhbtqejnz",
            git_commit="a" * 40,
        )
    except ValueError as error:
        assert "refusing transaction evidence" in str(error)
    else:
        raise AssertionError("retired source project was accepted")
