#!/usr/bin/env python3
"""Fix JSON parsing issues and convert to characters.js"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(HERE, 'characters_skills.json')) as f:
    data = json.load(f)

# Fix: merge "你和牌番数高于X时,视为X," back into 白水哩
for i, c in enumerate(data):
    if c['name'] == '白水哩':
        next_c = data[i+1]
        if '你和牌番数' in next_c['name']:
            sub_desc = next_c['name'] + next_c['skills'][0]
            c['skills'].append(sub_desc)
            data.pop(i+1)
        break

# Fix 臼泽塞 skill 4 (junk artifact)
for c in data:
    if c['name'] == '臼泽塞':
        c['skills'] = [s for s in c['skills'] if len(s) > 10]
        break

# Fix 春日野穹 skill 4 (QA artifact)
for c in data:
    if '春日野穹' in c['name']:
        c['skills'] = [s for s in c['skills'] if '暂时失效' not in s]
        break

print(f"Fixed: {len(data)} characters")
for i, c in enumerate(data):
    print(f"  {i+1}. {c['name']} - {len(c['skills'])} skills")

# Save the fixed JSON
with open(os.path.join(HERE, 'characters_skills.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("Fixed JSON saved")
