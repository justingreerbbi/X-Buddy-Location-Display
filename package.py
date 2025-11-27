#!/usr/bin/env python3
"""
Browser Extension Packager
Creates ZIP archives of browser extensions with proper naming and exclusions.
Supports multiple browser types (Chrome, Firefox, etc.)

Usage:
    python package.py                    # Package all browser extensions (chrome, firefox)
    python package.py --browser chrome   # Package Chrome extension only
    python package.py --browser firefox  # Package Firefox extension only

The script expects extension files to be organized in subdirectories by browser type:
- chrome/ for Chrome extensions
- firefox/ for Firefox extensions
- etc.

ZIP files are created within their respective browser directories.
"""

import os
import json
import zipfile
import sys
import argparse
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

def create_extension_archive(browser):
    """Create ZIP archive of the extension for the specified browser."""
    try:
        # Change to browser directory
        browser_path = Path(browser)
        if not browser_path.exists():
            print(f"Error: Browser directory '{browser}' not found")
            sys.exit(1)
        
        os.chdir(browser_path)
        
        # Get extension info from manifest
        name, version = get_manifest_info()
        
        # Go back to parent directory
        os.chdir("..")
        
        # Create browser directory if not exists
        os.makedirs(browser, exist_ok=True)
        
        # Create archive filename with browser prefix
        archive_name = f"{browser}/{name}-{version}.zip"
        
        print(f"Creating {browser} extension archive: {archive_name}")
        
        # Change back to browser directory for packaging
        os.chdir(browser_path)
        
        # Create ZIP file
        with zipfile.ZipFile(f"../{archive_name}", 'w', zipfile.ZIP_DEFLATED) as zipf:
            file_count = 0
            
            # Walk through all files and directories in browser directory
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
        
        # Go back to parent
        os.chdir("..")
            
        print(f"\nArchive created successfully!")
        print(f"Files included: {file_count}")
        print(f"Archive size: {os.path.getsize(archive_name)} bytes")
        print(f"Archive location: {archive_name}")
            
    except Exception as e:
        print(f"Error creating archive: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Package browser extensions")
    parser.add_argument("--browser", "-b", 
                       help="Browser type (chrome, firefox, etc.). If not specified, packages all available browsers.")
    args = parser.parse_args()
    
    print("Browser Extension Packager")
    print("=" * 40)
    
    if args.browser:
        # Package specific browser
        browser = args.browser
        browser_path = Path(browser)
        manifest_path = browser_path / 'manifest.json'
        if not browser_path.exists():
            print(f"Error: Browser directory '{browser}' not found")
            sys.exit(1)
        if not manifest_path.exists():
            print(f"Error: manifest.json not found in '{browser}' directory")
            print("Please ensure the extension files are in the correct browser subdirectory")
            sys.exit(1)
        
        create_extension_archive(browser)
    else:
        # Package all available browsers
        available_browsers = ['chrome', 'firefox']
        packaged_count = 0
        
        for browser in available_browsers:
            browser_path = Path(browser)
            manifest_path = browser_path / 'manifest.json'
            if browser_path.exists() and manifest_path.exists():
                print(f"\n--- Packaging {browser} extension ---")
                create_extension_archive(browser)
                packaged_count += 1
            else:
                print(f"Skipping {browser}: directory or manifest not found")
        
        if packaged_count == 0:
            print("Error: No valid browser extensions found to package")
            sys.exit(1)
        
        print(f"\nSuccessfully packaged {packaged_count} browser extension(s)")