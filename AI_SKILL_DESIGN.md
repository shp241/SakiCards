# AI 与技能系统交互设计

## 一、目标

让 AI 能感知场上所有角色的技能，据此修改对**牌的价值判断**（paijia）、**危险度评估**（weixian）、**手牌期望值**（eval_shoupai）和**向听数计算**（xiangting），使 AI 的行为能匹配不同技能的博弈环境。

---

## 二、交互架构

```
                    ┌─────────────────────┐
                    │   SkillManager      │
                    │  (skill/index.js)   │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │  AiSkillModifier    │  ← 新增桥梁文件
                    │  (ai/skill-mod.js)  │
                    └─────────┬───────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    ┌─────▼─────┐      ┌─────▼─────┐      ┌─────▼─────┐
    │  paijia   │      │ eval_    │      │ suan_    │
    │  (牌价值)  │      │ shoupai  │      │ weixian  │
    └───────────┘      │ (手牌期望) │      │ (危险度)  │
                       └───────────┘      └───────────┘
```

`AiSkillModifier` 是 AI 和技能系统的唯一桥梁，内部维护每个玩家 ID 对应的**修改器链表**。AI 的评估函数在执行时通过这个桥梁获取修改后的值。

---

## 三、技能如何修改 AI 评估

### 3.1 技能效果到 AI 修改器的映射

每个技能可声明一个 `aiModifier` 对象，由 `AiSkillModifier` 在查询时收集：

```javascript
// 示例：狮子原爽 — 宝牌相关
{
    aiModifier: {
        // 牌价值修改器：宝牌指示牌相邻牌价值 ×2
        modifyPaijia: (p, basePaijia, context) => {
            if (context.isDoraAdjacent(p)) return basePaijia * 2;
            return basePaijia;
        },
        // 危险度修改器：自己立直时低估对手危险度
        modifyWeixian: (p, baseWeixian, context) => {
            if (context.selfRiichi) return baseWeixian * 0.7;
            return baseWeixian;
        }
    }
}
```

### 3.2 AI 评估函数需修改的位置

| AI 函数 | 文件 | 技能介入点 | 效果 |
|---------|------|-----------|------|
| `paijia(p)` | `suanpai.js:137` | 牌价值计算完成后 | `MODIFY_TILE_VALUE` |
| `suan_weixian(p,l)` | `suanpai.js:214` | 危险度计算完成后 | `MODIFY_DANGER` |
| `make_paijia(shoupai)` | `suanpai.js:188` | 手牌结构系数 | `MODIFY_HAND_STRUCTURE` |
| `eval_shoupai()` | `player.js:528` | 手牌期望值 | `MODIFY_EXPECTED_SCORE` |
| `xiangting()` | `player.js:404` | 向听数计算 | `MODIFY_XIANGTING` |
| `get_defen()` | `player.js:507` | 和了打点 | `MODIFY_HULE_SCORE` |
| `select_dapai()` | `player.js:284` | 立直/安全判断 | `MODIFY_RIICHI_PUSH` |
| `select_fulou()` | `player.js:129` | 吃碰收益判断 | `MODIFY_FULOU_VALUE` |

---

## 四、实现方案

### 4.1 新增文件：`src/ai/skill-mod.js` — AiSkillModifier

```javascript
class AiSkillModifier {
    constructor(skillManager) {
        this._sm = skillManager;
        this._cache = {}; // { playerIdx: 修改器链 }
    }

    /**
     * 查询影响 playerIdx 的所有技能修改器
     * @returns {Object} { modifyPaijia: Function[], modifyWeixian: Function[], ... }
     */
    getModifiers(playerIdx) {
        if (this._cache[playerIdx]) return this._cache[playerIdx];

        let modifiers = {
            modifyPaijia:     [],
            modifyWeixian:    [],
            modifyHandValue:  [],
            modifyExpected:   [],
            modifyXiangting:  [],
            modifyHuleScore:  [],
            modifyRiichiPush: [],
        };

        if (!this._sm || !this._sm._enabled) {
            this._cache[playerIdx] = modifiers;
            return modifiers;
        }

        let charId = this._sm.getCharacterId(playerIdx);
        if (!charId) {
            this._cache[playerIdx] = modifiers;
            return modifiers;
        }

        let skills = this._sm.getActiveSkills(playerIdx);
        for (let s of skills) {
            if (s.sealed) continue;
            let mod = s._aiModifier;  // 由 SKILL_EXECUTE_MAP 填充
            if (!mod) continue;
            for (let key of Object.keys(modifiers)) {
                if (mod[key]) modifiers[key].push(mod[key]);
            }
        }

        this._cache[playerIdx] = modifiers;
        return modifiers;
    }

    /** 使缓存失效（半庄切换时调用） */
    invalidate() { this._cache = {}; }

    // ---- 便捷方法 ----

    /** 修改牌价值：依次调用所有 modifyPaijia 链 */
    applyPaijia(p, baseValue, context) {
        let v = baseValue;
        for (let fn of this.getModifiers(context.selfPlayerIdx).modifyPaijia) {
            v = fn(p, v, context);
        }
        return v;
    }

    /** 修改危险度 */
    applyWeixian(p, l, baseValue, context) {
        let v = baseValue;
        for (let fn of this.getModifiers(context.selfPlayerIdx).modifyWeixian) {
            v = fn(p, l, v, context);
        }
        return v;
    }

    /** 修改手牌整体期望值 */
    applyExpected(baseValue, context) { /* ... */ }

    /** 修改向听数 */
    applyXiangting(baseValue, context) { /* ... */ }

    /** 修改和了打点 */
    applyHuleScore(baseValue, context) { /* ... */ }
}
```

