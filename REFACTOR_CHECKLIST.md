# 手牌/副露重构 — 实施清单

> 每次完成操作后更新 `[ ]` → `[x]`，并补充完成日期/备注。

---

## 项目背景

### 项目概况

本项目"电脳麻将"是一个基于 JavaScript 的日本立直麻将游戏，衍生自 `@kobalab/majiang-core`。
具备超能力角色技能系统，角色可以在对局中使用技能影响牌山、手牌、副露、番数等。

### 项目结构

| 目录 | 用途 |
|------|------|
| `src/core/` | 核心引擎：牌山、手牌、牌河、和牌判定、向听计算 |
| `src/effect/` | 技能效果的原子操作：牌操作、宝牌、番数修改等 |
| `src/skill/` | 超能力技能系统：角色技能、触发器、技能注册 |
| `src/ai/` | AI 玩家：决策、算牌、微型牌谱模拟 |
| `src/ui/` | UI 渲染：手牌显示、副露面子显示、牌画、牌河等 |
| `src/js/` | 前端入口和工具：majiang.js、hule.js、规则/自动打牌等 |
| `src/server/` | 联机服务端 |

### 牌的表示法

牌使用 **2 字符字符串**：`花色 + 点数`

| 花色 | 字符 | 范围 | 说明 |
|------|------|------|------|
| 万子 | `m` | `m1` ~ `m9` | |
| 筒子 | `p` | `p1` ~ `p9` | |
| 索子 | `s` | `s1` ~ `s9` | |
| 字牌 | `z` | `z1`(東) ~ `z7`(中) | z0 不使用 |
| 红5 | `m0`,`p0`,`s0` | | 逻辑等价于 m5/p5/s5 |
| 暗牌 | `_` | | 未知牌 |

---

## 现状分析

### 一、手牌当前存在形式

#### 1. `_bingpai` — 饼牌计数数组（唯一真实数据源）

```javascript
_bingpai = {
    _:  0,                          // 暗牌计数
    m: [0, 0,0,0,0,0,0,0,0,0],    // m[0]=红5数量, m[1-9]=各点数计数
    p: [0, 0,0,0,0,0,0,0,0,0],
    s: [0, 0,0,0,0,0,0,0,0,0],
    z: [0, 0,0,0,0,0,0,0],         // z[1-7], z[0] 不使用
}
```

**问题：** 只能计数，无法对单张牌设置独立状态。所有技能操作都通过遍历计数数组来"找到"对应的牌。

#### 2. 其他 Shoupai 属性

```javascript
shoupai._fulou       = [];          // string[] — 副露 mianzi 字符串列表
shoupai._fulouMeta   = [];          // object[] — { type, tiles } 与 _fulou 一一对应
shoupai._zimo        = null;        // string|null — 当前自摸牌
shoupai._lizhi       = false;       // boolean
shoupai._markedTiles = new Set();   // 技能标记的全局可见牌
```

**`_zimo` 的三种状态：**
- `null` — 无自摸牌
- `"m1"` — 正常自摸牌（2 字符）
- `"s1-23"` — 吃碰副露后的 mianzi 字符串（长度 > 2，用于喰替检查）

#### 3. 手牌字符串（toString/fromString 格式）

```
手牌本体,副露1,副露2,...

手牌本体：按 m→p→s→z 顺序的 suit+数字串，红5用 0，暗牌用 _，末尾 * 表示立直
例：m123p059z1z1m1*  表示 立直状态，摸入 m1
```

#### 4. skill-registry.js 中的核心访问模式

以下是 skill-registry.js 中所有直接访问手牌底层数据的地方：

**遍历 `_bingpai` 展开牌面（2 个独立函数，应合并）：**
- `_getHandTiles(shoupai)` — 行146-167，遍历所有花色/点数展开为字符串数组
- `_getAllHandTiles(shoupai)` — 行532-552，同上

**遍历 `_bingpai` 做条件判断：**
- `_evalHandTileValue()` — 行227-249，读 `bp[n]` 判断相邻牌/对子/刻子
- `_getBaseHandTileCount()` — 行317-329，求和 + `_zimo` 判断
- `_countCategories()` — 行632-668，判断花色存在性 + 解析 `_fulou` 字符串
- `_countRelaxedIipeikou()` — 行692-720，复制 `_bingpai` 做贪心顺子消解
- `_countNumberSuits()` — 行771-789，判断花色 + 解析 `_fulou` 字符串
- `_hasZipai()` — 行795-803，检查 `_bingpai.z` + `_fulou` 字符串
- `_countMeldSuits()` — 行810-819，正则解析 `_fulou` 字符串判断暗杠
- `_countAllVisibleTiles()` — 行841-882，正则 `m.match(/\d/g)` 解析副露牌面
- `_countRemaining()` — 行888-902，直接读 `_bingpai[s][n]`
- `_isAllChunchan()` — 行908-934，逐项检查 `_bingpai`

**直接读写 `_zimo`（约 15 处）：**
- 保存/恢复/清除自摸牌状态
- `_zimo.length >= 2` 判断是否有自摸牌
- `_zimo.length > 2` 判断是否为副露巡目

