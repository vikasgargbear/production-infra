from uuid import UUID

import pytest

from scripts.canonical_demo_ids import (
    canonical_live18_cycle_count_authority,
    canonical_live18_destruction_authority,
)


ORG_ID = "7e7b1f60-10d2-4f1b-8179-0f11e9b6b5c1"
GST_REGISTRATION_ID = "d3200000-0000-7000-8000-000000000005"
RULE_VERSION = "cgst-act-section-17-5-h-2022-01-01"
REQUESTER_MEMBERSHIP_ID = "d3000000-0000-7000-8000-000000000024"


def test_cycle_count_and_destruction_authorities_remain_attempt_scoped() -> None:
    cycle = canonical_live18_cycle_count_authority(ORG_ID, "1234", "2")
    destruction = canonical_live18_destruction_authority(
        ORG_ID,
        "1234",
        "2",
        requester_membership_id=REQUESTER_MEMBERSHIP_ID,
        gst_registration_id=GST_REGISTRATION_ID,
        itc_reversal_rule_version=RULE_VERSION,
    )
    retry = canonical_live18_destruction_authority(
        ORG_ID,
        "1234",
        "3",
        requester_membership_id=REQUESTER_MEMBERSHIP_ID,
        gst_registration_id=GST_REGISTRATION_ID,
        itc_reversal_rule_version=RULE_VERSION,
    )

    assert cycle.storage_object_path == (
        "demo/1234-2/inventory-cycle-count-sheet.json"
    )
    assert destruction.certificate_storage_object_path == (
        "demo/1234-2/licensed-incineration-certificate-1234-2.pdf"
    )
    assert destruction.itc_reversal_storage_object_path == (
        "demo/1234-2/section-17-5-h-working-1234-2.json"
    )
    assert destruction.gst_registration_id == GST_REGISTRATION_ID
    for authority_id in (
        destruction.certificate_attachment_id,
        destruction.itc_reversal_attachment_id,
        destruction.itc_reversal_rule_id,
        destruction.sales_return_id,
    ):
        UUID(authority_id)
    assert destruction.certificate_attachment_id != retry.certificate_attachment_id
    assert destruction.itc_reversal_rule_id == retry.itc_reversal_rule_id
    assert destruction.sales_return_id == retry.sales_return_id


@pytest.mark.parametrize(
    ("registration_id", "rule_version"),
    (("not-a-uuid", RULE_VERSION), (GST_REGISTRATION_ID, ""),
     (GST_REGISTRATION_ID, f" {RULE_VERSION}")),
)
def test_destruction_authority_rejects_unreviewed_identity(
    registration_id: str,
    rule_version: str,
) -> None:
    with pytest.raises(ValueError):
        canonical_live18_destruction_authority(
            ORG_ID,
            "1234",
            "2",
            requester_membership_id=REQUESTER_MEMBERSHIP_ID,
            gst_registration_id=registration_id,
            itc_reversal_rule_version=rule_version,
        )
