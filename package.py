#!/usr/bin/env python3
"""
Chrome Extension Packager
Creates a ZIP archive of the Chrome extension with proper naming and exclusions.
"""

import os
import json
import zipfile
import sys
from pathlib import Path

def get_manifest_info():
    """Read manifest.json and extract name and version."""
    try:
        with open('manifest.json', 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        
        name = manifest.get('name', 'extension')
        version = manifest.get('version', '1.0.0')
        
        # Clean name for filename (remove invalid characters)
        clean_name = "".join(c for c in name if c.isalnum() or c in (' ', '-', '_')).strip()
        clean_name = clean_name.replace(' ', '-')
        
        return clean_name, version
    except FileNotFoundError:
        print("Error: manifest.json not found in current directory")
        sys.exit(1)
    except json.JSONDecodeError:
        print("Error: Invalid JSON in manifest.json")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading manifest.json: {e}")
        sys.exit(1)

def should_exclude(file_path):
    """Check if a file or directory should be excluded from the archive."""
    path_parts = Path(file_path).parts
    
    # Exclude patterns
    exclude_patterns = [
        '.git',
        '.gitignore',
        'package.py',
        '__pycache__',
        '.DS_Store',
        'Thumbs.db',
        '.vscode',
        '.idea',
        'node_modules'
    ]
    
    # Check if any part of the path matches exclude patterns
    for part in path_parts:
        if part in exclude_patterns or part.startswith('.git'):
            return True
    
    # Exclude Python files (except those that might be part of the extension)
    if file_path.endswith('.py') and 'package.py' in file_path:
        return True
        
    return False

def create_extension_archive():
    """Create ZIP archive of the Chrome extension."""
    try:
        # Get extension info from manifest
        name, version = get_manifest_info()
        
        # Create archive filename
        archive_name = f"{name}-{version}.zip"
        
        print(f"Creating archive: {archive_name}")
        
        # Get current directory
        current_dir = Path.cwd()
        
        # Create ZIP file
        with zipfile.ZipFile(archive_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            file_count = 0
            
            # Walk through all files and directories
            for root, dirs, files in os.walk('.'):
                # Remove excluded directories from dirs list to prevent traversal
                dirs[:] = [d for d in dirs if not should_exclude(os.path.join(root, d))]
                
                for file in files:
                    file_path = os.path.join(root, file)
                    
                    # Skip excluded files
                    if should_exclude(file_path):
                        continue
                    
                    # Add file to archive (remove leading ./ or .\)
                    archive_path = file_path
                    if archive_path.startswith('./') or archive_path.startswith('.\\'):
                        archive_path = archive_path[2:]
                    
                    zipf.write(file_path, archive_path)
                    file_count += 1
                    print(f"Added: {archive_path}")
            
            print(f"\nArchive created successfully!")
            print(f"Files included: {file_count}")
            print(f"Archive size: {os.path.getsize(archive_name)} bytes")
            
    except Exception as e:
        print(f"Error creating archive: {e}")
        sys.exit(1)

if __name__ == "__main__":
    print("Chrome Extension Packager")
    print("=" * 40)
    
    # Check if manifest.json exists
    if not os.path.exists('manifest.json'):
        print("Error: manifest.json not found in current directory")
        print("Please run this script from the extension's root directory")
        sys.exit(1)
    
    create_extension_archive()