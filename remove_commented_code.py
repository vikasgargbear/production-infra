#!/usr/bin/env python3
import os
import re
import sys

def remove_commented_blocks(file_path):
    """Remove obvious commented code blocks from files."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        if not lines:
            return False
            
        new_lines = []
        i = 0
        removed_count = 0
        
        while i < len(lines):
            line = lines[i]
            
            # Check for multi-line comment blocks (/* ... */)
            if '/*' in line and not '/**' in line:  # Skip JSDoc comments
                # Find the end of the comment block
                block_lines = [line]
                j = i + 1
                found_end = '*/' in line
                
                while j < len(lines) and not found_end:
                    block_lines.append(lines[j])
                    if '*/' in lines[j]:
                        found_end = True
                    j += 1
                
                # Check if this looks like commented code (not documentation)
                block_text = ''.join(block_lines)
                code_indicators = ['function', 'const ', 'let ', 'var ', 'if (', 'for (', 
                                 'while (', 'return ', 'import ', 'export ', 'class ',
                                 '.then(', '.catch(', 'useState', 'useEffect']
                
                if any(indicator in block_text for indicator in code_indicators):
                    # Skip this commented code block
                    i = j
                    removed_count += len(block_lines)
                    continue
            
            # Check for consecutive single-line comments that look like code
            elif line.strip().startswith('//') and not line.strip().startswith('// TODO') \
                 and not line.strip().startswith('// FIXME') and not line.strip().startswith('// NOTE'):
                # Collect consecutive comment lines
                comment_block = [line]
                j = i + 1
                
                while j < len(lines) and lines[j].strip().startswith('//'):
                    comment_block.append(lines[j])
                    j += 1
                
                # Check if this looks like commented code
                block_text = ' '.join(comment_block)
                if any(indicator in block_text for indicator in ['function', 'const ', 'let ', 
                       'var ', 'if (', 'for (', 'return ', 'import ', 'export ']):
                    # Skip if it's more than 2 lines of commented code
                    if len(comment_block) > 2:
                        i = j
                        removed_count += len(comment_block)
                        continue
            
            new_lines.append(line)
            i += 1
        
        if removed_count > 0:
            # Clean up excessive blank lines
            final_lines = []
            blank_count = 0
            for line in new_lines:
                if line.strip() == '':
                    blank_count += 1
                    if blank_count <= 2:
                        final_lines.append(line)
                else:
                    blank_count = 0
                    final_lines.append(line)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(final_lines)
            return True
        
        return False
            
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def should_skip_file(file_path):
    """Check if file should be skipped."""
    skip_patterns = [
        '/tests/',
        '/test/',
        '/__tests__/',
        '.test.',
        '.spec.',
        'node_modules',
        '/build/',
        '/dist/',
        '.git'
    ]
    return any(pattern in file_path for pattern in skip_patterns)

def process_directory(directory):
    """Process all JS/TS files in directory."""
    processed = 0
    skipped = 0
    
    for root, dirs, files in os.walk(directory):
        # Skip certain directories
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'build', 'dist', '.git']]
        
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx')):
                file_path = os.path.join(root, file)
                
                if should_skip_file(file_path):
                    skipped += 1
                    continue
                
                if remove_commented_blocks(file_path):
                    processed += 1
                    print(f"✓ Cleaned: {file_path}")
    
    return processed, skipped

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python remove_commented_code.py <directory>")
        sys.exit(1)
    
    directory = sys.argv[1]
    if not os.path.exists(directory):
        print(f"Directory {directory} does not exist")
        sys.exit(1)
    
    print(f"Processing directory: {directory}")
    print("Removing commented code blocks...")
    print("-" * 50)
    
    processed, skipped = process_directory(directory)
    
    print("-" * 50)
    print(f"✅ Processed: {processed} files")
    print(f"⏭️  Skipped: {skipped} files")
