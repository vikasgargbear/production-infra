"""
API Test Runner - Run tests against production or local API
"""

import os
import sys
import json
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test configuration
TEST_CONFIG = {
    "production": {
        "base_url": "https://pharma-backend-production-0c09.up.railway.app/api",
        "needs_auth": False,  # Update if auth is required
    },
    "local": {
        "base_url": "http://localhost:8000/api",
        "needs_auth": False,
    }
}

# Test data - Update these with actual IDs from your database
TEST_DATA = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_id": 35,
    "product_id": 47,
    "supplier_id": 1,
    "branch_id": 1
}


class APITestRunner:
    """Main test runner for all API modules"""
    
    def __init__(self, environment="production"):
        self.env = environment
        self.config = TEST_CONFIG.get(environment, TEST_CONFIG["local"])
        self.base_url = self.config["base_url"]
        self.results = {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "errors": []
        }
        
    def run_test_module(self, module_name, test_class):
        """Run tests for a specific module"""
        logger.info(f"\n{'='*60}")
        logger.info(f"Running {module_name} tests against {self.env}")
        logger.info(f"API URL: {self.base_url}")
        logger.info(f"{'='*60}\n")
        
        # Update the test class with correct URL
        original_url = test_class.BASE_URL if hasattr(test_class, 'BASE_URL') else None
        if hasattr(test_class, 'BASE_URL'):
            test_class.BASE_URL = self.base_url
        
        try:
            # Run the module's tests
            from importlib import import_module
            module = import_module(f"tests.{module_name}")
            if hasattr(module, 'run_tests'):
                success = module.run_tests()
                self.results["total"] += 1
                if success:
                    self.results["passed"] += 1
                else:
                    self.results["failed"] += 1
        except Exception as e:
            logger.error(f"Failed to run {module_name}: {str(e)}")
            self.results["errors"].append({
                "module": module_name,
                "error": str(e)
            })
            self.results["failed"] += 1
        finally:
            # Restore original URL
            if original_url and hasattr(test_class, 'BASE_URL'):
                test_class.BASE_URL = original_url
                
    def print_summary(self):
        """Print test summary"""
        logger.info(f"\n{'='*60}")
        logger.info("TEST SUMMARY")
        logger.info(f"{'='*60}")
        logger.info(f"Environment: {self.env}")
        logger.info(f"Total modules: {self.results['total']}")
        logger.info(f"Passed: {self.results['passed']}")
        logger.info(f"Failed: {self.results['failed']}")
        
        if self.results["errors"]:
            logger.error("\nErrors encountered:")
            for error in self.results["errors"]:
                logger.error(f"- {error['module']}: {error['error']}")
        
        logger.info(f"{'='*60}\n")
        
        # Save results to file
        with open(f"test_results_{self.env}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json", "w") as f:
            json.dump(self.results, f, indent=2)
            
    def run_all_tests(self):
        """Run all available test modules"""
        test_modules = [
            ("test_01_invoice_api", "Invoice API"),
            # Add more modules as they're created:
            # ("test_02_products_api", "Products API"),
            # ("test_03_customers_api", "Customers API"),
            # ("test_04_orders_api", "Orders API"),
            # ("test_05_inventory_api", "Inventory API"),
        ]
        
        for module_file, module_name in test_modules:
            try:
                self.run_test_module(module_file, module_name)
            except Exception as e:
                logger.error(f"Skipping {module_name}: {str(e)}")
                
        self.print_summary()


def main():
    """Main entry point"""
    # Check command line arguments
    env = "production"  # Default to production
    if len(sys.argv) > 1:
        env = sys.argv[1].lower()
        if env not in ["production", "local"]:
            logger.error("Usage: python test_runner.py [production|local]")
            sys.exit(1)
    
    # Create and run test runner
    runner = APITestRunner(environment=env)
    
    # Update test modules with correct base URL
    import test_01_invoice_api
    test_01_invoice_api.BASE_URL = runner.base_url
    
    # Run all tests
    runner.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if runner.results["failed"] == 0 else 1)


if __name__ == "__main__":
    main()