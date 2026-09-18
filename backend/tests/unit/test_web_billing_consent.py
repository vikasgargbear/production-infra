from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import DBAPIError

from app.api.routes import web_billing_consent as api


def request(**changes):
    return api.ConsentRequest(**dict(dict(branch_id=uuid4(), maximum_amount='1000.00',
        expires_at=datetime.now(timezone.utc)+timedelta(hours=1),
        idempotency_key='explicit-consent-1', confirmed=True), **changes))


@pytest.mark.parametrize('amount', [None, 1000, 'NaN', 'Infinity', '-1', '1.001', ''])
def test_amount_must_be_exact_positive_decimal_text(amount):
    with pytest.raises(ValidationError):
        request(maximum_amount=amount)


@pytest.mark.parametrize('expiry', [datetime.now(), datetime.now(timezone.utc)-timedelta(seconds=1)])
def test_expiry_requires_aware_future(expiry):
    with pytest.raises(ValidationError):
        request(expires_at=expiry)


def test_no_actor_or_org_can_be_supplied_in_body():
    with pytest.raises(ValidationError):
        request(org_id=uuid4())
    with pytest.raises(ValidationError):
        request(subject_membership_id=uuid4())


@pytest.mark.parametrize('changes', [{'maximum_amount': '0'}, {'confirmed': False}])
def test_invalid_consent_never_reaches_database(changes):
    with pytest.raises(HTTPException) as error:
        api.create_consent(request(**changes), user={}, db=None)
    assert error.value.status_code == 422


@pytest.mark.parametrize('code,status', [('42501',403),('23505',409),('40001',409),('22023',422),('23514',422),('42P01',500),('08006',500)])
def test_known_validation_and_unexpected_database_errors_are_distinct(code, status):
    error = DBAPIError('private query', None, SimpleNamespace(pgcode=code))
    with pytest.raises(HTTPException) as caught:
        api._failure(error)
    assert caught.value.status_code == status
    assert 'private query' not in caught.value.detail


def test_context_uses_only_authenticated_identity():
    calls = []
    db = SimpleNamespace(execute=lambda sql, params: calls.append(params))
    org, auth = uuid4(), uuid4()
    assert api._context(db, {'org_id':str(org), 'auth_user_id':str(auth)}) == org
    assert calls[0]['org_id'] == org
    assert calls[0]['auth_user_id'] == auth
    assert calls[0]['request_id']
