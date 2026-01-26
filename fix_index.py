#!/usr/bin/env python3
"""
Script to remove corrupted lines 7620-7816 from index.html
"""

# Read the file
with open(r'd:\Google Antigravity\소재추출기\index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines before: {len(lines)}")
print(f"Line 7619: {lines[7618][:80]}")  # 0-indexed
print(f"Line 7620: {lines[7619][:80]}")
print(f"Line 7816: {lines[7815][:80]}")
print(f"Line 7817: {lines[7816][:80]}")

# Remove lines 7620-7816 (indices 7619-7815 in 0-indexed)
new_lines = lines[:7619] + lines[7816:]

print(f"\nTotal lines after: {len(new_lines)}")

# Write back
with open(r'd:\Google Antigravity\소재추출기\index.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Done! Removed lines 7620-7816")
