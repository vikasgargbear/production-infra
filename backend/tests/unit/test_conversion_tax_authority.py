from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.api.services.sales.conversion.service import ConversionService


def _database_result(*items: dict) -> Mock:
    result = Mock()
    result.__iter__ = Mock(
        return_value=iter(SimpleNamespace(_mapping=item) for item in items)
    )
    return result


def test_challan_conversion_preserves_authoritative_product_gst() -> None:
    database = Mock()
    database.execute.return_value = _database_result(
        {"product_id": 17, "gst_percent": 5},
    )

    items = ConversionService.get_challan_items(database, [31])

    assert items == [{"product_id": 17, "gst_percent": 5}]
    statement = str(database.execute.call_args.args[0])
    assert "p.gst_percent as gst_percent" in statement
    assert "COALESCE(p.gst_percent" not in statement
    assert database.execute.call_args.args[1] == {"ids": [31]}


def test_challan_conversion_fails_when_product_gst_is_unclassified() -> None:
    database = Mock()
    database.execute.return_value = _database_result(
        {"product_id": 17, "gst_percent": None},
        {"product_id": 23, "gst_percent": None},
    )

    with pytest.raises(
        ValueError,
        match="Canonical GST classification is required for products: 17, 23",
    ):
        ConversionService.get_challan_items(database, [31])
