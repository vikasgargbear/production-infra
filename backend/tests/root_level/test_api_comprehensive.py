#!/usr/bin/env python3
"""
Comprehensive API Testing Suite
Tests all APIs systematically to identify issues and ensure functionality
"""
import requests
import json
import time
from typing import Dict, List, Any

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app"
TIMEOUT = 10

class APITester:
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
                if "response" in result:
                    print(f"   Response: {str(result['response'])[:100]}...")
                    
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
        """Run all API tests systematically"""
        print("🚀 Starting Comprehensive API Testing...")
        print("=" * 60)
        
        # 1. Basic Health Checks
        print("\n📊 1. HEALTH CHECKS")
        print("-" * 30)
        self.test_endpoint("GET", "/")
        self.test_endpoint("GET", "/health")
        
        # 2. Simple API Endpoints  
        print("\n📦 2. SIMPLE ENDPOINTS")
        print("-" * 30)
        self.test_endpoint("GET", "/api/erp/health")
        self.test_endpoint("GET", "/api/erp/endpoints")
        
        # 3. Product APIs (simplified)
        print("\n🏷️ 3. PRODUCT APIs")
        print("-" * 30)
        self.test_endpoint("GET", "/api/products/search?q=tablet&limit=5")
        self.test_endpoint("GET", "/api/products/master/categories")
        self.test_endpoint("GET", "/api/products/master/types")
        
        # 4. Customer APIs (basic)
        print("\n👥 4. CUSTOMER APIs")
        print("-" * 30)
        self.test_endpoint("GET", "/api/customers")
        
        # 5. Sales APIs
        print("\n💰 5. SALES APIs")
        print("-" * 30)
        self.test_endpoint("GET", "/api/sales")
        self.test_endpoint("GET", "/api/sales/outstanding")
        
        # 6. Inventory APIs
        print("\n📦 6. INVENTORY APIs")
        print("-" * 30)
        self.test_endpoint("GET", "/api/inventory")
        
        # 7. Dashboard APIs
        print("\n📊 7. DASHBOARD APIs")
        print("-" * 30)
        self.test_endpoint("GET", "/api/dashboard")
        
        # 8. Payment APIs
        print("\n💳 8. PAYMENT APIs")
        print("-" * 30)
        self.test_endpoint("GET", "/api/payments")
        
        # 9. Enterprise APIs (simple ones)
        print("\n🏢 9. ENTERPRISE APIs")
        print("-" * 30)
        self.test_endpoint("GET", "/api/erp/organization/1", expected_status=404)  # Expected to fail
        
        # Summary
        self.print_summary()
        
    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("📋 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = (len(self.results["passed"]) + len(self.results["failed"]) + 
                      len(self.results["errors"]) + len(self.results["timeouts"]))
        
        print(f"✅ Passed: {len(self.results['passed'])}")
        print(f"❌ Failed: {len(self.results['failed'])}")
        print(f"💥 Errors: {len(self.results['errors'])}")
        print(f"⏰ Timeouts: {len(self.results['timeouts'])}")
        print(f"📊 Total: {total_tests}")
        
        success_rate = (len(self.results["passed"]) / total_tests * 100) if total_tests > 0 else 0
        print(f"🎯 Success Rate: {success_rate:.1f}%")
        
        # Show problematic endpoints
        if self.results["failed"]:
            print("\n❌ FAILED ENDPOINTS:")
            for result in self.results["failed"]:
                print(f"   - {result['method']} {result['endpoint']} ({result['status_code']})")
                
        if self.results["timeouts"]:
            print("\n⏰ TIMEOUT ENDPOINTS:")
            for result in self.results["timeouts"]:
                print(f"   - {result['method']} {result['endpoint']}")
                
        if self.results["errors"]:
            print("\n💥 ERROR ENDPOINTS:")
            for result in self.results["errors"]:
                print(f"   - {result['method']} {result['endpoint']}: {result['error']}")
                
        # Performance analysis
        if self.results["passed"]:
            durations = [r["duration"] for r in self.results["passed"] if "duration" in r]
            if durations:
                avg_duration = sum(durations) / len(durations)
                max_duration = max(durations)
                print(f"\n⚡ PERFORMANCE:")
                print(f"   - Average Response Time: {avg_duration:.2f}s")
                print(f"   - Slowest Response: {max_duration:.2f}s")

if __name__ == "__main__":
    tester = APITester()
    tester.run_comprehensive_tests()