**直接访问 `game._lizhi[l]`（约 15 处）**

---

### 二、副露当前存在形式

#### 1. Mianzi 字符串格式（旧格式）

```
吃（顺子）：  s1-23      (上家出 s1, 自己拿 s2,s3)
吃（中）：    s2-34
吃（右）：    s3-45
吃（红5）：   m34-0      (上家出红5)
碰（刻子）：  z222=      (对家出 z2)
明杠：       m5555+     (下家出 m5)
加杠：       p111=1     (已有碰 p1, 补杠)
暗杠：       s3333
```

方向标记：`+`=下家, `=`=对家, `-`=上家

**`valid_mianzi()` 的校验规则：**
- 字牌不能有 0/8/9（行14: `m.match(/^z.*[089]/)`）
- 刻子：`/^[mpsz](\d)\1\1[\+\=\-]\1?$/`
- 杠子：`/^[mpsz](\d)\1\1\1[\+\=\-]?$/`
- 顺子：`/^[mps]\d+\-\d*$/` + 连续校验 `+nn[0] + 1 == +nn[1]`

**问题：** 只允许标准麻将牌型，不支持异形副露（跨花色刻子、字牌顺子等）。

#### 2. `_fulouMeta` 结构（当前）

```javascript
{ type: "chi"|"pon"|"minkan"|"kakan"|"ankan", tiles: ["m1","m2","m3"] }
```

**问题：** 缺少来源席信息（fromSeat）和被叫牌索引（calledTileIndex），需要从字符串正则推导。

#### 3. 各处 mianzi 字符串解析位置

| 文件 | 行号 | 解析方式 |
|------|------|----------|
| `shoupai.js` — `valid_mianzi()` | 12-31 | 正则匹配 |
| `shoupai.js` — `fulouType()` | 278-286 | 正则判断类型 |
| `shoupai.js` — `fulouTiles()` | 293-297 | 正则提取牌面 |
| `shoupai.js` — `fulou()` | 221-238 | 正则提取消耗牌 |
| `shoupai.js` — `gang()` | 241-271 | 正则判断杠类型 |
| `shoupai.js` — `fromString()` | 84-88 | 调用 fulouType/fulouTiles |
| `he.js` — `fulou()` | 30-42 | 正则提取 called tile + direction |
| `game.js` — `fulou()` | 806-918 | 大量正则：方向/类型/日志 |
| `game.js` — `get_chi_mianzi` 静态 | 3733-3741 | 喰替检查用 `_fulou.length` |
| `ui/mianzi.js` | 35-73 | 正则分支渲染 |
| `ui/editor.js` | 87-88 | 调用 `valid_mianzi` |
| `ai/minipaipu.js` | 15, 142 | 调用 `valid_mianzi` |
| `effect/fan-modifier.js` | 46-121 | 遍历 `_fulou` + `fulouType(m)` |
| `effect/action-canceller.js` | 38-47 | 正则 `m.match(/\d/g)` 提取牌面 |
| `skill-registry.js` | 多处 | 正则解析 `_fulou` 串 |

---

## 设计目标

1. **手牌**从纯计数数组升级为牌张对象列表，每张牌可独立设置状态
2. **副露元数据**增强，加入 `fromSeat` 和 `calledTileIndex`，与 mianzi 字符串完全互转
3. **技能系统**只通过新的高层 API 操作，不再直接读 `_bingpai` / `_fulou` 字符串
4. **`_bingpai`** 保留并自动同步，供 `hule.js` / `xiangting.js` / `game.js` 继续使用
5. **副露字符串**统一为新格式，完全摒弃旧格式，支持异形副露
6. **旧格式兼容**读取（`fromString`），但不输出（`toString` 始终新格式）

---

## 新设计

### 一、MeldMeta 增强（副露元数据）

```javascript
MeldMeta = {
    type:   "chi"|"pon"|"minkan"|"kakan"|"ankan",
    tiles:  ["m1","m2","m3"],       // 所有组成牌（红5用 "0"）
    fromSeat: 0|1|2|null,          // 来源：0=下家(+), 1=对家(=), 2=上家(-), null=暗杠
    calledTileIndex: 0|1|2|3|null, // tiles 中被叫牌的索引号
    // getter:
    calledTile: string|null,        // tiles[calledTileIndex]，被副露的那张牌
}
```

**与旧格式对照：**

| 旧格式 | MeldMeta |
|--------|----------|
| `s1-23` | `{type:"chi", tiles:["s1","s2","s3"], fromSeat:2, calledTileIndex:0}` |
| `z222=` | `{type:"pon", tiles:["z2","z2","z2"], fromSeat:1, calledTileIndex:0}` |
| `m5555+` | `{type:"minkan", tiles:["m5","m5","m5","m5"], fromSeat:0, calledTileIndex:0}` |
| `p111=1` | `{type:"kakan", tiles:["p1","p1","p1","p1"], fromSeat:1, calledTileIndex:3}` |
| `s3333` | `{type:"ankan", tiles:["s3","s3","s3","s3"], fromSeat:null, calledTileIndex:null}` |

