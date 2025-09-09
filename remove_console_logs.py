#!/usr/bin/env python3
import os
import re
import sys

def remove_console_statements(file_path):
    """Remove console.* statements from a file, preserving the rest of the code."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Pattern to match console statements (including multiline)
        # This pattern handles:
        # - console.log/error/warn/debug/info/trace
        # - Single and multiline statements
        # - Statements with parentheses
        patterns = [
            r'^\s*console\.(log|error|warn|debug|info|trace)\([^;]*\);?\s*\n',  # Single line
            r'^\s*console\.(log|error|warn|debug|info|trace)\([^)]*\)[;,]?\s*\n',  # With closing paren
            r'^\s*console\.(log|error|warn|debug|info|trace)\([\s\S]*?\n\s*\);?\s*\n',  # Multiline
        ]
        
        for pattern in patterns:
            content = re.sub(pattern, '', content, flags=re.MULTILINE)
        
        # Remove standalone console statements without proper ending
        content = re.sub(r'^\s*console\.(log|error|warn|debug|info|trace)\([^)]*$', '', content, flags=re.MULTILINE)
        
        # Clean up multiple blank lines (keep max 2)
        content = re.sub(r'\n\s*\n\s*\n+', '\n\n', content)
        
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def should_skip_file(file_path):
    """Check if file should be skipped (test files, etc.)"""
    skip_patterns = [
        '/tests/',
        '/test/',
        '/__tests__/',
        '.test.',
        '.spec.',
        '/setupProxy.js',
        '/debugLogger.js',
        '/testHelpers.js',
        'jest.setup',
        'testConfig'
    ]
    return any(pattern in file_path for pattern in skip_patterns)

def process_directory(directory):
    """Process all JS/TS files in directory."""
    processed = 0
    skipped = 0
    
    for root, dirs, files in os.walk(directory):
        # Skip node_modules and other build directories
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'build', 'dist', '.git']]
        
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx')):
                file_path = os.path.join(root, file)
                
                if should_skip_file(file_path):
                    skipped += 1
                    continue
                
                if remove_console_statements(file_path):
                    processed += 1
                    print(f"✓ Cleaned: {file_path}")
    
    return processed, skipped

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python remove_console_logs.py <directory>")
        sys.exit(1)
    
    directory = sys.argv[1]
    if not os.path.exists(directory):
        print(f"Directory {directory} does not exist")
        sys.exit(1)
    
    print(f"Processing directory: {directory}")
    print("Skipping test files and debug utilities...")
    print("-" * 50)
    
    processed, skipped = process_directory(directory)
    
    print("-" * 50)
    print(f"✅ Processed: {processed} files")
    print(f"⏭️  Skipped: {skipped} files (test/debug files)")
