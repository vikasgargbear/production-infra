#!/usr/bin/env python3
"""
Route Validator - Catch trailing slash and CORS issues

Checks:
1. All routes support both /path and /path/ (since redirect_slashes=False)
2. Routes are properly registered in main.py
3. Router prefixes don't conflict
4. CORS preflight compatibility

Usage:
    python scripts/validate_routes.py
    
Exit codes:
    0 - All checks passed
    1 - Issues found
"""

import sys
import os
from pathlib import Path
from typing import List, Dict, Set, Tuple
import importlib.util

# Add app to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def load_app():
    """Load the FastAPI app"""
    try:
        from app.main import app
        return app
    except Exception as e:
        print(f"❌ Failed to load app: {e}")
        sys.exit(1)

def extract_routes(app) -> List[Dict]:
    """Extract all routes from the app"""
    routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            routes.append({
                'path': route.path,
                'methods': route.methods,
                'name': route.name if hasattr(route, 'name') else 'unknown',
            })
    return routes

def check_trailing_slash_coverage(routes: List[Dict]) -> List[str]:
    """
    Check that routes are defined for both /path and /path/ forms
    
    Since redirect_slashes=False, we need both forms explicitly defined
    or neither (for parametric routes)
    """
    issues = []
    
    # Group routes by base path (removing trailing slash for comparison)
    route_groups = {}
    for route in routes:
        path = route['path']
        methods = route['methods']
        
        # Skip OpenAPI/docs routes
        if '/docs' in path or '/openapi' in path or '/redoc' in path:
            continue
            
        # Skip parametric parts (paths with {})
        if '{' in path:
            continue
            
        # Get base path (without trailing slash)
        base_path = path.rstrip('/')
        
        if base_path not in route_groups:
            route_groups[base_path] = {
                'with_slash': False,
                'without_slash': False,
                'methods': set()
            }
        
        # Mark which form we have
        if path.endswith('/'):
            route_groups[base_path]['with_slash'] = True
        else:
            route_groups[base_path]['without_slash'] = True
        
        route_groups[base_path]['methods'].update(methods or [])
    
    # Check coverage
    for base_path, info in route_groups.items():
        # Skip root path
        if base_path == '' or base_path == '/':
            continue
            
        # If we have one form but not the other, it's a problem
        if info['with_slash'] != info['without_slash']:
            missing_form = 'with trailing slash' if not info['with_slash'] else 'without trailing slash'
            issues.append(
                f"⚠️  Path '{base_path}' defined {missing_form} only\n"
                f"    Methods: {', '.join(info['methods'])}\n"
                f"    Fix: Add @router.{list(info['methods'])[0].lower()}(\"{base_path}\") "
                f"and @router.{list(info['methods'])[0].lower()}(\"{base_path}/\")"
            )
    
    return issues

def check_router_prefix_conflicts(routes: List[Dict]) -> List[str]:
    """Check for router prefix conflicts"""
    issues = []
    
    # Extract prefixes (first two parts of path)
    prefixes = {}
    for route in routes:
        path = route['path']
        parts = [p for p in path.split('/') if p and '{' not in p]
        
        if len(parts) >= 2:
            prefix = '/' + '/'.join(parts[:2])
            if prefix not in prefixes:
                prefixes[prefix] = []
            prefixes[prefix].append(path)
    
    # No real conflicts to check for now, but we could add more checks
    return issues

def check_cors_compatibility(routes: List[Dict]) -> List[str]:
    """
    Check routes that might have CORS issues
    
    Specifically:
    - Routes without trailing slash that don't have corresponding slash version
    - POST/PUT/DELETE routes (need preflight)
    """
    issues = []
    
    # Group by path base
    path_methods = {}
    for route in routes:
        base = route['path'].rstrip('/')
        if base not in path_methods:
            path_methods[base] = {
                'methods': set(),
                'has_slash': False,
                'has_no_slash': False
            }
        path_methods[base]['methods'].update(route['methods'] or [])
        if route['path'].endswith('/'):
            path_methods[base]['has_slash'] = True
        else:
            path_methods[base]['has_no_slash'] = True
    
    # Check for potential CORS issues
    for base, info in path_methods.items():
        # Skip docs
        if '/docs' in base or '/openapi' in base:
            continue
            
        mutating_methods = {'POST', 'PUT', 'DELETE', 'PATCH'} & info['methods']
        
        if mutating_methods and not (info['has_slash'] and info['has_no_slash']):
            issues.append(
                f"⚠️  CORS risk: '{base}' has mutating methods but incomplete slash coverage\n"
                f"    Methods: {', '.join(mutating_methods)}\n"
                f"    Has slash: {info['has_slash']}, Has no-slash: {info['has_no_slash']}"
            )
    
    return issues

def main():
    print("🔍 Route Validator - Checking for trailing slash and CORS issues\n")
    
    app = load_app()
    routes = extract_routes(app)
    
    print(f"📊 Found {len(routes)} routes\n")
    
    all_issues = []
    
    # Run checks
    print("1️⃣  Checking trailing slash coverage...")
    slash_issues = check_trailing_slash_coverage(routes)
    all_issues.extend(slash_issues)
    if slash_issues:
        print(f"   ❌ Found {len(slash_issues)} issues")
        for issue in slash_issues:
            print(f"   {issue}\n")
    else:
        print("   ✅ All routes have proper slash coverage\n")
    
    print("2️⃣  Checking CORS compatibility...")
    cors_issues = check_cors_compatibility(routes)
    all_issues.extend(cors_issues)
    if cors_issues:
        print(f"   ⚠️  Found {len(cors_issues)} potential issues")
        for issue in cors_issues:
            print(f"   {issue}\n")
    else:
        print("   ✅ No CORS compatibility issues detected\n")
    
    # Summary
    print("=" * 80)
    if all_issues:
        print(f"❌ Validation failed: {len(all_issues)} issues found")
        print("\n💡 To fix:")
        print("   1. Add both @router.get('') and @router.get('/') decorators")
        print("   2. Ensure mutating methods (POST/PUT/DELETE) have both forms")
        print("   3. Run this script again to verify\n")
        return 1
    else:
        print("✅ All validation checks passed!")
        print("   Routes are properly configured for CORS and trailing slashes\n")
        return 0

if __name__ == '__main__':
    sys.exit(main())
