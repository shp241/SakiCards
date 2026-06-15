# 天才麻将少女 — 超能力麻将项目文档

## 一、项目概览

基于开源项目「電脳麻将 v2.5.1」改造。技术栈：
- **前端**：jQuery + Pug 模板 + Stylus CSS
- **构建**：Webpack 5（`webpack build.config.js`）
- **后端**：Node.js（网络对战用 ws + express）

### 目录结构

```
src/
  core/           # 核心模型（Game/Shoupai/Shan/He/Rule）
    game.js       # 游戏状态机，所有技能钩子在此
    rule.js       # 默认规则（含超能力扩展字段）
    shan.js       # 牌山（68墩环形模型）
    shoupai.js    # 手牌
    he.js         # 牌河
    hule.js       # 和了判定
    xiangting.js  # 向听数计算
  skill/          # 技能系统（详见第三节）
    index.js              # SkillManager 主入口
    skill-types.js        # 枚举定义
    triggers.js           # 触发时机
    skill-registry.js     # 技能注册表
    character-pool.js     # 角色池管理
    characters_skills.js  # 76名角色数据
    game-settings.js      # 规则配置元数据
    zone-manager.js       # 角色牌区域管理
  ui/             # UI 组件
    character_selector.js # 角色选择弹窗
    board.js              # 对局界面（角色显示+技能浮窗）
    shan_viewer.js        # 牌山可视化窗口
  js/             # 页面逻辑
    index.js      # 主页入口（技能初始化+角色选择流程）
    autoplay.js   # 自动对战
    rule.js       # 规则设置页面
    conf/rule.json # 预设规则
  html/           # 模板
    page/index.pug     # 主页（含主菜单）
    page/rule.pug      # 规则设置
    page/autoplay.pug  # 自动对战
    inc/board.pug      # 对局界面组件（角色显示元素在此）
    inc/rule.pug       # 规则设置表单
  css/            # 样式
    index.styl         # 主页样式
    board.styl         # 对局界面样式
    desktop.styl       # 桌面端定位（角色位置、控制器位置）
    tablet.styl        # 横屏适配（角色位置、技能浮窗）
    character_selector.styl # 角色选择/显示/技能浮窗
resources/
  头像/           # 76张角色头像（ID.png）
  卡图/           # 76张角色卡图
  QA新.pdf        # 技能QA文档
```

### 开发命令

```bash
npm run build    # webpack 构建 → dist/
npm run server   # 启动开发服务器（ws + express）
npm run net      # 启动网络对战服务器
```

构建产物输出到 `dist/`，直接在浏览器打开 `dist/index.html` 即可使用。

---

## 二、Game 游戏状态机与技能钩子

### 对局流程

```
kaiju → qipai → zimo → dapai → ...
                       ↓ (有人荣和/自摸)
                      hule → (next局 或 jieju)
                       ↓ (流局)
                    pingju → (next局 或 jieju)
```

### 所有技能钩子调用点（`src/core/game.js`）

| 方法 | 时机 key | 上下文 | 说明 |
|------|---------|--------|------|
| `zimo()` | `before_draw` | `{ player: lunban }` | 摸牌前（可替换摸牌来源） |
| `zimo()` | `after_draw` | `{ player: lunban, zimo_pai }` | 摸牌后（宫永咲岭上花开等） |
| `dapai()` | `before_discard` | `{ player: lunban, dapai }` | 舍牌前（可改变舍牌） |
| `dapai()` | `after_discard` | `{ player: lunban, dapai }` | 舍牌后 |
| `dapai()` | `river_row_complete` | `{ player: lunban, row }` | 牌河排完成（每6张一行） |
| `fulou()` | `before_fulou` | `{ player: lunban, fulou }` | 副露前 |
| `fulou()` | `after_fulou` | `{ player: lunban, fulou }` | 副露后 |
| `gang()` | `before_kan` | `{ player: lunban, gang }` | 杠前 |
| `gang()` | `after_kan` | `{ player: lunban, gang }` | 杠后 |
| `gangzimo()` | `after_kan` | `{ player: lunban, gang }` | 杠后摸岭上牌 |
| `kaigang()` | `after_kan` | `{ player: lunban }` | 开杠宝牌后 |
| `reply_dapai()` | `after_opponent_discard` | `{ player: lunban, dapai }` | 他家舍牌后（碰杠吃判定前） |
| `hule()` | `before_hule_check` | `{ player, shoupai, rongpai, param }` | 和了判定前（可改变和了条件） |
| `hule()` | `calc_defen` | `{ player, hule, shoupai, rongpai }` | 打点计算时（可加分/翻倍） |
| `hule()` | `after_hule` | `{ player, hule }` | 和牌后 |
| `pingju()` | `on_ryuukyoku` | `{ name, shoupai, fenpei }` | 流局时 |
| `last()` | 直接调用 `onHandEnd()` | — | 局结束，重置局限技能 |
| `jieju()` | `on_jieju` | `{ model }` | 半庄结束 |
| `jieju()` | 直接调用 `onHanchanEnd()` | — | 半庄结束，角色进冷却 |

