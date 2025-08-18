#!/usr/bin/env python3
"""
Final Comprehensive API Testing Suite
Tests ALL API endpoints systematically 
"""
import requests
import json
import time
from typing import Dict, List, Any

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app"
TIMEOUT = 10

class FinalAPITester:
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
            elif method.upper() == "PUT":
                response = requests.put(url, json=data, timeout=TIMEOUT)
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
                result["response"] = response.text[:200] if response.text else ""
                
            # Categorize result
            if response.status_code == expected_status:
                self.results["passed"].append(result)
                print(f"✅ {method} {endpoint} - {response.status_code} ({duration:.2f}s)")
            else:
                self.results["failed"].append(result)
                print(f"❌ {method} {endpoint} - {response.status_code} ({duration:.2f}s)")
                if "response" in result and isinstance(result["response"], dict):
                    if "detail" in result["response"]:
                        print(f"   Error: {str(result['response']['detail'])[:100]}...")
                    
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

    def run_comprehensive_tests(self):
        """Run ALL API tests systematically"""
        print("🚀 Starting FINAL Comprehensive API Testing...")
        print("=" * 70)
        
        # 1. Basic Health Checks
        print("\n📊 1. HEALTH & STATUS CHECKS")
        print("-" * 40)
        self.test_endpoint("GET", "/")
        self.test_endpoint("GET", "/health")
        self.test_endpoint("GET", "/docs", expected_status=200)
        
        # 2. Enterprise API Suite
        print("\n🏢 2. ENTERPRISE API SUITE")
        print("-" * 40)
        self.test_endpoint("GET", "/api/erp/health")
        self.test_endpoint("GET", "/api/erp/endpoints")
        self.test_endpoint("GET", "/api/erp/organization/1")
        
        # 3. Products APIs - All variations
        print("\n🏷️ 3. PRODUCT APIs")
        print("-" * 40)
        self.test_endpoint("GET", "/api/products/search?q=tablet&limit=3")
        self.test_endpoint("GET", "/api/products/master/categories")
        self.test_endpoint("GET", "/api/products/master/types")
        # Try the complex endpoint with timeout handling
        self.test_endpoint("GET", "/api/products?limit=2")
        
        # 4. Customer APIs
        print("\n👥 4. CUSTOMER APIs")
        print("-" * 40)
        self.test_endpoint("GET", "/api/customers?limit=3")
        
        # 5. Sales APIs - All endpoints
        print("\n💰 5. SALES APIs")
        print("-" * 40)
        self.test_endpoint("GET", "/api/sales")
        self.test_endpoint("GET", "/api/sales/outstanding")
        
        # 6. Inventory APIs
        print("\n📦 6. INVENTORY APIs")
        print("-" * 40)
        self.test_endpoint("GET", "/api/inventory")
        self.test_endpoint("GET", "/api/inventory/batches")
        
        # 7. Dashboard APIs
        print("\n📊 7. DASHBOARD APIs")
        print("-" * 40)
        self.test_endpoint("GET", "/api/dashboard")
        self.test_endpoint("GET", "/api/dashboard/stats")
        
        # 8. Payment APIs
        print("\n💳 8. PAYMENT APIs")
        print("-" * 40)
        self.test_endpoint("GET", "/api/payments")
        self.test_endpoint("GET", "/api/payments/summary")
        
        # 9. Additional Core APIs
        print("\n🔄 9. ADDITIONAL CORE APIs")
        print("-" * 40)
        self.test_endpoint("GET", "/api/billing")
        self.test_endpoint("GET", "/api/suppliers")
        self.test_endpoint("GET", "/api/invoices")
        self.test_endpoint("GET", "/api/orders")
        
        # 10. Enterprise Advanced APIs
        print("\n🎯 10. ENTERPRISE ADVANCED APIs")
        print("-" * 40)
        self.test_endpoint("GET", "/api/erp/products/advanced-search?search_term=tab&limit=2")
        self.test_endpoint("GET", "/api/erp/inventory/stock-overview")
        self.test_endpoint("GET", "/api/erp/analytics/executive-dashboard")
        
        # Summary
        self.print_final_summary()
        
    def print_final_summary(self):
        """Print comprehensive test results summary"""
        print("\n" + "=" * 70)
        print("📋 FINAL API TEST SUMMARY")
        print("=" * 70)
        
        total_tests = (len(self.results["passed"]) + len(self.results["failed"]) + 
                      len(self.results["errors"]) + len(self.results["timeouts"]))
        
        print(f"✅ Passed: {len(self.results['passed'])}")
        print(f"❌ Failed: {len(self.results['failed'])}")
        print(f"💥 Errors: {len(self.results['errors'])}")
        print(f"⏰ Timeouts: {len(self.results['timeouts'])}")
        print(f"📊 Total: {total_tests}")
        
        success_rate = (len(self.results["passed"]) / total_tests * 100) if total_tests > 0 else 0
        print(f"🎯 Success Rate: {success_rate:.1f}%")
        
        # Performance analysis
        if self.results["passed"]:
            durations = [r["duration"] for r in self.results["passed"] if "duration" in r]
            if durations:
                avg_duration = sum(durations) / len(durations)
                max_duration = max(durations)
                min_duration = min(durations)
                print(f"\n⚡ PERFORMANCE METRICS:")
                print(f"   - Average Response Time: {avg_duration:.2f}s")
                print(f"   - Fastest Response: {min_duration:.2f}s")
                print(f"   - Slowest Response: {max_duration:.2f}s")
        
        # Categorize by status
        working_apis = []
        broken_apis = []
        
        for result in self.results["passed"]:
            working_apis.append(f"{result['method']} {result['endpoint']}")
            
        for result in self.results["failed"]:
            broken_apis.append(f"{result['method']} {result['endpoint']} ({result['status_code']})")
            
        print(f"\n✅ WORKING APIs ({len(working_apis)}):")
        for api in working_apis:
            print(f"   - {api}")
            
        if broken_apis:
            print(f"\n❌ BROKEN APIs ({len(broken_apis)}):")
            for api in broken_apis:
                print(f"   - {api}")
                
        # Final assessment
        print(f"\n🎉 FINAL ASSESSMENT:")
        if success_rate >= 90:
            print("   🟢 EXCELLENT - API ecosystem is highly functional")
        elif success_rate >= 75:
            print("   🟡 GOOD - API ecosystem is mostly functional")
        elif success_rate >= 50:
            print("   🟠 FAIR - API ecosystem needs improvement")
        else:
            print("   🔴 POOR - API ecosystem needs significant work")
            
        print(f"\n📈 STATUS: {len(working_apis)} APIs working, {len(broken_apis)} need fixes")

if __name__ == "__main__":
    tester = FinalAPITester()
    tester.run_comprehensive_tests()