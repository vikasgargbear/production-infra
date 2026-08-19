"""Exact monetary arithmetic shared by ERP calculation services."""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Optional


MONEY_QUANTUM = Decimal("0.01")
RUPEE_QUANTUM = Decimal("1")
PERCENT_HUNDRED = Decimal("100")


def decimal_value(
    value: Any,
    field: str,
    *,
    minimum: Optional[Decimal] = None,
    maximum: Optional[Decimal] = None,
) -> Decimal:
    """Convert an external numeric value to a finite Decimal and validate bounds."""
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be a valid number") from exc

    if not result.is_finite():
        raise ValueError(f"{field} must be a finite number")
    if minimum is not None and result < minimum:
        raise ValueError(f"{field} must be at least {minimum}")
    if maximum is not None and result > maximum:
        raise ValueError(f"{field} must be at most {maximum}")
    return result


def money(value: Any) -> Decimal:
    """Round an amount to paise using commercial half-up rounding."""
    return Decimal(str(value)).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def money_json(value: Any) -> str:
    """Serialize money as an exact, canonical two-decimal JSON string."""
    rounded = money(decimal_value(value, "money"))
    if rounded == 0:
        rounded = Decimal("0.00")
    return format(rounded, ".2f")


def rupees(value: Any) -> Decimal:
    """Round an amount to whole rupees using commercial half-up rounding."""
    return Decimal(str(value)).quantize(RUPEE_QUANTUM, rounding=ROUND_HALF_UP)
