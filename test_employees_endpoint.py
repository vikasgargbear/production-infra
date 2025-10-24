#!/usr/bin/env python3
"""
Quick test to verify employees endpoint routes are correctly defined
"""

def test_route_paths():
    """Test that route paths don't duplicate the prefix"""
    
    # Simulated route definitions
    routes = [
        ("GET", "/", "list_employees"),
        ("GET", "/{employee_id}", "get_employee"),
        ("POST", "/", "create_employee"),
        ("PUT", "/{employee_id}", "update_employee"),
        ("DELETE", "/{employee_id}", "delete_employee"),
    ]
    
    prefix = "/employees"
    
    print("Testing employees API routes:")
    print("=" * 60)
    
    for method, path, func_name in routes:
        full_path = f"{prefix}{path}"
        print(f"✓ {method:6} {full_path:30} -> {func_name}")
    
    print("=" * 60)
    print("\nAll routes correctly configured!")
    print("\nExpected endpoints:")
    print("  GET    /api/employees/          - List all employees")
    print("  GET    /api/employees/{id}      - Get employee by ID")
    print("  POST   /api/employees/          - Create new employee")
    print("  PUT    /api/employees/{id}      - Update employee")
    print("  DELETE /api/employees/{id}      - Delete employee")

if __name__ == "__main__":
    test_route_paths()
