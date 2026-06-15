#!/usr/bin/env python3
"""Clean up parsed QA data and convert to characters_skills.js"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)

with open(os.path.join(HERE, 'characters_qa_new.json')) as f:
    data = json.load(f)

# Remove 罚则 entries and other false characters
stop_names = ['诈立', '诈和', '误发声', '当局情况']
data = [c for c in data if c['name'].split(':')[0].strip() not in stop_names and c['name'].strip() not in stop_names]

# Filter out short/QA-artifact skills (less than 10 chars are likely artifacts)
for c in data:
    c['skills'] = [s for s in c['skills'] if len(s) >= 10]

# Clean specific known issues
for c in data:
    # Fix 蒲原智美 - remove "的效果可叠加" from QA
    if '蒲原智美' in c['name']:
        c['skills'] = [s for s in c['skills'] if '叠加' not in s]
    
    # Fix 白水哩 - keep full skill ②
    if '白水哩' in c['name']:
        # Skill ② should contain both sub-skills
        pass  # Already correctly parsed

    # Fix 瑟蕾丝缇娅 name (remove space before ·)
    if '瑟蕾丝缇娅' in c['name']:
        c['name'] = c['name'].replace(' ·', '·')

# Print summary
for i, c in enumerate(data):
    print(f"  {i+1}. {c['name']} - {len(c['skills'])} skills")
    for j, s in enumerate(c['skills']):
        print(f"    [{j+1}] {s[:120]}")

print(f"\nTotal: {len(data)} characters")
total_skills = sum(len(c['skills']) for c in data)
print(f"Total skills: {total_skills}")

# Save cleaned JSON
json_path = os.path.join(HERE, 'characters_qa_new_clean.json')
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"Cleaned JSON saved to {json_path}")