### 4.2 修改 `suanpai.js`

在 `paijia()` 末尾加入：

```javascript
// paijia(p) 的 return 前
if (this._skillMod) {
    rv = this._skillMod.applyPaijia(p, rv, {
        selfPlayerIdx: this._playerIdx,
        isDoraAdjacent: (p) => {
            for (let bp of this._baopai) {
                if (Majiang.Shan.zhenbaopai(bp) === s + n) return true;
            }
            return false;
        },
    });
}
```

在 `suan_weixian()` 末尾加入：

```javascript
if (this._skillMod) {
    r = this._skillMod.applyWeixian(p, l, r, {
        selfPlayerIdx: this._playerIdx,
        targetPlayer: l,
        selfRiichi: this._lizhi[this._playerIdx],
    });
}
```

### 4.3 修改 `player.js`

在 `eval_shoupai()` 的返回值处加入：

```javascript
// 最后统一应用技能修改
if (this._skillMod) {
    rv = this._skillMod.applyExpected(rv, {
        selfPlayerIdx: this._playerIdx,
        shoupai: shoupai,
        n_xiangting: n_xiangting,
    });
}
```

### 4.4 SuanPai 注入 `_skillMod`

在 Player 的 `qipai()` 中注入：

```javascript
qipai(qipai) {
    this._suanpai = new SuanPai(this._rule['赤牌']);
    if (this._skillMod) {
        this._suanpai._skillMod = this._skillMod;
        this._suanpai._playerIdx = this._id;
    }
    // ...
}
```

### 4.5 Game 中创建 AiSkillModifier

在 `kaiju()` 或 Game 构造函数中：

```javascript
if (this._skillManager) {
    this._aiSkillMod = new AiSkillModifier(this._skillManager);
    for (let l = 0; l < 4; l++) {
        if (this._player[l] && this._player[l]._skillMod !== undefined) {
            this._player[l]._skillMod = this._aiSkillMod;
            this._player[l]._playerIdx = this._player_id
                ? this._player_id[l] : l;
        }
    }
}
```

### 4.6 技能数据注册（SKILL_EXECUTE_MAP 扩展）

每个技能在注册时可声明 `aiModifier`：

```javascript
const SKILL_EXECUTE_MAP = {
    'Shishihara_Shizuku': {
        0: {
            // 原有 execute/condition...
            aiModifier: {
                modifyPaijia(p, v, ctx) {
                    if (ctx.isDoraAdjacent(p)) return v * 2;
                    return v;
                },
                modifyWeixian(p, l, v, ctx) {
                    if (ctx.selfRiichi) return v * 0.7; // 立直后更敢攻
                    return v;
                },
            }
        }
    }
};
```

---

## 五、典型技能映射示例

| 角色 | 技能 | AI 修改 |
|------|------|---------|
| 狮子原爽① | 宝牌指示牌价值翻倍 | `modifyPaijia`: 宝牌相邻牌 ×2 |
| 狮子原爽② | 自己的向听数没有意义（看宝牌数） | `modifyXiangting`: 不依赖牌效，按宝牌数走 |
| 宫永咲① | 岭上开花概率提升 | `modifyFulouValue`: 杠的期望 +50% |
| 天江衣① | 海底捞月 | `modifyExpected`: 巡数靠后时 ↑ |
| 上重漫 | 部分牌移入特殊区不参与牌效 | `modifyHandValue`: 特殊区牌不计入向听 |
| 爱丝琳① | 额外巡 | `modifyExpected`: 一巡当两巡用 |
| 福路美穗子 | 能看到牌山顶牌 | `modifyPaijia`: 已知牌山信息影响摸牌概率 |
| 狩宿巴 | 他家手牌可见 | `modifyWeixian`: 精确知道危险牌，非危险牌安全度提升 |

---

## 六、实施步骤

1. **新建** `src/ai/skill-mod.js` — AiSkillModifier 类
2. **修改** `src/ai/player.js` — 注入 `_skillMod` 和 `_playerIdx`，`qipai()` 中传递给 SuanPai
3. **修改** `src/ai/suanpai.js` — `paijia()` / `suan_weixian()` 末尾调用修改器
4. **修改** `src/ai/player.js` — `eval_shoupai()`、`xiangting()`、`get_defen()` 末尾调用修改器
5. **修改** `src/core/game.js` — `kaiju()` 中创建 AiSkillModifier 并注入给每个 AI Player
6. **修改** `src/skill/skill-registry.js` — `createSkill()` 中保留 `aiModifier` 字段
7. **扩展** `SKILL_EXECUTE_MAP` — 为每个角色的每个技能添加 `aiModifier`（按需逐步填充）

---

## 七、性能考虑

- `getModifiers()` 有缓存，同玩家在同一局内不重复查询
- 修改器函数对每个候选牌都执行，需保持 O(1) 轻量
- 不做深层递归修改（不在 `eval_shoupai` 的递归内再查询技能）
- 半庄切换时清缓存（调用 `invalidate()`）