### Game 与 SkillManager 的交互

```javascript
// index.js 中初始化：
let sm = new SkillManager({ characters, rule });
game.skillManager = sm;  // 通过 ES6 setter 注入 Game

// Game 内部通过 _skill_trigger() 统一调用：
_skill_trigger(timing, context) {
    if (!this._skillManager) return { actions: [], effects: [], modified: false };
    return this._skillManager.trigger(timing, context);
}
```

**返回值**：`{ actions: SkillAction[], effects: Effect[], modified: boolean }`

---

## 三、技能系统架构

### 3.1 SkillManager（`src/skill/index.js`）— 主入口

唯一对外接口，管理角色分配、技能触发、冷却周期。

```
SkillManager
├── CharacterPool   (角色池：分配/冷却)
├── SkillRegistry   (技能注册表：查询/匹配)
├── ZoneManager     (角色牌区域：上重漫的"卯/未"等)
├── _activeCharacters[4]  (当前4玩家的角色)
└── _rule           (当前规则)
```

**主要方法**：

```javascript
// 角色管理
sm.dealCharacters(mode)      // 发牌角色卡，返回 { options[4][], players: 0..3 }
sm.confirmCharacter(pIdx, optIdx) // 玩家确认选择
sm.getCharacter(pIdx)         // 获取角色数据
sm.getCharacterId(pIdx)       // 获取角色ID

// 技能触发（核心）
sm.trigger(timing, context)   // 在指定时机触发所有匹配技能
sm.respondToSkill(pIdx, skillId, choice, context) // 玩家响应技能选择
sm.applyEffectChain(effectType, baseValue, context) // 应用效果链

// 封印/解封
sm.sealSkill(targetPlayer, skillId, until)
sm.unsealSkill(targetPlayer, skillId)
sm.unsealAll(targetPlayer)

// 周期管理
sm.onHandEnd()     // 局结束，重置局限技能
sm.onHanchanEnd()  // 半庄结束，角色进冷却

// 区域查询
sm.getZoneManager()
sm.getZonePublicInfo()
sm.getZonePrivateInfo(pIdx)
```

### 3.2 枚举定义（`src/skill/skill-types.js`）

```javascript
SkillType:    PASSIVE | ACTIVE | CONDITIONAL
UsageType:    ONCE_PER_HAND | ONCE_PER_GAME | PER_RIVER_ROW | 
              ONCE_PER_ITEM | PER_PLAYER | UNLIMITED | CUSTOM
EffectType:   EXTRA_TURN | DRAW_FROM_RIVER | DRAW_FROM_WALL_TOP | 
              DRAW_FROM_DEADWALL | SWAP_TILES | HIDDEN_DISCARD |
              MODIFY_FULOU_RULE | FULOU_FROM_RIVER |
              MODIFY_HULE_CONDITION | VIEW_AS_WIN_TILE | IGNORE_FURITEN |
              ADD_FAN | MULTIPLY_SCORE | MODIFY_YAKU_VALUE | VIEW_AS_YAKU |
              PEEK_WALL | PEEK_DORA | REVEAL_TILES | HIDE_TILES |
              ADD_DORA_INDICATOR | MODIFY_DORA_RULE | REMOVE_DORA_INDICATOR |
              RESTRICT_OPPONENT | CANCEL_ACTION | FORBID_HULE |
              TRANSFORM_TILE | CIRCULAR_SHUNTSU | PAY_FIELD |
              SEAL_SKILL | ZONE_OPERATE | DUEL | KICK_BALL | 
              NUKE_DORA | CHALLENGE | LOCK_MENTSU
AssignmentMode: DRAW_4 | DRAW_2 | DRAFT | RANDOM | FREE
ZoneVisibility: PUBLIC | PRIVATE | HIDDEN | FACE_DOWN
```

### 3.3 触发时机（`src/skill/triggers.js`）

