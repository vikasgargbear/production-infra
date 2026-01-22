#!/usr/bin/env python3
"""
Enterprise API Test Runner
Run API tests from terminal with various options.

Usage:
    python tests/run_tests.py                    # Run all API tests
    python tests/run_tests.py --module returns   # Run specific module
    python tests/run_tests.py --coverage         # Run with coverage report
    python tests/run_tests.py --html-report      # Generate HTML report
    python tests/run_tests.py --fast             # Skip slow tests
"""
import os
import sys
import subprocess
import argparse
from datetime import datetime


# =============================================================================
# CONFIGURATION
# =============================================================================

# Default environment variables for testing
DEFAULT_ENV = {
    "TEST_MODE": "true",
    "API_BASE_URL": "http://localhost:8000",
}

# Available test modules
MODULES = {
    "returns": "tests/api/returns/",
    "purchase": "tests/api/purchase/",
    "inventory": "tests/api/inventory/",
    "sales": "tests/api/sales/",
    "finance": "tests/api/finance/",
    "master": "tests/api/master/",
    "all": "tests/api/"
}


# =============================================================================
# CLI ARGUMENTS
# =============================================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="Enterprise API Test Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Run all API tests
    python tests/run_tests.py
    
    # Run specific module tests
    python tests/run_tests.py --module returns
    python tests/run_tests.py --module purchase
    python tests/run_tests.py --module inventory
    
    # Run with coverage
    python tests/run_tests.py --coverage
    
    # Run quick tests only (skip slow)
    python tests/run_tests.py --fast
    
    # Run specific test file
    python tests/run_tests.py --file tests/api/returns/test_sales_returns.py
    
    # Run with verbose output
    python tests/run_tests.py -v
        """
    )
    
    parser.add_argument(
        "--module", "-m",
        choices=list(MODULES.keys()),
        default="all",
        help="Test module to run (default: all)"
    )
    
    parser.add_argument(
        "--file", "-f",
        type=str,
        help="Specific test file to run"
    )
    
    parser.add_argument(
        "--coverage", "-c",
        action="store_true",
        help="Run with coverage report"
    )
    
    parser.add_argument(
        "--html-report",
        action="store_true",
        help="Generate HTML test report"
    )
    
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Skip slow tests"
    )
    
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )
    
    parser.add_argument(
        "--failfast", "-x",
        action="store_true",
        help="Stop on first failure"
    )
    
    parser.add_argument(
        "--api-url",
        type=str,
        default="http://localhost:8000",
        help="API base URL (default: http://localhost:8000)"
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show command without running"
    )
    
    return parser.parse_args()


# =============================================================================
# TEST RUNNER
# =============================================================================

def build_pytest_command(args):
    """Build pytest command with options"""
    cmd = ["pytest"]
    
    # Test path
    if args.file:
        cmd.append(args.file)
    else:
        cmd.append(MODULES[args.module])
    
    # Output format
    if args.verbose:
        cmd.append("-v")
    else:
        cmd.append("--tb=short")
    
    # Fast mode - skip slow tests
    if args.fast:
        cmd.extend(["-m", "not slow"])
    
    # Fail fast
    if args.failfast:
        cmd.append("-x")
    
    # Coverage
    if args.coverage:
        cmd.extend([
            "--cov=app/api",
            "--cov-report=term-missing",
            "--cov-report=html:coverage_html"
        ])
    
    # HTML report
    if args.html_report:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        cmd.extend([
            f"--html=test_reports/report_{timestamp}.html",
            "--self-contained-html"
        ])
    
    return cmd


def setup_environment(args):
    """Setup environment variables"""
    env = os.environ.copy()
    
    # Set defaults
    for key, value in DEFAULT_ENV.items():
        if key not in env:
            env[key] = value
    
    # Override API URL if specified
    env["API_BASE_URL"] = args.api_url
    
    return env


def run_tests(args):
    """Run the tests"""
    cmd = build_pytest_command(args)
    env = setup_environment(args)
    
    print("\n" + "=" * 70)
    print("ENTERPRISE API TEST RUNNER")
    print("=" * 70)
    print(f"\nAPI URL: {args.api_url}")
    print(f"Module:  {args.module}")
    print(f"Command: {' '.join(cmd)}")
    print("=" * 70)
    
    if args.dry_run:
        print("\n[DRY RUN] Command not executed")
        return 0
    
    # Create report directory if needed
    if args.html_report:
        os.makedirs("test_reports", exist_ok=True)
    
    # Run pytest
    try:
        result = subprocess.run(
            cmd,
            env=env,
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        return result.returncode
    except KeyboardInterrupt:
        print("\n\nTest run interrupted by user")
        return 130
    except Exception as e:
        print(f"\nError running tests: {e}")
        return 1


# =============================================================================
# QUICK TEST FUNCTIONS
# =============================================================================

def quick_health_check():
    """Quick API health check before running tests"""
    import requests
    
    url = os.getenv("API_BASE_URL", "http://localhost:8000")
    
    try:
        response = requests.get(f"{url}/health", timeout=5)
        if response.status_code == 200:
            print(f"✓ API is healthy at {url}")
            return True
    except:
        pass
    
    print(f"⚠ API may not be running at {url}")
    print("  Start the backend with: uvicorn app.main:app --reload")
    return False


# =============================================================================
# MAIN
# =============================================================================

def main():
    args = parse_args()
    
    # Check if pytest is available
    try:
        import pytest
    except ImportError:
        print("Error: pytest not installed")
        print("Run: pip install pytest pytest-cov pytest-html")
        sys.exit(1)
    
    # Optional health check
    if not args.dry_run:
        try:
            import requests
            quick_health_check()
        except ImportError:
            pass  # Skip health check if requests not available
    
    # Run tests
    exit_code = run_tests(args)
    
    # Summary
    print("\n" + "=" * 70)
    if exit_code == 0:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("=" * 70)
    
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