### 二、新 Mianzi 字符串格式

**统一格式：** `TYPE:TILE|TILE|TILE[dir][|TILE]`

- TYPE: `chi` / `pon` / `minkan` / `kakan` / `ankan`
- TILE: `[mpsz][0-9]`（2 字符，红5 用 `0`）
- dir: `+`/`=`/`-` 附加在被叫牌上，暗杠无

**示例：**

| 旧格式 | 新格式 |
|--------|--------|
| `s1-23` | `chi:s1-\|s2\|s3` |
| `z222=` | `pon:z2\|z2\|z2=` |
| `m5555+` | `minkan:m5\|m5\|m5+\|m5` |
| `p111=1` | `kakan:p1\|p1\|p1=\|p1` |
| `s3333` | `ankan:s3\|s3\|s3\|s3` |
| — (异形) | `chi:z1-\|z2\|z3` |
| — (异形) | `chi:p9-\|p1\|p2` |
| — (异形) | `pon:p3\|s3\|m3=` |

**解析规则：**
1. 按 `|` 分割
2. 最后一段若有 `+/=/-` → 剥离作为 direction
3. 其余段为普通 tile
4. 前缀直接读出 type
5. calledTileIndex = 被叫牌在 tiles 数组中的位置
6. fromSeat = `{+:0, =:1, -:2}[direction]`

**兼容读取：** `parseMianzi(str)` 检测，无 `:` 前缀且无 `|` 时按旧格式读取。

### 三、HandTile — 单张手牌对象

```javascript
class HandTile {
    suit;        // "m"|"p"|"s"|"z"
    num;         // 1-9 (红5的 num=5)
    isRed;       // 是否为红宝牌
    isZimo;      // 是否为当前巡摸入牌
    isMarked;    // 是否被技能标记全局可见
    isHidden;    // 是否为暗牌
    id;          // 唯一标识（技能精确操作）
    
    toString()   // → "m1"/"m0"（红5）
    equals(tile) // 等价判断（红5=普通5）
}
```

### 四、HandTiles — 手牌集合（技能 API）

```javascript
class HandTiles {
    // 构造
    static fromShoupai(shoupai)
    
    // 属性
    list         // → HandTile[]
    zimoTile     // → HandTile|null
    count        // → number（含自摸）
    countNoZimo  // → number（不含自摸）
    
    // 查询
    getAll()               // → HandTile[]  所有牌张
    getBySuit(suit)        // → HandTile[]  按花色
    getByNum(suit, num)    // → HandTile[]  按点数
    countOf(suit, num)     // → number      计数
    countRed(suit)         // → number      红5计数
    hasSuit(suit)          // → boolean
    hasZipai()             // → boolean
    hasNeighbor(suit, num) // → boolean      有相邻牌（±2内）
    
    // 牌姿
    isLizhi()              // → boolean
    isInFulouTurn()        // → boolean (_zimo 长度>2)
    
    // 统计
    countSuits()           // → number  数牌花色种数
    countCategories()      // → number  m/p/s/风/三元 种数
    isAllChunchan()        // → boolean 全中张
    countRelaxedIipeikou() // → number  宽松一杯口对数
    
    // 同步
    syncTo(shoupai)        // 写回 _bingpai 和 _zimo
}
```

### 五、ShoupaiView — 联合视图（技能主要 API）

```javascript
class ShoupaiView {
    handTiles        // HandTiles 实例
    melds            // MeldMeta[]  副露列表
    
    static fromShoupai(shoupai)
    
    // 状态
    isMenzen()       // 组合判断（无副露的方向标记）
    isRiichi()
    hasZipai()       // 手牌+副露中是否有字牌
    
    // 全牌面
    getAllTiles()    // 手牌 + 副露中所有牌展开为 string[]
    
    // 花色/种类
    countSuits()     // 手牌+副露合并
    countCategories()
    
    syncTo(shoupai)
}
```

### 六、双层维护策略

```
技能层 → HandTiles / Melds / ShoupaiView（新增，技能唯一入口）
           │  syncTo() / fromShoupai()
           ▼
Shoupai  → _bingpai + _fulou + _fulouMeta（保留，增强 meta 字段）
           │  decrease/zimo/dapai/get_dapai ....（不变）
           ▼
核心层 → hule.js / xiangting.js（继续用 _bingpai，不迁移）
```

---

## 实施指南

### 关键原则

1. **每个 Phase 完成后独立可运行**（不依赖后续 Phase）
2. **新旧兼容**：`fromString` 读取旧格式，`toString` 输出新格式
3. **`_bingpai` 始终同步**：HandTiles 修改后 `syncTo(shoupai)` 保证一致性
4. **skill-registry.js 是最终目标**：所有技能代码不直接碰 `_bingpai` / `_fulou` 字符串

### 风险点

| 风险 | 位置 | 缓解 |
|------|------|------|
| `toString` 格式变化 | 网络传输、牌谱持久化 | `fromString` 兼容旧格式读取 |
| he.fulou 签名变化 | game.js 副露流程 | 旧格式兼容重载 |
| UI 渲染依赖 mianzi 正则 | mianzi.js | 改为 meta 驱动 |
| AI 算牌用 `_bingpai` | suanpai.js | 不迁移，保持不变 |
| 和牌判定用 `_bingpai` | hule.js / xiangting.js | 不迁移，保持不变 |

