
import os

file_path = 'f:/Google Antigravity/viral-channel-finder/index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
found_start = False
found_end = False

for line in lines:
    if '<!-- Video Search Tab -->' in line:
        skip = True
        found_start = True
        continue
    
    if skip and '<!-- Properly End of Video Search Tab -->' in line:
        skip = False
        found_end = True
        # Read the closing div line itself? The marker is: </div> <!-- Properly End of Video Search Tab -->
        # So we skip this line too.
        continue
    
    if skip:
        continue
        
    # Modify the HOT Channel Finder line to remove 'hidden'
    if 'id="content-channel-finder"' in line and 'hidden' in line:
        line = line.replace(' hidden', '')
        
    new_lines.append(line)

if found_start and found_end:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Successfully removed Video Search content.")
else:
    print(f"Could not find markers. Start: {found_start}, End: {found_end}")
