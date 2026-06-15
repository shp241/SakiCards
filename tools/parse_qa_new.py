#!/usr/bin/env python3
"""Parse QA新.pdf text -> characters_skills.js (v1.10)"""
import re, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)

with open('/tmp/skills_qa_new.txt', 'r') as f:
    lines = f.readlines()

# Find character section
started = False
in_basic = False
in_crossover = False
current_name = None
current_lines = []
characters = []

for line in lines:
    s = line.strip()
    
    # Detect section start
    if '二、' in s and '角色技能' in s:
        started = True
        continue
    if not started:
        continue
    
    # Detect subsection
    if '(一)' in s and '基本角色' in s:
        in_basic = True
        in_crossover = False
        continue
    if '(二)' in s and '联动角色' in s:
        in_basic = False
        in_crossover = True
        continue
    
    # Detect end of character section
    if '罚则' in s and not (in_basic or in_crossover):
        break
    
    if not (in_basic or in_crossover):
        continue
    if not s:
        continue
    
    # Character header: "1. Name" pattern
    m = re.match(r'^(\d+)\.\s+(.+)', s)
    if m and len(m.group(2)) < 25:
        # Save previous character
        if current_name and current_lines:
            characters.append({'name': current_name, 'lines': current_lines})
        current_name = m.group(2).strip()
        current_lines = []
    elif current_name:
        current_lines.append(s)

# Save last character
if current_name and current_lines:
    characters.append({'name': current_name, 'lines': current_lines})

print(f"Found {len(characters)} character blocks")

# Extract skills from each character
def extract_skills(char_lines):
    skills = []
    current_skill_lines = []
    in_skill = False
    
    for line in char_lines:
        s = line.strip()
        
        # QA markers - save current skill and skip QA
        if s.startswith('\u25cb') or s.startswith('\u25b3'):
            if in_skill and current_skill_lines:
                skill_text = ' '.join(current_skill_lines)
                skill_text = re.sub(r'^[①②③④⑤⑥⑦⑧⑨⑩]\s*', '', skill_text).strip()
                if skill_text:
                    skills.append(skill_text)
                current_skill_lines = []
                in_skill = False
            continue
        
        # New skill start (①-⑩)
        if re.match(r'^[①②③④⑤⑥⑦⑧⑨⑩]', s):
            if in_skill and current_skill_lines:
                skill_text = ' '.join(current_skill_lines)
                skill_text = re.sub(r'^[①②③④⑤⑥⑦⑧⑨⑩]\s*', '', skill_text).strip()
                if skill_text:
                    skills.append(skill_text)
            current_skill_lines = [s]
            in_skill = True
        elif in_skill:
            current_skill_lines.append(s)
    
    # Save last skill
    if in_skill and current_skill_lines:
        skill_text = ' '.join(current_skill_lines)
        skill_text = re.sub(r'^[①②③④⑤⑥⑦⑧⑨⑩]\s*', '', skill_text).strip()
        if skill_text:
            skills.append(skill_text)
    
    return skills

# Process all characters
chars_data = []
for c in characters:
    skills = extract_skills(c['lines'])
    if skills:
        # Remove ALL spaces and Chinese spaces
        skills = [s.replace(' ', '').replace('\u3000', '') for s in skills]
        chars_data.append({'name': c['name'], 'skills': skills})

for c in chars_data:
    print(f"  {c['name']}: {len(c['skills'])} skills")
    for i, s in enumerate(c['skills']):
        print(f"    [{i+1}] {s[:100]}...")

print(f"\nTotal: {len(chars_data)} characters")

# Save JSON
json_path = os.path.join(HERE, 'characters_qa_new.json')
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(chars_data, f, ensure_ascii=False, indent=2)
print(f"JSON saved to {json_path}")
