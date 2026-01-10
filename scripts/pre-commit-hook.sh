#!/bin/bash
# Pre-commit Hook for Quality Checks
# Copy this to .git/hooks/pre-commit and make executable: chmod +x .git/hooks/pre-commit

echo "🔍 Running pre-commit quality checks..."

# Check 1: No TODO/FIXME in production code
echo "Checking for TODO/FIXME..."
if git diff --cached --name-only | grep -E '\.(py|ts|tsx)$' | xargs grep -n "TODO\|FIXME" 2>/dev/null; then
    echo "❌ Found TODO/FIXME in staged files. Please resolve before committing."
    exit 1
fi

# Check 2: No console.log in frontend
echo "Checking for console.log..."
if git diff --cached --name-only | grep -E '\.(ts|tsx)$' | xargs grep -n "console\.log" 2>/dev/null; then
    echo "⚠️  Warning: Found console.log in staged files. Consider using logger instead."
fi

# Check 3: No print() in backend
echo "Checking for print statements..."
if git diff --cached --name-only | grep '\.py$' | xargs grep -n "print(" 2>/dev/null | grep -v "# OK: print"; then
    echo "⚠️  Warning: Found print() in Python files. Use logger instead."
fi

# Check 4: Check for common SQL injection patterns
echo "Checking for potential SQL injection..."
if git diff --cached --name-only | grep '\.py$' | xargs grep -n "f\".*SELECT\|f'.*SELECT" 2>/dev/null; then
    echo "❌ Potential SQL injection risk: f-string in SQL query. Use parameterized queries."
    exit 1
fi

# Check 5: Verify no hardcoded secrets
echo "Checking for hardcoded secrets..."
if git diff --cached --name-only | xargs grep -iEn "password\s*=\s*['\"]|api_key\s*=\s*['\"]|secret\s*=\s*['\"]" 2>/dev/null | grep -v "# OK:"; then
    echo "❌ Possible hardcoded secret detected!"
    exit 1
fi

echo "✅ Pre-commit checks passed!"
exit 0
