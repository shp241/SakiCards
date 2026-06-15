#!/usr/bin/env python3
"""Convert cleaned QA new JSON to characters_skills.js and diff with old version"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)

with open(os.path.join(HERE, 'characters_qa_new_clean.json')) as f:
    data = json.load(f)

# Card image name mapping
card_map = {
    '爱丝琳·威夏尔特': 'Aislinn_Wishart',
    '天江衣': 'Amae_Koromo',
    '姊带丰音': 'Anetai_Toyone',
    '荒川憩': 'Arakawa_Kei',
    '爱宕洋榎': 'Atago_Hiroe',
    '爱宕绢惠': 'Atago_Kinue',
    '新子憧': 'Atarashi_Ako',
    '瑟蕾丝缇娅·罗登贝克': 'Celestia_Ludenberg',
    '雀明华': 'Choe_Myeonghwa',
    '爱蜜莉雅': 'Emilia',
    '江崎仁美': 'Ezaki_Hitomi',
    '福路美穗子': 'Fukuji_Mihoko',
    '花田煌': 'Hanada_Kirame',
    '郝慧宇': 'Hao_Huiyu',
    '原村和': 'Haramura_Nodoka',
    '弘世堇': 'Hirose_Sumire',
    '星野爱': 'Hoshino_Ai',
    '一姬': 'Ichihime',
    '池田华菜': 'Ikeda_Kana',
    '井上纯': 'Inoue_Jun',
    '岩馆摇杏': 'Iwadate_Yuan',
    '石户霞': 'Iwato_Kasumi',
    '和泉纱雾': 'Izumi_Sagiri',
    '神代小莳': 'Jindai_Komaki',
    '戒能良子': 'Kainou_Yoshiko',
    '加治木由美': 'Kajiki_Yumi',
    '鹿仓胡桃': 'Kakura_Kurumi',
    '蒲原智美': 'Kanbara_Satomi',
    '狩宿巴': 'Karijuku_Tomoe',
    '片冈优希': 'Kataoka_Yuuki',
    '小走八重': 'Kobashiri_Yae',
    '小濑川白望': 'Kosegawa_Shiromi',
    '国广一': 'Kunihiro_Hajime',
    '真濑由子': 'Mase_Yuuko',
    '亦野诚子': 'Matano_Seiko',
    '松实玄': 'Matsumi_Kuro',
    '松实宥': 'Matsumi_Yuu',
    '真屋由晖子': 'Maya_Yukiko',
    '梅根·戴文': 'Megan_Davin',
    '御坂美琴': 'Misaka_Mikoto',
    '宫永咲': 'Miyanaga_Saki',
    '宫永照': 'Miyanaga_Teru',
    '南浦数绘': 'Nanpo_Kazue',
    '涅莉·薇萨拉兹': 'Nelly_Virsaladze',
    '园城寺怜': 'Onjouji_Toki',
    '大星淡': 'Oohoshi_Awai',
    '龙门渕透华': 'Ryuumonbuchi_Touka',
    '鹭森灼': 'Sagimori_Arata',
    '泽村智纪': 'Sawamura_Tomoki',
    '希儿·芙乐艾': 'Seele_Vollerei',
    '妹尾佳织': 'Senoo_Kaori',
    '涩谷尧深': 'Shibuya_Takami',
    '清水谷龙华': 'Shimizudani_Ryuuka',
    '白水哩': 'Shiratsuki_Shino',
    '白筑慕': 'Shirouzu_Mairu',
    '狮子原爽': 'Shishihara_Sawaya',
    '染谷真子': 'Someya_Mako',
    '春日野穹': 'Sora_Kasugano',
    '末原恭子': 'Suehara_Kyouko',
    '高鸭稳乃': 'Takakamo_Shizuno',
    '小鸟游六花': 'Takanashi_Rikka',
    '竹井久': 'Takei_Hisa',
    '泷见春': 'Takimi_Haru',
    '时崎狂三': 'Tokisaki_Kurumi',
    '东横桃子': 'Touyouko_Momoko',
    '辻垣内智叶': 'Tsujigaito_Satoha',
    '鹤田姬子': 'Tsuruta_Himeko',
    '上重漫': 'Ueshige_Suzu',
    '臼泽塞': 'Usuzawa_Sae',
    '薄墨初美': 'Usuzumi_Hatsumi',
    '梦乃真帆': 'Yumeno_Maho',
    '瑞原早璃': 'Mizuhara_Hayari',
    '江口夕': 'Eguchi_Sera',
    '小锻治健夜': 'Kokaji_Sukoya',
    '本内成香': 'Motouchi_Naruka',
    '桧森誓子': 'Himori_Chikako',
}

extra_map = {
    '瑟蕾丝缇娅·罗登贝克': 'Celestia_Ludenberg',
}

def get_card(name):
    if name in extra_map:
        return extra_map[name] + '.png'
    if name in card_map:
        return card_map[name] + '.png'
    clean = name.replace(' ', '').replace('\u00b7', '').strip()
    if clean in card_map:
        return card_map[clean] + '.png'
    return None

def get_id(name, i):
    if name in extra_map:
        return extra_map[name]
    if name in card_map:
        return card_map[name]
    clean = name.replace(' ', '').replace('\u00b7', '').strip()
    if clean in card_map:
        return card_map[clean]
    return 'char_' + str(i + 1).zfill(2)

# Generate JS
lines = []
lines.append('/**')
lines.append(' * 超能力麻将角色技能数据（v1.10）')
lines.append(' * 基于 SakiCard 界限突破版 QA v1.10')
lines.append(' * 提取日期：2026-06-07')
lines.append(' * 共 66 名基本角色 + 10 名联动角色 = 76 名角色')
lines.append(' */')
lines.append('')
lines.append('const characters = [')
lines.append('')

for i, c in enumerate(data):
    name = c['name']
    char_id = get_id(name, i)
    card = get_card(name)
    
    lines.append('  {')
    lines.append(f'    id: \'{char_id}\',')
    lines.append(f'    name: \'{name}\',')
    if card:
        lines.append(f'    card: \'{card}\',')
    else:
        lines.append(f'    card: null,  // TODO')
    lines.append('    skills: [')
    
    for skill in c['skills']:
        skill_escaped = skill.replace('\\', '\\\\').replace('\'', '\\\'')
        lines.append(f'      \'{skill_escaped}\',')
    
    lines.append('    ],')
    lines.append('  },')
    lines.append('')

lines.append('];')
lines.append('')
lines.append('if (typeof module !== \'undefined\' && module.exports) {')
lines.append('  module.exports = characters;')
lines.append('}')

output = '\n'.join(lines)
out_path = os.path.join(PROJECT, 'src', 'skill', 'characters_skills.js')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(output)

print(f'Generated: {out_path}')
print(f'Total: {len(data)} characters, {sum(len(c["skills"]) for c in data)} skills')

# --- COMPARE WITH OLD VERSION ---
print('\n=== 版本差异对比 ===')
print('v1.9 -> v1.10')

# We saved the old data from the previous run
old_json_path = os.path.join(HERE, 'characters_skills.json')
if os.path.exists(old_json_path):
    with open(old_json_path) as f:
        old_data = json.load(f)
    
    old_names = {c['name']: c for c in old_data}
    new_names = {c['name']: c for c in data}
    
    # New characters
    new_chars = set(new_names.keys()) - set(old_names.keys())
    removed_chars = set(old_names.keys()) - set(new_names.keys())
    
    if new_chars:
        print(f'\n新增角色 ({len(new_chars)}):')
        for name in new_chars:
            print(f'  + {name} ({len(new_names[name]["skills"])} skills)')
    
    if removed_chars:
        print(f'\n移除角色 ({len(removed_chars)}):')
        for name in removed_chars:
            print(f'  - {name}')
    
    # Changed skills
    common = set(old_names.keys()) & set(new_names.keys())
    changed = []
    for name in sorted(common):
        old_skills = [s.replace(' ', '').replace('\u3000', '') for s in old_names[name]['skills']]
        new_skills = new_names[name]['skills']
        if old_skills != new_skills:
            changed.append(name)
    
    if changed:
        print(f'\n技能变更角色 ({len(changed)}):')
        for name in changed:
            old_s = [s.replace(' ', '').replace('\u3000', '') for s in old_names[name]['skills']]
            new_s = new_names[name]['skills']
            if len(old_s) != len(new_s):
                print(f'  ~ {name}: {len(old_s)} -> {len(new_s)} skills (数量变化)')
            else:
                for j, (o, n) in enumerate(zip(old_s, new_s)):
                    if o != n:
                        print(f'  ~ {name}[{j+1}] 文本差异')
                        print(f'    旧: {o[:100]}')
                        print(f'    新: {n[:100]}')
                        break
    
    unchanged = len(common) - len(changed)
    print(f'\n未变更角色: {unchanged}')
