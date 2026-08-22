import importlib.util
from pathlib import Path

from packaging.version import Version


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/mcp_runtime_gate.py"
SPEC = importlib.util.spec_from_file_location("mcp_runtime_gate", SCRIPT)
gate = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(gate)


def test_gate_detects_shared_runtime_conflicts_from_sdk_metadata():
    conflicts = gate.incompatible_shared_pins(
        {
            "pydantic": Version("2.5.0"),
            "pyjwt": Version("2.8.0"),
            "python-multipart": Version("0.0.6"),
            "uvicorn": Version("0.24.0"),
        },
        (
            "pydantic>=2.12.0",
            "PyJWT[crypto]>=2.13.0",
            "python-multipart>=0.0.9",
            "uvicorn>=0.31.1",
            "unrelated>=1",
        ),
    )

    assert {item["package"] for item in conflicts} == {
        "pydantic",
        "pyjwt",
        "python-multipart",
        "uvicorn",
    }


def test_gate_reads_exactly_the_reviewed_core_read_tool_names():
    assert (
        set(gate.registry_tool_names(gate.REGISTRY_SOURCE))
        == gate.EXPECTED_CORE_READ_TOOLS
    )


def test_non_sdk_report_describes_the_implemented_isolated_transport_honestly():
    report = gate.build_report(probe_sdk=False)

    assert report["mcp_transport_implemented"] is True
    assert report["write_tools_exported"] is True
    assert set(report["registry_tools"]) == gate.expected_runtime_tools()
    assert report["official_sdk_version"] is None
    assert report["transport"] == "official_sdk_streamable_http_stateless"
    assert any("DCR is disabled" in item for item in report["remaining_blockers"])
    assert any("transfer and destruction" in item for item in report["remaining_blockers"])
