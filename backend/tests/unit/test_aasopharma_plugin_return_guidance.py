from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SKILL = ROOT / "plugins/aasopharma-erp/skills/aasopharma-erp/SKILL.md"


def test_chatgpt_return_guidance_fails_closed_on_multi_batch_ambiguity() -> None:
    guidance = " ".join(SKILL.read_text(encoding="utf-8").split())

    for required in (
        "source-line, dispatch/receipt-allocation, batch",
        "more than one returnable allocation",
        "do not choose a batch automatically",
        "billed/free quantity from each",
        "Preserve billed and free quantities separately",
        "Never exceed either the line-level or allocation-level remaining billed/free",
        "Reuse an idempotency key only for an exact replay",
        "If a preview is stale",
    ):
        assert required in guidance
