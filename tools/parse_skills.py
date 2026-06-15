#!/usr/bin/env python3
"""Parse the skill QA PDF text and extract character skills."""
import re, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PDF_TXT = '/tmp/skills_pdf.txt'

with open(PDF_TXT, 'r') as f:
    lines = f.readlines()

in_chars = False
in_crossover = False
current_name = None
current_lines = []
all_chars = []

for line in lines:
    s = line.strip()
    if '二.角色技能 Q&A' in s:
        in_chars = True
        continue
    if '三.一些额外的机制' in s:
        in_chars = False
        continue
    if '联动角色技能 Q&A' in s:
        in_crossover = True
        continue
    if '七.罚则' in s or '五.狮子原爽 Q&A' in s or '四.梦乃真帆 Q&A' in s:
        in_crossover = False
        in_chars = False
        continue
    if not (in_chars or in_crossover) or not s:
        continue
    
    # Check for character header: "1.Name" pattern
    m = re.match(r'^(\d+)\.([^\d]+)$', s)
    if m and len(m.group(2).strip()) < 20:
        # Save previous
        if current_name and current_lines:
            all_chars.append({'name': current_name, 'lines': current_lines})
        current_name = m.group(2).strip()
        current_lines = []
    elif current_name:
        current_lines.append(s)

if current_name and current_lines:
    all_chars.append({'name': current_name, 'lines': current_lines})

# Now extract skills from each character's lines
def extract_skills(char_lines):
    skills = []
    current_skill_lines = []
    in_skill = False
    
    for line in char_lines:
        # QA markers - stop collecting current skill
        if line.strip().startswith('\u25cb') or line.strip().startswith('\u25b3'):
            if in_skill and current_skill_lines:
                skill_text = ' '.join(current_skill_lines)
                skill_text = re.sub(r'^[①②③④⑤⑥⑦⑧⑨⑩] *', '', skill_text).strip()
                if skill_text:
                    skills.append(skill_text)
                current_skill_lines = []
                in_skill = False
            continue
        
        # Skill start
        m = re.match(r'^[①②③④⑤⑥⑦⑧⑨⑩]', line.strip())
        if m:
            if in_skill and current_skill_lines:
                skill_text = ' '.join(current_skill_lines)
                skill_text = re.sub(r'^[①②③④⑤⑥⑦⑧⑨⑩] *', '', skill_text).strip()
                if skill_text:
                    skills.append(skill_text)
            current_skill_lines = [line.strip()]
            in_skill = True
        elif in_skill:
            current_skill_lines.append(line.strip())
    
    # Save last skill
    if in_skill and current_skill_lines:
        skill_text = ' '.join(current_skill_lines)
        skill_text = re.sub(r'^[①②③④⑤⑥⑦⑧⑨⑩] *', '', skill_text).strip()
        if skill_text:
            skills.append(skill_text)
    
    return skills

# Process all characters
chars_data = []
for c in all_chars:
    skills = extract_skills(c['lines'])
    if skills:
        chars_data.append({
            'name': c['name'],
            'skills': skills
        })

# Output as Markdown for now
for c in chars_data:
    print(f"## {c['name']}")
    for i, s in enumerate(c['skills']):
        print(f"  [{i+1}] {s}")
    print()

print(f"\nTotal: {len(chars_data)} characters")
# Also save JSON
with open(os.path.join(HERE, 'characters_skills.json'), 'w', encoding='utf-8') as f:
    json.dump(chars_data, f, ensure_ascii=False, indent=2)
print(f"JSON saved to {os.path.join(HERE, 'characters_skills.json')}")