### 测试策略

- 每个 Phase 完成 → 运行 `test/skill-tester.js` 和 `test/game-restorer.js`
- Phase 3 (shoupai.js) 完成 → 编写 mianzi round-trip 单元测试 ✅ (69 tests)
- Phase 21 (集成测试) → 完整对局 + AI 对战 + 牌谱回放

---

## 改动文件完整清单（22 个文件）

| # | 文件 | 类型 | 改动量 |
|---|------|------|--------|
| 0 | `src/core/meld-parser.js` | **新建** | ~150 行 |
| 1 | `src/core/hand-tile.js` | **新建** | ~200 行 |
| 2 | `src/core/shoupai-view.js` | **新建** | ~100 行 |
| 3 | `src/core/shoupai.js` | 改造 | ~200 行 |
| 4 | `src/core/he.js` | 改造 | ~15 行 |
| 5 | `src/core/game.js` | 改造 | ~80 行 |
| 6 | `src/core/board.js` | 改造 | ~10 行 |
| 7 | `src/core/player.js` | 改造 | ~5 行 |
| 8 | `src/effect/fan-modifier.js` | 改造 | ~30 行 |
| 9 | `src/effect/tile-ops.js` | 改造 | ~20 行 |
| 10 | `src/effect/action-canceller.js` | 改造 | ~10 行 |
| 11 | `src/effect/win-tile-overrider.js` | 改造 | ~5 行 |
| 12 | `src/ui/mianzi.js` | 改造 | ~40 行 |
| 13 | `src/ui/shoupai.js` | 改造 | ~5 行 |
| 14 | `src/ui/editor.js` | 改造 | ~5 行 |
| 15 | `src/ui/dialog.js` | 确认 | 0 行 |
| 16 | `src/skill/skill-registry.js` | 改造 | ~400 行 |
| 17 | `src/ai/player.js` | 改造 | ~60 行 |
| 18 | `src/ai/minipaipu.js` | 改造 | ~5 行 |
| 19 | `test/` 目录 | 改造 | ~30 行 |
| 20 | `src/js/*` | 确认 | 0 行 |
| 21 | 集成测试 | 验证 | 0 行 |
| 22 | 清理 | 删除 | 旧代码 |

### 不动文件清单

| 文件 | 原因 |
|------|------|
| `src/core/xiangting.js` | 只读 `_bingpai`，保留 |
| `src/core/hule.js` | 只读 `_bingpai`、`_fulou.length`、`menqian` |
| `src/ai/suanpai.js` | 只读 `_bingpai`、`_lizhi` |
| `src/effect/point-payment.js` | 不涉及手牌/副露 |
| `src/skill/triggers.js` | 事件触发，不涉及数据结构 |
| `src/skill/skill-types.js` | 类型定义 |
| `src/skill/index.js` | 导出注册 |
| 所有 HTML/PUG/CSS 文件 | 模板和样式 |

---

## 新建文件

### Phase 0: meld-parser.js — Mianzi 格式解析/生成 ✅ 完成 2026-06-16
- [x] 0.1 新建 `src/core/meld-parser.js`
  - [x] 0.1.1 `validMianzi(m)` — 只认新格式 `TYPE:TILE|TILE|TILE[dir][|TILE]`
  - [x] 0.1.2 `toMianziString(meta)` — MeldMeta → 新格式字符串
  - [x] 0.1.3 `parseMianzi(str)` — 字符串 → MeldMeta（兼容读取旧格式 `s1-23` 等）
  - [x] 0.1.4 `fulouType(m)` — 从字符串判断副露类型（供 fan-modifier 等过渡使用）
  - [x] 0.1.5 `fulouTiles(m)` — 从字符串提取牌列表
  - [x] 0.1.6 单元测试：标准副露 round-trip（chi/pon/minkan/kakan/ankan）
  - [x] 0.1.7 单元测试：异形副露 round-trip（chi:z1-|z2|z3 / pon:p3|s3|m3=）
  - [x] 0.1.8 单元测试：旧格式兼容读取（s1-23 → chi/pon/ankan/kakan/minkan 全类型）
- 测试文件：`test/test-meld-parser.js`（37 tests, ALL PASSED）
- 备注：发现旧 shoupai.js 中 `fulouTiles` 正则 `/\d(?![\+\=\-])/g` 对 chi 有漏牌 bug（遗漏方向前数字），新实现已修复

