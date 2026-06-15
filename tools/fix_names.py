import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(HERE, 'characters_qa_new_clean.json')) as f:
    data = json.load(f)

# Fix name spacing issues from PDF
fixes = {
    '爱丝琳 ·威夏尔特': '爱丝琳·威夏尔特',
}

for c in data:
    if c['name'] in fixes:
        print(f"Fix: {c['name']} -> {fixes[c['name']]}")
        c['name'] = fixes[c['name']]

# Verify no names have weird spaces before middle dots
for c in data:
    if ' ·' in c['name']:
        print(f"WARNING: {c['name']} still has space before dot")

with open(os.path.join(HERE, 'characters_qa_new_clean.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("Done")