| key | 中文 | 说明 |
|-----|------|------|
| `after_character_assigned` | 角色分配后 | 开局选择完角色时 |
| `after_qipai` | 配牌后 | 初始手牌发完后 |
| `before_first_discard` | 首巡舍牌前 | 第一次舍牌前 |
| `before_draw` | 摸牌前 | 可替换摸牌来源 |
| `after_draw` | 摸牌后 | 宫永咲岭上花开类 |
| `before_discard` | 舍牌前 | 可改变舍牌/暗杠 |
| `after_discard` | 舍牌后 | 舍牌后效果 |
| `after_opponent_discard` | 他家舍牌后 | 碰/杠/吃判定前 |
| `before_kan` | 杠前 | 杠操作前 |
| `after_kan` | 杠后 | 杠操作后（含开杠宝牌） |
| `before_fulou` | 副露前 | 吃碰杠判定前 |
| `after_fulou` | 副露后 | 吃碰杠完成后 |
| `before_riichi` | 立直宣言前 | |
| `after_riichi` | 立直成功后 | |
| `before_hule_check` | 和了判定前 | 可修改和了条件 |
| `calc_defen` | 打点计算时 | 可加分/翻倍 |
| `after_hule` | 和牌后 | |
| `on_ryuukyoku` | 流局时 | |
| `on_jieju` | 半庄结束时 | |
| `river_row_complete` | 牌河排完成时 | 每6张一行时触发 |
| `continuous` | 持续生效 | 被动技能 |

### 3.4 技能注册表（`src/skill/skill-registry.js`）

通过正则匹配描述文本，**自动推断**技能类型。每个技能标准化为：

```javascript
{
    id: 'Miyanaga_Saki_skill_0',  // 唯一ID
    characterId: 'Miyanaga_Saki',
    index: 0,                      // 该角色的第几个技能
    description: '你可以将岭上牌视为你的和牌',
    type: 'conditional',           // PASSIVE | ACTIVE | CONDITIONAL
    trigger: {
        timing: 'before_hule_check',  // 触发时机key
        priority: 100,
        condition: null               // 额外条件函数（null=总是触发）
    },
    effect: {
        type: 'VIEW_AS_WIN_TILE',  // EffectType 枚举
        params: {},                // 效果参数（技能特有）
        execute: null              // 自定义执行函数（可选）
    },
    usage: {
        type: 'once_per_hand',     // UsageType 枚举
        max: 1,
        current: 0                 // 本局已使用次数
    },
    cost: {
        fieldTribut: false,        // 是否需要供托
        points: 0                  // 点数消耗
    },
    sealed: {
        currently: false,          // 是否被封印
        until: null                // 封印截止时机（null=永久）
    },
    state: {
        activated: false,          // 是否已激活
        removable: false,          // 角色是否可移除该牌（用于区域技能）
        data: {}                   // 技能自定义状态数据
    },
    isOptional: true               // 是否可选（vs 强制触发）
}
```

**重要**：当前技能注册表是**骨架实现**——能正确解析技能描述、匹配时机，但 `effect.execute` 为 `null`。**实际技能效果需要后续 Agent 实现**。

### 3.5 角色池（`src/skill/character-pool.js`）

```javascript
deal(players, mode) → dealResult
// 返回: { options: [[charId,..], ..], players: [0,1,2,3] }
// DRAW_4: 每人随机4张
// RANDOM: 每人随机1张，autoConfirmed=true
// DRAFT: 蛇形轮抽（0-1-2-3-3-2-1-0）
// FREE: 全部可选，按dice决定顺序

confirmChoice(playerIndex, characterIndex, dealResult)
// 未选中角色返还池，选中角色从池移除

onHanchanEnd(selectedCharacters)
// 4名角色进入冷却池
```

**联动角色判定**：通过 `collabIds` 硬编码列表区分（`Celestia_Ludenberg`, `Emilia` 等10名）。

### 3.6 角色牌区域（`src/skill/zone-manager.js`）

为特定角色自动创建特殊区域（根据技能描述中的关键词）：

| 关键词 | 角色 | 区域ID | 可见性 |
|--------|------|--------|--------|
| `[卯]` / `[未]` | 上重漫 | `choushi` / `mibi` | PUBLIC |
| `(工口漫)画` | 和泉纱雾 | `ero_manga` | FACE_DOWN |
| `双生` | 希儿 | `double` | FACE_DOWN |
| `四之弹` / `八之弹` | 时崎狂三 | `bullet` | PUBLIC |
| `备牌` / `怜` | 园城寺怜 | `reserve` | FACE_DOWN |
| `兔子玩偶` | 春日野穹 | `doll` | PUBLIC |

### 3.7 规则配置（`src/skill/game-settings.js`）

```javascript
SkillRuleDefaults = {
    '技能模式': '开启',         // '开启' | '关闭' | '仅被动'
    '角色分配方式': 'draw4',    // 'draw4'|'draw2'|'draft'|'random'|'free'
    '角色池限制': '全部可用',   // '全部可用'|'仅基本角色'|'仅联动角色'
    '角色冷却あり': true,       // 是否同一角色多局不能复用
    '追加罰則あり': false,
    '牌河操作あり': true,
    '聴牌残枚計算': '雀魂方式',
};
```