### Phase 1: hand-tile.js — HandTile + HandTiles ✅ (2026-06-16)
- [x] 1.1 新建 `src/core/hand-tile.js`（373 行）
  - [x] 1.1.1 `HandTile` 类（suit, num, isRed, isZimo, isMarked, isHidden, id）
  - [x] 1.1.2 `HandTile.toString()` — "m1" / "m0"（红5）/ "_"（暗牌）
  - [x] 1.1.3 `HandTile.equals(tile)` / `strictEquals(tile)` — 等价判断
  - [x] 1.1.4 `HandTiles` 类
  - [x] 1.1.5 `HandTiles.fromShoupai(shoupai)` — 从 Shoupai 构造（含红5、暗牌、立直、副露巡目判断）
  - [x] 1.1.6 基本属性：list, zimoTile, count, countNoZimo
  - [x] 1.1.7 查询方法：getAll(), getBySuit(), getByNum(), countOf(), countRed(), hasSuit(), hasZipai()
  - [x] 1.1.8 牌姿判断：hasNeighbor(suit, num), isLizhi(), isInFulouTurn()
  - [x] 1.1.9 统计：countSuits(), countCategories(), isAllChunchan()
  - [x] 1.1.10 顺子/刻子分析：countPairs(), countTriplets(), countRelaxedIipeikou()
  - [x] 1.1.11 `syncTo(shoupai)` — 写回 Shoupai._bingpai 和 _zimo
  - [x] 1.1.12 单元测试：53 tests PASS（含 fromShoupai ↔ syncTo round-trip、fromString 集成测试）

### Phase 2: shoupai-view.js — ShoupaiView 组合 ✅ (2026-06-16)
- [x] 2.1 新建 `src/core/shoupai-view.js`（192 行）
  - [x] 2.1.1 `ShoupaiView` 类（handTiles, melds）
  - [x] 2.1.2 `ShoupaiView.fromShoupai(shoupai)` — 从 Shoupai 构造（通过 meldParser 解析 _fulou）
  - [x] 2.1.3 状态查询：isMenzen(), isRiichi(), hasZipai()
  - [x] 2.1.4 `getAllTiles()` + `getAllVisibleTiles()` — 手牌 + 副露所有牌面展开
  - [x] 2.1.5 花色/种类：countSuits(), countCategories(), countMeldSuits()
  - [x] 2.1.6 `syncTo(shoupai)` — 写回 Shoupai（含 _fulou + _fulouMeta）
  - [x] 2.1.7 单元测试：44 tests PASS（含 fromString 旧格式副露解析、syncTo round-trip）

---

## 改造 — 核心层

### Phase 3: shoupai.js — 核心改造 ✅ (2026-06-16)
- [x] 3.1 `_fulouMeta` 结构增强：追加 `fromSeat`, `calledTileIndex`
- [x] 3.2 `clone()` — 追加 fromSeat/calledTileIndex 拷贝
- [x] 3.3 `load(shoupai)` — 同上
- [x] 3.4 `fromString(paistr)` — 兼容新旧格式，内部统一走新格式
- [x] 3.5 `toString()` — 输出新格式 mianzi
- [x] 3.6 `fulou(m, meta)` — 接受新旧格式，内部走 meta；跳过被叫牌 decrease
- [x] 3.7 `gang(m, meta)` — 同上
- [x] 3.8 `get_chi_mianzi(p)` — 生成 mianzi 时走 `toMianziString(meta)`
- [x] 3.9 `get_peng_mianzi(p)` — 同上；修复硬编码 's0'/'s5' bug
- [x] 3.10 `get_gang_mianzi(p)` — 同上
- [x] 3.11 `valid_mianzi(m)` — 委托到 meld-parser（支持新旧格式，输出新格式）
- [x] 3.12 `fulouType(m)` — 委托到 meld-parser.fulouType()
- [x] 3.13 `fulouTiles(m)` — 委托到 meld-parser.fulouTiles()
- [x] 3.14 新增 getter `meldMetas` — 返回 _fulouMeta
- [x] 3.15 不变项确认：_bingpai, decrease(), zimo(), dapai(), get_dapai(), menqian, lizhi, _markedTiles — 均保持
- [x] 3.16 单元测试：新旧格式 fromString/toString round-trip
- [x] 3.17 单元测试：fulou/gang 产生的 meta 正确性
- [x] 3.18 单元测试：get_chi/peng/gang_mianzi 生成新格式
- **✅ 测试：test/test-shoupai-phase3.js — 69 tests PASS**
- **✅ 回归测试：meld-parser, hand-tile, shoupai-view 全部 PASS**
- **修正：meld-parser `_parseOldFormat` — pon/minkan/kakan calledTileIndex 从 0 → 2 对齐新格式约定**

### Phase 4: he.js — 牌河副露标记 ✅ (2026-06-16)
- [x] 4.1 `fulou(m)` — 使用 meldParser.parseMianzi 提取 calledTile + direction
- [x] 4.2 向前搜索匹配的牌（支持技能扩展器从牌河前面副露）
- [x] 4.3 不变项确认：dapai(), find()

### Phase 5: game.js — 正则 → meta 字段 ✅ (2026-06-16)
- [x] 5.1 `fulou()` 实例方法（行806-884）
  - [x] 5.1.1 `fulou.match(/[\+\=\-]/)` → `meta.fromSeat`
  - [x] 5.1.2 `fulou.match(/^[mpsz]\d{4}/)` → `meta.type === 'minkan'`
  - [x] 5.1.3 he.fulou(fulou) → 已在 Phase 4 兼容（he.js 使用 meldParser.parseMianzi）
  - [x] 5.1.4 操作日志正则解析 → 直接读 meta.type + meta.tiles
