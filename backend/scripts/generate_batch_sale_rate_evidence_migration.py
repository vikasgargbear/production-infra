"""Forward-only batch-rate owner plus deterministic shared lifecycle registration."""
import argparse
import hashlib
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'database/canonical/operations/automation/batch_sale_rate_evidence.sql'
OUTPUT = ROOT / 'backend/alembic/sql/20260913_0079_batch_sale_rate_evidence.sql'


def render():
    spec = importlib.util.spec_from_file_location('automation_owner', ROOT / 'database/canonical/commands_automation/generate_automation_commands.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Extend the closed operation vocabulary using the same owner that emits
    # prepare and request-envelope validation. Older baseline artifacts stay frozen.
    module.OPERATOR_COMMANDS['inventory.batch_sale_rate.prepare'] = ('inventory.batch_sale_rate.record', 'batch_sale_rate_review')
    selected = []
    for statement in module._request_match_definition():
        if statement.startswith('CREATE FUNCTION') and any(
            f'"{name}"(' in statement.split('RETURNS')[0]
            for name in ('guard_command_request_match', 'prepare_operator_command')
        ):
            selected.append(statement.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1) + ';')
    assert len(selected) == 2
    rate_read = (ROOT / 'database/canonical/operations/automation/migrated_batch_sale_rate.sql').read_text()
    rate_read = rate_read[rate_read.index('CREATE FUNCTION'):]
    rate_read = rate_read.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1)
    # Current reviewed rates are domain records, not migration-only facts.
    rate_read = rate_read.replace('WITH bound AS (', '''WITH saved AS (
        SELECT e.sale_rate::text AS rate, 'reviewed_batch_price'::text AS source, e.effective_from
          FROM inventory.batch_sale_rate_evidence e
          JOIN inventory.batches b ON b.org_id=e.org_id AND b.id=e.batch_id
          JOIN catalog.products p ON p.org_id=b.org_id AND p.id=b.product_id AND p.base_uom_code=e.uom_code
         WHERE e.org_id=organization_id AND e.batch_id=selected_batch_id
           AND e.branch_id=selected_branch_id AND e.effective_from<=as_of_date
         ORDER BY e.version DESC LIMIT 1
    ), bound AS (''')
    rate_read = rate_read.replace('SELECT c.rate, c.source, c.observed_date\n      FROM candidates c', '''SELECT picked.rate,picked.source,picked.observed_date FROM (
      SELECT -1 AS priority,s.rate,s.source,s.effective_from AS observed_date,''::text AS tie_breaker FROM saved s
      UNION ALL
      SELECT c.priority,c.rate,c.source,c.observed_date,c.tie_breaker FROM candidates c''')
    rate_read = rate_read.replace('ORDER BY c.priority, c.observed_date DESC NULLS LAST, c.tie_breaker', ') picked ORDER BY picked.priority,picked.observed_date DESC NULLS LAST,picked.tie_breaker')
    return 'SET LOCAL ROLE erp_migration_owner;\n' + '\n'.join(selected) + '\n' + SOURCE.read_text() + '\n' + rate_read + '\nRESET ROLE;\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    sql = render()
    if args.check:
        assert OUTPUT.read_text() == sql
    else:
        OUTPUT.write_text(sql)
    print(hashlib.sha256(sql.encode()).hexdigest())