规则设置页面的表单在 `src/html/inc/rule.pug` 第 273-333 行。

---

## 四、角色数据格式（`src/skill/characters_skills.js`）

```javascript
module.exports = [
    {
        id: 'Miyanaga_Saki',         // 英文ID（也是头像/卡图文件名）
        name: '宫永咲',              // 中文名
        card: 'Miyanaga_Saki.png',   // resources/头像/ 下的文件名
        skills: [                    // 技能数组，每项为中文描述字符串
            '你可以将岭上牌视为你的和牌;',
            '你可以将手上的字牌视为西风;',
            '你开杠后可以立即翻开杠宝牌.',
        ],
    },
    // ... 共76名角色
];
```

**头像资源**：`resources/头像/{id}.png`（613×613 圆形裁剪）
**卡图资源**：`resources/卡图/{id}.png`

---

## 五、如何添加新技能效果

当前技能系统已实现：
- 角色选择流程（完全可用）
- 角色显示+技能浮窗（完全可用）
- 区域管理（完全可用）
- 触发时机匹配（完全可用）
- 规则设置UI（完全可用）

**待实现**：`effect.execute` 函数。在 `skill-registry.js` 的 `_parseSkill()` 方法中，需为每种 `EffectType` 编写具体的执行逻辑，然后在 `SkillManager.trigger()` 中调用。

实现新技能效果时需要关注的接口：
- `game._model` — 游戏状态（shoupai/he/shan/defen/lizhi 等）
- `game._skill_trigger()` — 内部钩子，`SkillManager.trigger()` 的封装
- `ZoneManager` — 角色牌特殊区域CRUD
- `SkillManager.sealSkill()/unsealSkill()` — 封印/解封技能

---

## 六、UI 交互流程

### 6.1 启动流程

```
index.html 加载
  → 显示主菜单（10个卡片网格，暗色主题）
  → 点击"开始对战"
  → js/index.js:start()
    → new SkillManager({ characters, rule })
    → game.skillManager = sm
    → sm.dealCharacters(AssignmentMode.DRAW_4)
    → new CharacterSelector(sm, dealResult, 0, callback).show()
    → 玩家选择角色 + AI随机选
    → 所有人确认 → callback() → game.kaiju()
```

### 6.2 选择角色界面

弹窗 overlay，4列卡片网格，每张卡片显示：
- 圆形头像（60×60px）
- 角色名称
- 技能描述列表

选中高亮（金色边框），确认按钮，AI 自动随机选择。

### 6.3 对局中角色显示

4 个 `.character-display` 元素，通过 `transform: translate(X, Y)` 定位：
- 自家：手牌上方偏右
- 下家：手牌左方偏下
- 对家：手牌右方偏上
- 上家：手牌左方偏上

点击头像弹出技能浮窗（280px宽，居中，最大65vh可滚动）。

### 6.4 定位参考

文件位置：
- 桌面端：`src/css/desktop.styl`（角色位置、控制器位置、牌山按钮位置）
- 横屏：`src/css/tablet.styl`（同上）

关键 CSS 选择器：
- `.character-display.main` — 自家
- `.character-display.xiajia` — 下家
- `.character-display.duimian` — 对家
- `.character-display.shangjia` — 上家
- `.controller` — 音量/暂停/速度按钮
- `.shan-viewer-btn` — 牌山可视化按钮
- `.shan-back-btn` — 返回主界面按钮

---

## 七、构建注意事项

1. **CSS 导入顺序有影响**：`index.styl` 中 `@import` 顺序决定了层叠优先级，"横屏覆盖"必须在最后（但 `character_selector` 和 `shan_viewer` 的基础样式必须在 `@media tablet` 之前）。

2. **新增 JS 模块**：在 `webpack.build.config.js` 的 `entry` 中配置多入口。

3. **新增页面**：在 `src/html/page/` 下添加 pug 文件，并在 webpack config 的 pug 插件中注册。

4. **新增 CSS**：在 `src/css/index.styl` 顶部添加 `@import`。

---

## 八、当前项目状态

- 76 名角色数据完整（v1.10）
- 76 张头像完整（`resources/头像/`）
- 技能系统框架完整（类型/时机/注册表/角色池/区域管理）
- 规则设置 UI 完整
- 角色选择/显示/技能浮窗完整
- 牌山可视化完整（68墩环形模型）
- 中文界面完整
- 主界面完整（10 个功能入口）
- 等待：技能效果具体实现