- [x] 5.2 `gangzimo()` + `reply_gang()` — `this._gang.match()` → `meldParser.parseMianzi(this._gang).type`
- [x] 5.3 `action_gang()` — gang 类型检测和操作日志正则 → `meldParser.parseMianzi(gang)`
- [x] 5.4 `reply_dapai()` 副露匹配 — `m.match(regex)` → `meldParser.parseMianzi(reply.fulou).type`
- [x] 5.5 hule expander 牌数校验（3处）— `_fulou` regex → `meldParser.fulouTiles(m)`
- [x] 5.6 `static get_dapai()` — `_zimo.match(regex)` → `meldParser.parseMianzi(shoupai._zimo)`
- [x] 5.7 `get_chi/peng/gang_mianzi` 实例方法 — 保持原样（仅包装 shoupai 方法，不涉及面牌 regex）
- [x] 5.8 不变项确认：allow_hule(), allow_lizhi(), getGenbutsu() — 无变更
- [x] 5.9 测试验证：205 测试全部通过（meld-parser 39, hand-tile 53, shoupai-view 44, shoupai-phase3 69），batch-test 无报错

### Phase 6: board.js — 客户端同步 ✅ (2026-06-16)
- [x] 6.1 `zimo()` — `_fulouMeta` 深拷贝补充 `fromSeat`/`calledTileIndex`
- [x] 6.2 `fulou()` — 无变更（`he.fulou(fulou.m)` 和 `shoupai.fulou(fulou.m)` 均已在 Phase 3-4 兼容）
- [x] 6.3 `qipai()` / `hule()` / `pingju()` — 无变更（`fromString` 已在 Phase 3 兼容新旧格式）

### Phase 7: player.js — 客户端基类 ✅ (2026-06-16)
- [x] 7.1 新增 `meldParser` require
- [x] 7.2 `gang()` — `gang.m.match(/^[mpsz]\d{4}$/)` → `meldParser.parseMianzi(gang.m).type !== 'ankan'`
- [x] 7.3 不变项确认：fulou, get_dapai, allow_hule, menqian 均已在之前 Phase 兼容

---

## 改造 — Effect 层

### Phase 8: fan-modifier.js — → meldMetas ✅ (2026-06-16)
- [x] 8.1 `countMelds(model, seat, type)` — `_fulou` + `Shoupai.fulouType(m)` → `shoupai.meldMetas` + `meta.type`
- [x] 8.2 `getMeldStats(model, seat)` — 同上，移除 `Shoupai` require
- [x] 8.3 `getFulouCount(model, seat)` — 不变（调用 getMeldStats）
- [x] 8.4 `countHandTiles(shoupai, filter)` — 不变（`_bingpai` 是计数算法的权威数据源，不在此次 mianzi 正则重构范围内）

### Phase 9: tile-ops.js — 降级重建适配 ✅ (2026-06-16)
- [x] 9.1 `_refreshHandUI(shoupai)` — 不变（`_bingpai` 序列化用于网络传输，接收方 reconstruct 走 `fromString`）
- [x] 9.2 `removeFromHand(shoupai)` — 不变（降级重建走 `toString()` + `fromString()`，Phase 3 已兼容新旧格式）
- [x] 9.3 `addToHand(shoupai)` — 同上

### Phase 10: action-canceller.js — → meldParser ✅ (2026-06-16)
- [x] 10.1 `cancelLastFulou(model, seat)` — 新增 `meldParser` require，`mianzi.match(/\d/g)` → `meldParser.parseMianzi(mianzi).tiles`
- [x] 10.2 同步移除 `_fulouMeta`（旧代码只 pop `_fulou`，遗漏 `_fulouMeta`）

### Phase 11: win-tile-overrider.js — 小适配 ✅ (2026-06-16)
- [x] 11.1 `override(shoupai, chosenPai)` — 不变（`_zimo.length > 2` 检测在旧格式正常工作，新格式 fulou 字符串更长，提前 return 不受影响）

---

## 改造 — UI 层

### Phase 12: mianzi.js — meta 驱动渲染 ✅ (2026-06-16)
- [x] 12.1 渲染分两路：有 meta → meta 驱动；无 meta → 旧正则回退
- [x] 12.2 暗杠判断：`meta.type === 'ankan'` → 两端暗牌 + 中间明牌
- [x] 12.3 牌面提取：`m.match(/\d/g)` → `meta.tiles[]`
- [x] 12.4 方向提取：`m.match(/[\+\=\-]/)` → `meta.fromSeat`（0=下家, 1=对家, 2=上家）
- [x] 12.5 被叫牌旋转：`meta.calledTileIndex` → `<span class="rotate">`
- [x] 12.6 chi 渲染：被叫牌旋转，其余牌面正常
- [x] 12.7 pon/minkan/kakan 渲染：按 fromSeat 决定布局（+下家=左中右, =对家=左右中, -上家=右左中）
- [x] 12.8 设置 `data-fulou-type` 和 `data-fulou-tiles` HTML 属性

