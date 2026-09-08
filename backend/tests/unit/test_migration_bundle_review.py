from copy import deepcopy
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.api.routes.canonical_historical_migration import review_migration_bundle, validate_migration_bundle

ORG = '11111111-1111-4111-8111-111111111111'
BRANCH = '22222222-2222-4222-8222-222222222222'
LOCATION = '33333333-3333-4333-8333-333333333333'


@pytest.fixture
def bundle():
    return {
        'schema_version': 'aasopharma.marg-migration.v1', 'organization_id': ORG,
        'branch_id': BRANCH, 'location_id': LOCATION, 'dataset_id': 'test-dataset',
        'import_requests': [{
            'dataset_id': 'test-dataset', 'branch_id': BRANCH,
            'confirmation': f'IMPORT-HISTORY:{ORG}:test-dataset',
            'facts': [{'source_kind': 'opening_item', 'record_key': 'opening-1',
                       'event_date': '2026-09-08', 'selection_state': 'reviewed',
                       'outstanding_amount': '123.45', 'side': 'receivable', 'payload': {}}],
        }],
    }


def test_review_is_read_only_and_totals_are_exact(bundle):
    before = deepcopy(bundle)
    result = review_migration_bundle(bundle, {'org_id': ORG})
    assert result['facts'] == 1
    assert result['expected']['receivable'] == '123.45'
    assert result['expected']['payable'] == '0'
    assert bundle == before


def test_session_organization_cannot_be_overridden(bundle):
    with pytest.raises(HTTPException) as error:
        review_migration_bundle(bundle, {'org_id': LOCATION})
    assert error.value.status_code == 422


@pytest.mark.parametrize('field', ['branch_id', 'location_id', 'organization_id', 'dataset_id'])
def test_operator_and_web_share_target_binding(bundle, field):
    target = {**bundle, field: 'different'}
    with pytest.raises(ValueError, match='differs'):
        validate_migration_bundle(bundle, target)


def test_validates_every_batch_and_refuses_duplicates(bundle):
    bundle['import_requests'].append(deepcopy(bundle['import_requests'][0]))
    with pytest.raises(ValueError, match='repeats'):
        validate_migration_bundle(bundle, bundle)


def test_private_source_values_do_not_leak_in_errors(bundle):
    bundle['import_requests'][0]['facts'][0]['outstanding_amount'] = 'PRIVATE-BAD-INPUT'
    with pytest.raises(HTTPException) as error:
        review_migration_bundle(bundle, {'org_id': ORG})
    assert 'PRIVATE' not in error.value.detail


def test_quarantined_openings_not_in_posting_totals(bundle):
    bundle['import_requests'][0]['facts'][0]['selection_state'] = 'quarantined'
    result = review_migration_bundle(bundle, {'org_id': UUID(ORG)})
    assert result['quarantined_by_kind'] == {'opening_item': 1}
    assert result['expected']['openings'] == 0
    assert result['expected']['receivable'] == '0'
