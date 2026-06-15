#!/usr/bin/env python3
"""Convert fixed JSON to characters_skills.js"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)

with open(os.path.join(HERE, 'characters_skills.json')) as f:
    data = json.load(f)

# Name to card image mapping (from resources/cards/)
card_map = {
    '爱丝琳·威夏尔特': 'Aislinn_Wishart',
    '天江衣': 'Amae_Koromo',
    '姊带丰音': 'Anetai_Toyone',
    '荒川憩': 'Arakawa_Kei',
    '爱宕洋榎': 'Atago_Hiroe',
    '爱宕绢惠': 'Atago_Kinue',
    '新子憧': 'Atarashi_Ako',
    '瑟蕾丝缇娅·卢登贝格': 'Celestia_Ludenberg',
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
    '白筑慕': 'Shirouzu_Mairu',  # Note: card is Shirouzu_Mairu.png
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
}

# Additional mappings not in main card_map
extra_map = {
    '瑞原早璃': 'Mizuhara_Hayari',
    '瑟蕾丝缇娅 ·卢登贝格': 'Celestia_Ludenberg',  # PDF parsed with space
}

# Generate card filename
def get_card(name):
    if name in extra_map:
        return extra_map[name] + '.png'
    if name in card_map:
        return card_map[name] + '.png'
    # Try cleaned name (remove spaces, middle dot)
    clean = name.replace(' ', '').replace('\u00b7', '').strip()
    if clean in card_map:
        return card_map[clean] + '.png'
    return None

# Generate JavaScript
lines = []
lines.append('/**')
lines.append(' * 超能力麻将角色技能数据')
lines.append(' * 基于 SakiCard 界限突破版 v1.9')
lines.append(' * 来源：技能QA.pdf + 中文版规则书.docx')
lines.append(' * 自动提取日期：2026-06-07')
lines.append(' * ')
lines.append(' * 共收录 64 名基本角色 + 10 名联动角色 = 74 名角色')
lines.append(' * ')
lines.append(' * 格式说明：')
lines.append(' *   - id: 角色唯一标识（英文/拼音）')
lines.append(' *   - name: 角色中文名')
lines.append(' *   - card: 卡图文件名（resources/cards/ 下的文件名）')
lines.append(' *   - skills: 技能数组，每个技能包含 description（技能描述文本）')
lines.append(' */')
lines.append('')
lines.append('const characters = [')

for i, c in enumerate(data):
    name = c['name']
    # Generate ID
    import re
    if name in extra_map:
        char_id = extra_map[name]
    elif name in card_map:
        char_id = card_map[name]
    else:
        # Create pinyin-like ID from Chinese name
        char_id = 'char_' + str(i + 1).zfill(2)
    
    card = get_card(name)
    
    lines.append('  {')
    if card:
        lines.append(f'    id: \'{char_id}\',')
    else:
        lines.append(f'    id: \'{char_id}\',  // TODO: 需要补充卡图')
    lines.append(f'    name: \'{name}\',')
    if card:
        lines.append(f'    card: \'{card}\',')
    else:
        lines.append(f'    card: null,  // TODO: 待补充')
    lines.append('    skills: [')
    
    for j, skill in enumerate(c['skills']):
        # Clean up skill text
        skill = skill.strip()
        # Escape any single quotes
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
lines.append('')

output = '\n'.join(lines)
out_path = os.path.join(PROJECT, 'src', 'skill', 'characters_skills.js')
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(output)

print(f'Generated: {out_path}')
total_skills = sum(len(c['skills']) for c in data)
print(f'Total: {len(data)} characters, {total_skills} skills')