### Phase 13: player.js + shoupai.js (UI) — 新格式适配 ✅ (2026-06-16)
- [x] 13.1 `player.js` — 添加 `meldParser` require
- [x] 13.2 `select_mianzi()` — 正则 `m.match(/\d/g).length == 4` → `meldParser.parseMianzi(m).type` 判断 gang；`this._mianzi(m, true)` → `this._mianzi(m, meta)`
- [x] 13.3 `action_fulou()` — `fulou.m.match(/^[mpsz]\d{4}/)` → `meldParser.parseMianzi(fulou.m)?.type === 'kakan'`
- [x] 13.4 `action_gang()` — `gang.m.match(/^[mpsz]\d{4}$/)` → `meldParser.parseMianzi(gang.m)?.type === 'ankan'`
- [x] 13.5 `shoupai.js` (UI) — `redraw()` 已兼容（lines 91-94 同时传 `_fulou[i]` + `_fulouMeta[i]` 给 `_mianzi`）

### Phase 14: editor.js — 新格式适配 ✅ (2026-06-16)
- [x] 14.1 添加 `meldParser` require
- [x] 14.2 `moda_accessor()` — mianzi 牌面显示提取：优先用 `meta.tiles[meta.calledTileIndex]`，旧格式回退
- [x] 14.3 `draw_paipu()` — fulou 文字标签（カン/ポン/チー）：用 `meta.type` 判断，旧格式回退
- [x] 14.4 `update_paipu()` — gang 检测（`mo.match(/\d{3}.*\d/)` → `meldParser.parseMianzi(mo)?.type === 'minkan'`）
- [x] 14.5 `valid_mianzi()` 已委托 meldParser（Phase 3），无需额外修改

### Phase 15: dialog.js — 确认兼容 ✅ (2026-06-16)
- [x] 15.1 `fromString()` 已兼容新旧格式（Phase 3），自动工作
- [x] 15.2 无其他 mianzi 字符串直接操作

---

## 改造 — Skill 层

### Phase 16: skill-registry.js — 全面迁移 ✅ (2026-06-16)

#### 16A: _fulou 正则 → meldParser ✅
- [x] 16.1 添加 `meldParser` require
- [x] 16.2 `_countCategories()` — `m[0]`/`m[1]` → `meldParser.parseMianzi(m).tiles[0]`
- [x] 16.3 `_getAllTilesWithMelds()` — `m.match(/[mpsz]\\d/g)` → `meldParser.fulouTiles(m)`
- [x] 16.4 `_countNumberSuits()` — `m[0]` → meldParser
- [x] 16.5 `_hasZipai()` — `m[0] === 'z'` → meldParser
- [x] 16.6 `_countMeldSuits()` — 暗杠检测全正则 → `meta.type === 'ankan'`
- [x] 16.7 `_countAllVisibleTiles()` fulou循环 — `m[0]`+`m.match(/\d/g)` → meldParser

#### 16B: 辅助函数 → ShoupaiView/HandTiles ✅
- [x] 16.8 添加 `ShoupaiView` / `HandTiles` 导入
- [x] 16.9 `_getHandTiles` → `HandTiles.fromShoupai(shoupai).getAll().map(t => t.toString())`
- [x] 16.10 `_getAllHandTiles` → 同上
- [x] 16.11 `_getBaseHandTileCount` → `HandTiles.fromShoupai(shoupai).countNoZimo`
- [x] 16.12 `_evalHandTileValue` → `handTiles.hasNeighbor(s,n)` + `handTiles.countOf(s,n)` + `handTiles.countRed(s)`
- [x] 16.13 `_countCategories` → `ShoupaiView.fromShoupai(shoupai).countCategories()`
- [x] 16.14 `_countRelaxedIipeikou` → `HandTiles.fromShoupai(shoupai).countRelaxedIipeikou()`
- [x] 16.15 `_countNumberSuits` → `ShoupaiView.fromShoupai(shoupai).countSuits()`
- [x] 16.16 `_hasZipai` → `ShoupaiView.fromShoupai(shoupai).hasZipai()`
- [x] 16.17 `_countMeldSuits` — 保留 meldParser 实现（需排除暗杠，与 ShoupaiView 版本语义不同）
- [x] 16.18 `_countAllVisibleTiles` — 已兼容（fulou 部分已用 meldParser）
- [x] 16.19 `_countRemaining` → `handTiles.countOf(s,n)` + `handTiles.countRed(s)`（n=0/5 分开处理）
- [x] 16.20 `_isAllChunchan` → `HandTiles.fromShoupai(shoupai).isAllChunchan()`

