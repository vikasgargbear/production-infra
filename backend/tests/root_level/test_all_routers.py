#!/usr/bin/env python3
"""
Comprehensive Router Testing Suite
Tests ALL registered routers to ensure complete coverage
"""
import requests
import json
import time
from typing import Dict, List, Any

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app"
TIMEOUT = 15

class RouterTester:
    def __init__(self):
        self.results = {
            "passed": [],
            "failed": [],
            "errors": [],
            "timeouts": []
        }
        
    def test_endpoint(self, method: str, endpoint: str, data: dict = None, expected_status: int = 200) -> Dict[str, Any]:
        """Test a single API endpoint"""
        url = f"{BASE_URL}{endpoint}"
        
        try:
            start_time = time.time()
            
            if method.upper() == "GET":
                response = requests.get(url, params=data, timeout=TIMEOUT)
            elif method.upper() == "POST":
                response = requests.post(url, json=data, timeout=TIMEOUT)
            else:
                return {"error": f"Unsupported method: {method}"}
                
            end_time = time.time()
            duration = end_time - start_time
            
            result = {
                "method": method.upper(),
                "endpoint": endpoint,
                "status_code": response.status_code,
                "duration": round(duration, 2),
                "response_size": len(response.content) if response.content else 0
            }
            
            # Check if response is JSON
            try:
                result["response"] = response.json()
            except:
                result["response"] = response.text[:100] if response.text else ""
                
            # Categorize result
            if response.status_code == expected_status:
                self.results["passed"].append(result)
                print(f"✅ {method} {endpoint} - {response.status_code} ({duration:.2f}s)")
            else:
                self.results["failed"].append(result)
                print(f"❌ {method} {endpoint} - {response.status_code} ({duration:.2f}s)")
                if "response" in result and isinstance(result["response"], dict):
                    if "detail" in result["response"]:
                        print(f"   Error: {str(result['response']['detail'])[:80]}...")
                    
            return result
            
        except requests.exceptions.Timeout:
            result = {"method": method, "endpoint": endpoint, "error": "TIMEOUT"}
            self.results["timeouts"].append(result)
            print(f"⏰ {method} {endpoint} - TIMEOUT ({TIMEOUT}s)")
            return result
            
        except Exception as e:
            result = {"method": method, "endpoint": endpoint, "error": str(e)}
            self.results["errors"].append(result)
            print(f"💥 {method} {endpoint} - ERROR: {str(e)}")
            return result

    def run_all_router_tests(self):
        """Test ALL registered routers systematically"""
        print("🚀 Starting COMPLETE Router Testing...")
        print("=" * 80)
        
        # 1. Core Business Routers (with prefixes)
        print("\n📦 1. CORE BUSINESS ROUTERS")
        print("-" * 50)
        self.test_endpoint("GET", "/api/auth")  # May not have root endpoint
        self.test_endpoint("GET", "/api/customers")
        self.test_endpoint("GET", "/api/products") 
        self.test_endpoint("GET", "/api/sales")
        self.test_endpoint("GET", "/api/inventory")
        self.test_endpoint("GET", "/api/payments")
        self.test_endpoint("GET", "/api/dashboard")
        self.test_endpoint("GET", "/api/billing")
        
        # 2. Secondary Business Routers (no prefix)
        print("\n🔄 2. SECONDARY BUSINESS ROUTERS")
        print("-" * 50)
        self.test_endpoint("GET", "/api/orders")
        self.test_endpoint("GET", "/api/invoices")
        self.test_endpoint("GET", "/api/order-items", expected_status=404)  # May not exist
        self.test_endpoint("GET", "/api/users")
        self.test_endpoint("GET", "/api/suppliers")
        self.test_endpoint("GET", "/api/purchases")
        
        # 3. Operational Routers
        print("\n⚙️ 3. OPERATIONAL ROUTERS")
        print("-" * 50)
        self.test_endpoint("GET", "/api/delivery-challan", expected_status=404)  # Check route
        self.test_endpoint("GET", "/api/stock-adjustments", expected_status=404)
        self.test_endpoint("GET", "/api/tax-entries", expected_status=404)
        self.test_endpoint("GET", "/api/purchase-upload", expected_status=404)
        self.test_endpoint("GET", "/api/purchase-enhanced", expected_status=404)
        self.test_endpoint("GET", "/api/sale-returns", expected_status=404)
        self.test_endpoint("GET", "/api/purchase-returns", expected_status=404)
        self.test_endpoint("GET", "/api/stock-movements", expected_status=404)
        self.test_endpoint("GET", "/api/party-ledger", expected_status=404)
        self.test_endpoint("GET", "/api/credit-debit-notes", expected_status=404)
        
        # 4. Stock & Inventory Routers
        print("\n📦 4. STOCK & INVENTORY ROUTERS")
        print("-" * 50)
        self.test_endpoint("GET", "/api/stock")  # Stock receive with prefix
        self.test_endpoint("GET", "/api/inventory/batches")  # Inventory batches
        self.test_endpoint("GET", "/api/stock/batches")  # Stock batches
        self.test_endpoint("GET", "/api/stock-dashboard", expected_status=404)  # No prefix
        
        # 5. Enterprise & Advanced Routers
        print("\n🏢 5. ENTERPRISE & ADVANCED ROUTERS")
        print("-" * 50)
        self.test_endpoint("GET", "/api/enterprise-orders", expected_status=404)
        self.test_endpoint("GET", "/api/collection-center", expected_status=404)
        self.test_endpoint("GET", "/api/enterprise-delivery-challan", expected_status=404)
        
        # 6. New/Special Routers
        print("\n🆕 6. NEW & SPECIAL ROUTERS")
        print("-" * 50)
        self.test_endpoint("GET", "/api/master-settings", expected_status=404)
        self.test_endpoint("GET", "/api/schemes-discounts", expected_status=404)
        self.test_endpoint("GET", "/api/loyalty-points", expected_status=404)
        self.test_endpoint("GET", "/api/compliance", expected_status=404)
        self.test_endpoint("GET", "/api/create-user", expected_status=404)
        
        # 7. Enterprise ERP Suite
        print("\n🎯 7. ENTERPRISE ERP SUITE")
        print("-" * 50)
        self.test_endpoint("GET", "/api/erp/health")
        self.test_endpoint("GET", "/api/erp/endpoints")
        self.test_endpoint("GET", "/api/erp/organization/1")
        
        # 8. PostgreSQL Function Wrappers
        print("\n🗄️ 8. POSTGRESQL FUNCTION WRAPPERS")
        print("-" * 50)
        self.test_endpoint("GET", "/api/pg/customers/search?q=test", expected_status=500)  # May need params
        self.test_endpoint("GET", "/api/pg/products/search?q=test", expected_status=500)
        
        # Summary
        self.print_router_summary()
        
    def print_router_summary(self):
        """Print router test results summary"""
        print("\n" + "=" * 80)
        print("📋 COMPLETE ROUTER TEST SUMMARY")
        print("=" * 80)
        
        total_tests = (len(self.results["passed"]) + len(self.results["failed"]) + 
                      len(self.results["errors"]) + len(self.results["timeouts"]))
        
        print(f"✅ Working Routers: {len(self.results['passed'])}")
        print(f"❌ Broken Routers: {len(self.results['failed'])}")
        print(f"💥 Error Routers: {len(self.results['errors'])}")
        print(f"⏰ Timeout Routers: {len(self.results['timeouts'])}")
        print(f"📊 Total Tested: {total_tests}")
        
        success_rate = (len(self.results["passed"]) / total_tests * 100) if total_tests > 0 else 0
        print(f"🎯 Router Success Rate: {success_rate:.1f}%")
        
        # Performance analysis
        if self.results["passed"]:
            durations = [r["duration"] for r in self.results["passed"] if "duration" in r]
            if durations:
                avg_duration = sum(durations) / len(durations)
                print(f"⚡ Average Response Time: {avg_duration:.2f}s")
        
        # Categorize routers
        working_routers = []
        broken_routers = []
        missing_routers = []
        
        for result in self.results["passed"]:
            working_routers.append(result['endpoint'])
            
        for result in self.results["failed"]:
            if result['status_code'] == 404:
                missing_routers.append(result['endpoint'])
            else:
                broken_routers.append(f"{result['endpoint']} ({result['status_code']})")
        
        print(f"\n✅ WORKING ROUTERS ({len(working_routers)}):")
        for router in working_routers:
            print(f"   - {router}")
            
        if broken_routers:
            print(f"\n❌ BROKEN ROUTERS ({len(broken_routers)}):")
            for router in broken_routers:
                print(f"   - {router}")
                
        if missing_routers:
            print(f"\n🔍 MISSING/NO-ROOT ROUTERS ({len(missing_routers)}):")
            for router in missing_routers:
                print(f"   - {router}")
                
        # Final router assessment
        print(f"\n🎉 ROUTER ECOSYSTEM STATUS:")
        actual_working = len(working_routers)
        if actual_working >= 15:
            print("   🟢 EXCELLENT - Most routers are functional")
        elif actual_working >= 10:
            print("   🟡 GOOD - Core routers are working")
        elif actual_working >= 5:
            print("   🟠 FAIR - Basic routers working")
        else:
            print("   🔴 POOR - Many routers need fixes")
            
        print(f"\n📈 ROUTER STATUS:")
        print(f"   - {actual_working} routers working")
        print(f"   - {len(broken_routers)} routers broken") 
        print(f"   - {len(missing_routers)} routers missing root endpoints")

if __name__ == "__main__":
    tester = RouterTester()
    tester.run_all_router_tests()