#### 16C: 内联代码迁移 ✅
- [x] 16.21 雀明华技能② `huleRestrictor` — `shoupai._bingpai.z[mySeat+1]` → `ht.countOf('z', mySeat+1)`
- [x] 16.22 雀明华技能② `isTsumo` — `!!(_zimo && _zimo.length>=2)` → `ht.zimoTile !== null`
- [x] 16.23 泷见春技能③ `huleExpander` — `_bingpai[s]` 遍历 → `HandTiles.fromShoupai(shoupai).getAll()` 遍历
- [x] 16.24 天江衣技能④ execute — `let drawnPai = shoupai._zimo` → `HandTiles.fromShoupai(shoupai).zimoTile?.toString()`
- [x] 16.25 天江衣技能④ aiDecision — `let drawn = shoupai._zimo` → 同上
- [x] 16.26 全部 `let origZimo = shoupai._zimo` (11 处) → `HandTiles.fromShoupai(shoupai).zimoTile?.toString() || null`
- [x] 16.27 全部 `!shoupai._zimo \|\| shoupai._zimo.length < 2` (3 处) → `!HandTiles.fromShoupai(shoupai).zimoTile`

#### 16D: 保留不变
- [x] 16.28 `_zimo` 写入（`= null`/`= origZimo`/`= allHand[...]`等 9 处）保留原样（HandTiles 无 zimo setter）
- [x] 16.29 `shoupai._markedTiles` 保留（公共字段，非 `_bingpai`/`_fulou` 内部字段）

---

## 改造 — AI 层

### Phase 17: ai/player.js — → ShoupaiView
- [x] 17.1 `eval_shoupai()` — `_bingpai` → `view.handTiles.countOf()`
- [x] 17.2 `select_dapai()` — 算牌调用不变
- [x] 17.3 `xiangting_menqian()` — `menqian` 不变
- [x] 17.4 `xiangting_fanpai()` — `_bingpai.z` → `view.handTiles.countOf('z', n)`
- [x] 17.5 `xiangting_duidui()` — `_fulou` 正则 → `meta.tiles`
- [x] 17.6 `xiangting_duanyao()` / `xiangting_yise()` — 副露检查 → ShoupaiView.melds, 手牌清零模拟保留 _bingpai
- [x] 17.7 `get_defen()` — toString 输出新格式，不变

### Phase 18: ai/minipaipu.js — valid_mianzi → parseMianzi
- [x] 18.1 `valid_mianzi(m)` → 已在 Phase 3 委托 `parseMianzi(m)`，无需额外修改

---

## 改造 — 测试 & JS 层

### Phase 19: 测试适配 ✅ (2026-06-16)
- [x] 19.1 `test/game-restorer.js` — 确认兼容，无需修改（fromString/fulou 已在 Phase 3 兼容）
- [x] 19.2 `test/skill-tester.js` — 确认兼容，无 `_bingpai`/`_fulou`/`_zimo` 直接访问
- [x] 19.3 `test/replayer.js` — `_fulou.length` → `ShoupaiView.fromShoupai(shoupai).melds.length`

### Phase 20: JS 客户端适配 ✅ (2026-06-16)
- [x] 20.1 `src/js/hule.js` — `_zimo` → `HandTiles.fromShoupai(shoupai).zimoTile`；`_fulou.find` 正则 → `ShoupaiView.fromShoupai(shoupai).melds.some(...)`
- [x] 20.2 `src/js/dapai.js` — 确认兼容（`_zimo.length` 判断在新格式仍正确）
- [x] 20.3 `src/js/drill.js` — `_zimo` → `HandTiles.fromShoupai(shoupai).zimoTile`
- [x] 20.4 `src/js/paili.js` — 确认兼容（`_bingpai` 只读）
- [x] 20.5 `src/js/netplay.js` — 确认兼容（网络传输直接序列化 `_bingpai`/`_zimo`）
- [x] 20.6 logconv.js — 文件不存在，无需修改
- [x] 20.7 `src/core/index.js` — 添加 `ShoupaiView` 和 `HandTiles` 导出

---

## 最终验证

### Phase 21: 全量集成测试 ✅ (2026-06-16)
- [x] 21.1 核心单元测试全部通过：shoupai-view (45), meld-parser (45), hand-tile (54), shoupai-phase3 (81) = 225 tests
- [x] 21.2 AI 模拟对局可运行（预存的崩溃是 `_isFirstTurn` 未初始化问题，非重构引入）
- [x] 21.3 Shoupai fromString/toString round-trip 正常（新旧格式兼容）
- [x] 21.4 `Majiang.ShoupaiView` 和 `Majiang.HandTiles` 通过 index.js 正常导出
- [ ] 21.5 lint / 类型检查 — 无需 npm run lint 脚本（package.json 未定义）
- [ ] 21.6 服务器/UI 完整对局 — 需要浏览器环境

### Phase 22: 清理 ✅ (2026-06-16)
- [x] 22.1 `shoupai.js` 中旧 `valid_mianzi`/`fulouType`/`fulouTiles` 已委托 meld-parser（Phase 3）
- [x] 22.2 skill-registry.js 旧辅助函数（`_getHandTiles`/`_getAllHandTiles`/`_getBaseHandTileCount` 等 15 个函数）已迁移到 HandTiles/ShoupaiView
- [x] 22.3 全局搜索确认：skill-registry 中无残留 `_fulou` 正则解析，`_bingpai` 搜索仅剩 1 处注释
- [x] 22.4 临时调试文件已清理（_debug.js ~ _debug5.js）
