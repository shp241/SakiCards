/*
 *  Majiang.Shan — 物理牌山模型
 *
 * ── 牌堆结构 ──
 *
 *   牌山：环形 68 墩（每墩 1 上 1 下），从开门位（_cursor）向前依次摸牌，
 *   可摸牌范围至海底前一墩为止，最后一墩称为海底牌。
 *   摸牌方向：上层 → 下层 → 下一墩上层 → ...
 *
 *   王牌：初始为牌堆的最后 7 墩，王牌顺序与牌山相反。
 *   初始翻开王牌第 3 墩的上方牌，为初始宝牌指示牌（宝 1），
 *   下方为第 1 张里宝牌指示牌。
 *
 *   王牌区 7 墩内部布局（从王牌尾部向王牌头部，即从 _haitei 向前）：
 *     [补充墩...] 宝5 宝4 宝3 宝2 宝1 岭2 岭1
 *
 *     岭上牌（宝牌指示牌前 2 墩）→ 杠后摸牌顺序：岭 1 上层 → 岭 1 下层 → 岭 2 上层 → 岭 2 下层
 *     宝牌指示牌（5 墩）       → 初翻宝 1 上层，杠后依次翻宝 2、宝 3、宝 4、宝 5 上层
 *     里宝牌                   → 宝 1~宝 5 的下层
 *
 *   开杠后：摸取一张岭上牌，并将海底牌移动至王牌尾部形成补充墩。
 */

"use strict";

const Majiang = { Shoupai: require('./shoupai') };

module.exports = class Shan {

    /* 基础牌: 36 种 × 4 枚 = 144, 但标准麻将用 34 种 */
    static zhenbaopai(p) {
        if (! Majiang.Shoupai.valid_pai(p)) throw new Error(p);
        let s = p[0], n = + p[1] || 5;
        return s == 'z' ? (n < 5  ? s + (n % 4 + 1) : s + ((n - 4) % 3 + 5))
                        : s + (n % 9 + 1);
    }

    constructor(rule) {

        this._rule = rule;
        let hongpai = rule['赤牌'];

        /* 生成 136 枚牌 */
        let pai = [];
        for (let s of ['m','p','s','z']) {
            for (let n = 1; n <= (s == 'z' ? 7 : 9); n++) {
                for (let i = 0; i < 4; i++) {
                    if (n == 5 && i < hongpai[s]) pai.push(s+0);
                    else                          pai.push(s+n);
                }
            }
        }

        /* 洗牌 */
        let shuffled = [];
        while (pai.length) {
            shuffled.push(pai.splice(Math.random() * pai.length, 1)[0]);
        }

        /* 堆成 68 墩，每墩 { top: 上层牌, bottom: 下层牌 } */
        this._stacks = [];
        for (let i = 0; i < 68; i++) {
            this._stacks.push({
                top:    shuffled[i * 2],
                bottom: shuffled[i * 2 + 1],
            });
        }

        /* 掷骰：庄家 2d6 → 目标玩家 → 目标玩家 2d6，算出开门墩位 */
        let dice1 = Math.floor(Math.random() * 6 + 1)
                  + Math.floor(Math.random() * 6 + 1);
        let dice2 = Math.floor(Math.random() * 6 + 1)
                  + Math.floor(Math.random() * 6 + 1);
        this._break = dice1 + dice2;    /* 从目标玩家右侧数 this._break 墩，下一墩为开门位 */
                                        /* 简化: 直接用骰数和作为开门位偏移 */

        /*
         * ── 指针系统（68 墩定长数组，无 splice） ──
         *
         *   环形布局：[cursor] → 活牌区... → 海底 → [_haitei] → 王牌区(_dw_count墩) → 空墩区 → 回到 cursor
         *
         *   _cursor        摸牌位置指针（开门位，活牌区头部）
         *   _haitei        王牌尾部指针（海底+1，活牌区与王牌区的边界）
         *                   注意：海底牌位于 _haitei - 1 墩
         *   _dw_count      王牌区实际墩数（初始 7，补充墩增加/减少时变化）
         *   _dora_start    首张宝牌（宝5）指针，初始 = _haitei
         *   _rinshan_drawn 岭上已摸次数（0~4）
         *
         *   王牌区内部布局（从 _haitei 向王牌头部）：
         *     [补充墩...] 宝5 宝4 宝3 宝2 宝1 岭2 岭1
         *     王牌尾部（_haitei）→ ... → 王牌头部（_haitei + _dw_count - 1，岭上侧）
         *
         *   摸牌方向：_cursor → ... → 海底 → _haitei（停止）
         *   岭上摸牌：从王牌头部（岭 1）向王牌尾部方向摸取
         */
        this._cursor = this._break % 68;
        this._haitei = (this._cursor - 7 + 68) % 68;
        this._dw_count = 7;
        this._dora_start = this._haitei;  /* 初始无补充墩，首张宝牌 = haitei */

        /* 宝牌指示牌已翻次数 */
        this._dora_flipped = 0;

        /* 岭上摸牌次数 */
        this._rinshan_drawn = 0;

        /* 海底补充到王牌的次数（最多 2 次） */
        this._replenished = 0;

        /* 杠后待开宝牌标志 */
        this._weikaigang = false;

        /* 当前墩上层是否已被摸走（同一墩摸两次才前进游标） */
        this._half_consumed = false;

        /* 牌山关闭标志（立直后里宝不可见） */
        this._closed = false;

        /* 已经翻开的宝牌指示牌列表 */
        this._baopai = [];       /* 初始化时在 _init_dora 中填充 */
        this._fubaopai = null;   /* 初始化时在 _init_dora 中填充 */

        /* 初始化宝牌 */
        this._init_dora();
    }

    /* ===== 内部方法 ===== */

    /**
     * 王牌整体向海底方向移位（填满空墩）
     * 将整个王牌区向 cursor 方向移动 n 墩，不改变 _dw_count。
     */
    _shiftDeadWallTowardCursor(n = 1) {
        const len = this._stacks.length;
        for (let k = 0; k < n; k++) {
            for (let i = 0; i < this._dw_count; i++) {
                const src = (this._haitei + i) % len;
                const dst = (this._haitei - 1 + i + len) % len;
                this._stacks[dst] = this._stacks[src];
            }
            const last = (this._haitei + this._dw_count - 1) % len;
            this._stacks[last] = { top: null, bottom: null };
            this._haitei = (this._haitei - 1 + len) % len;
            this._dora_start = (this._dora_start - 1 + len) % len;
        }
    }

    /**
     * 王牌整体向远离海底方向移位（空出一墩）
     * 将整个王牌区向远离 cursor 方向移动 n 墩，不改变 _dw_count。
     */
    _shiftDeadWallAwayFromCursor(n = 1) {
        const len = this._stacks.length;
        for (let k = 0; k < n; k++) {
            for (let i = this._dw_count - 1; i >= 0; i--) {
                const src = (this._haitei + i) % len;
                const dst = (this._haitei + 1 + i) % len;
                this._stacks[dst] = this._stacks[src];
            }
            this._stacks[this._haitei] = { top: null, bottom: null };
            this._haitei = (this._haitei + 1) % len;
            this._dora_start = (this._dora_start + 1) % len;
        }
    }

    /** 王牌尾部（王牌起始位）= _haitei，即海底+1 */
    _dead_wall_pos() {
        return this._haitei;
    }

    /**
     * 王牌内第 n 墩的栈编号（n 相对首张宝牌）
     *   原王牌顺序: 宝5(n=0) 宝4(1) 宝3(2) 宝2(3) 宝1(4) 岭2(5) 岭1(6)
     */
    _dead_wall_stack(n) {
        return (this._dora_start + n) % this._stacks.length;
    }

    /** 初始化宝牌指示牌 */
    _init_dora() {
        /* 宝 1 的上层 = 初始宝牌指示牌，位置是王牌内第 4 墩 */
        let idx = this._dead_wall_stack(4);
        this._baopai = [this._stacks[idx].top];
        this._dora_flipped = 1;

        /* 里宝牌: 宝 1 的下层 */
        if (this._rule['裏ドラあり']) {
            this._fubaopai = [this._stacks[idx].bottom];
        }

        /* 其余的宝牌在后续 kaigang 时翻 */
    }

    /** 环形游标前进 n 墩 */
    _advance(n) {
        this._cursor = (this._cursor + n) % this._stacks.length;
    }

    /** 返回游标位置当前墩（不推进） */
    _current_stack() {
        return this._stacks[this._cursor];
    }

    /**
     * 海底补充到王牌：开杠摸岭上后，海底墩下/上层依次移入王牌区形成新墩
     *   - 第 1 次（_replenished=0→1）：海底下层 → 新墩下层，海底上层滑落为下层
     *   - 第 2 次（_replenished=1→2）：海底剩余的牌 → 新墩上层，海底完全清空
     * 使用整体移位代替 splice。
     */
    _replenish_haitei() {
        /* 海底墩：王牌起始位的前一墩 */
        const len = this._stacks.length;
        let haitei_idx = (this._haitei - 1 + len) % len;
        let haitei = this._stacks[haitei_idx];

        if (this._replenished === 0) {
            /* 第一次：海底下层 → 新墩下层，海底上层滑落 */
            const bottom_tile = haitei.bottom;
            haitei.bottom = haitei.top;
            haitei.top = null;

            /* 王牌整体远离海底，空出一墩 */
            this._shiftDeadWallAwayFromCursor(1);
            /* 新空出的位置就是旧 haitei（移位后 haitei 已前进 1，旧位置 = haitei-1） */
            const new_pos = (this._haitei - 1 + len) % len;
            this._stacks[new_pos] = { top: null, bottom: bottom_tile };
            this._dw_count++;
            /* haitei 回退指向新补充墩 */
            this._haitei = (this._haitei - 1 + len) % len;
            this._replenished = 1;
        }
        else if (this._replenished === 1) {
            /* 第二次：海底剩下的牌 → 补充墩上层 */
            /* 补充墩是当前王牌区第一墩（haitei 位置） */
            this._stacks[this._haitei].top = haitei.bottom;
            haitei.bottom = null;
            this._replenished = 2;
        }
    }

    /* ===== 公共方法（保持与旧版 API 兼容） ===== */

    /**
     * 常规摸牌
     * 每墩 2 枚，先摸上层，再摸下层，两层摸完才前进游标
     * 若上层为空（海底补充导致），则摸下层并前进
     * 若整墩为空，则跳过前进
     */
    zimo() {
        if (this._closed)     throw new Error('牌山已关闭：不能在和了/流局后摸牌');
        if (this._weikaigang) throw new Error('牌山处于开杠中：不能重复摸牌');

        let stack = this._current_stack();
        let tile;

        if (! this._half_consumed) {
            if (stack.top != null) {
                tile = stack.top;
                stack.top = null;
                this._half_consumed = true;
            }
            else if (stack.bottom != null) {
                /* 上层已被海底搬空，摸下层 */
                tile = stack.bottom;
                stack.bottom = null;
                this._advance(1);
            }
            else {
                /* 整墩已空，跳过 */
                this._advance(1);
                if (this.paishu == 0) throw new Error('牌山已空：尝试从空牌山摸牌 cursor=' + this._cursor + ' stacks=' + this._stacks.length);
                return this.zimo();
            }
        }
        else {
            if (stack.bottom != null) {
                tile = stack.bottom;
                stack.bottom = null;
                this._half_consumed = false;
                this._advance(1);
            }
            else {
                /* 下层也空，前进到下一墩 */
                this._half_consumed = false;
                this._advance(1);
                if (this.paishu == 0) throw new Error('牌山已空：摸牌时上下层都空 cursor=' + this._cursor);
                return this.zimo();
            }
        }

        /* paishu 可能在摸最后一张牌后合法变为 0，由 game.js:393 提前检查 */
        console.log('[wall] zimo: tile=' + tile + ' paishu=' + this.paishu
            + ' cursor=' + this._cursor + '/' + this._stacks.length
            + ' haitei=' + this._haitei + ' dw=' + this._dw_count + ' half=' + this._half_consumed
            + ' ' + this._formatLivingWall()
            + ' ' + this._formatDeadWall());
        return tile;
    }

    /**
     * 岭上摸牌
     * 从王牌最尾端（岭 1）开始摸：上层 → 下层 → 岭 2 上层 → 岭 2 下层
     */
    gangzimo() {
        if (this._closed)              throw new Error('牌山已关闭：不能杠后摸牌');
        if (this._rinshan_drawn >= 4)  throw new Error('岭上摸牌次数已满（最多4次）');
        if (this._weikaigang)          throw new Error('牌山处于开杠中：不能重复杠后摸牌');

        this._weikaigang = this._rule['カンドラあり'];
        if (! this._weikaigang) this._baopai.push('');

        /* 岭 1(墩6) → 岭 2(墩5) */
        let stack_idx = this._rinshan_drawn < 2
            ? this._dead_wall_stack(6)   /* 岭 1 = 王牌内第 6 墩 */
            : this._dead_wall_stack(5);  /* 岭 2 = 王牌内第 5 墩 */

        let tile = this._rinshan_drawn % 2 == 0
            ? this._stacks[stack_idx].top
            : this._stacks[stack_idx].bottom;

        /* 清空摸走的位置 */
        if (this._rinshan_drawn % 2 == 0)
            this._stacks[stack_idx].top = null;
        else
            this._stacks[stack_idx].bottom = null;

        /* 前 2 次杠：海底补充到王牌 */
        if (this._rinshan_drawn < 2) this._replenish_haitei();

        this._rinshan_drawn++;
        return tile;
    }

    /**
     * 开杠宝牌
     * 依次翻：宝 1(已翻) → 宝 2 → 宝 3 → 宝 4 → 宝 5
     */
    kaigang() {
        if (this._closed)       throw new Error('牌山已关闭：不能开杠翻宝牌');
        if (! this._weikaigang) throw new Error('牌山未处于开杠中：开杠翻宝牌前需要先杠后摸牌');

        /* 宝 2 = 王牌内第 3 墩 → 宝 3 = 第 2 墩 → 宝 4 = 第 1 墩 → 宝 5 = 第 0 墩 */
        let dora_order = [3, 2, 1, 0];  /* 宝 2~宝 5 在王牌内的索引 */
        let idx = dora_order[this._dora_flipped - 1];

        this._baopai.push(this._stacks[this._dead_wall_stack(idx)].top);

        if (this._fubaopai && this._rule['カン裏あり']) {
            this._fubaopai.push(
                 this._stacks[this._dead_wall_stack(idx)].bottom);
        }

        this._dora_flipped++;
        this._weikaigang = false;
        return this;
    }

    /** 关闭牌山 */
    close() { this._closed = true; return this }

    /* ===== 牌数 / 宝牌查询 ===== */

    /** 牌山剩余枚数（游标到王牌之间的牌数，直接统计实际牌数） */
    get paishu() {
        if (this._cursor == this._haitei) return 0;

        /* 检查游标是否已落入王牌区 */
        if (this._dw_count > 0 && this._dw_count < this._stacks.length) {
            let dw_start = this._haitei;
            let dw_end = (this._haitei + this._dw_count) % this._stacks.length;
            let cursor_in_dw;
            if (dw_start < dw_end) {
                cursor_in_dw = this._cursor >= dw_start && this._cursor < dw_end;
            } else {
                cursor_in_dw = this._cursor >= dw_start || this._cursor < dw_end;
            }
            if (cursor_in_dw) return 0;
        }

        let stacks_between = (this._haitei
                            - this._cursor + this._stacks.length)
                              % this._stacks.length;
        if (stacks_between == 0) return 0;

        /* cursor 与 haitei 指向同一墩时，只统计该墩实际牌数 */
        if (stacks_between == 1) {
            let stack = this._stacks[this._cursor];
            return Math.max(0, (stack.top ? 1 : 0) + (stack.bottom ? 1 : 0));
        }

        /* stacks_between > 1：分别统计中间完整墩 + cursor 墩 + 海底墩 */
        let tiles = (stacks_between - 2) * 2;

        let cursor_stack = this._stacks[this._cursor];
        tiles += (cursor_stack.top ? 1 : 0) + (cursor_stack.bottom ? 1 : 0);

        let haitei_idx = (this._haitei - 1 + this._stacks.length) % this._stacks.length;
        let haitei_stack = this._stacks[haitei_idx];
        tiles += (haitei_stack.top ? 1 : 0) + (haitei_stack.bottom ? 1 : 0);

        return Math.max(0, tiles);
    }

    /** 已翻开的宝牌指示牌 */
    get baopai() { return this._baopai.filter(x => x) }

    /** 里宝牌（关闭后才能查看） */
    get fubaopai() {
        return ! this._closed ? null
             : this._fubaopai ? this._fubaopai.concat()
             :                  null;
    }

    /* ===== 新增：牌山操作（供技能使用） ===== */

    /** 牌山总墩数 */
    get stackCount() { return this._stacks.length }

    /** 牌山剩余可用牌总数（包括岭上 + 宝牌 + 牌山区） */
    get remainingTiles() {
        let count = 0;
        /* 从游标到王牌前 */
        let s = this._cursor;
        while (s != this._haitei) {
            let stack = this._stacks[s];
            if (stack.top) count++;
            if (stack.bottom) count++;
            s = (s + 1) % this._stacks.length;
        }
        /* 王牌内的牌也算可用（岭上摸牌用，含补充墩） */
        for (let i = 0; i < this._dw_count; i++) {
            let stack = this._stacks[(this._haitei + i) % this._stacks.length];
            if (stack.top) count++;
            if (stack.bottom) count++;
        }
        return count;
    }

    /** 插入一枚牌到当前游标位置之前（技能效果用，牌山加长） */
    insertTile(tile) {
        /* 王牌整体远离海底，空出一墩 */
        this._shiftDeadWallAwayFromCursor(1);
        /* 在旧 haitei 位置放牌（移位后 haitei 已 +1） */
        const len = this._stacks.length;
        const pos = (this._haitei - 1 + len) % len;
        this._stacks[pos] = { top: tile, bottom: null };
        this._dw_count++;
        /* haitei 回退指向新墩 */
        this._haitei = (this._haitei - 1 + len) % len;
        return this;
    }

    /** 获取某墩的信息 */
    getStack(index) {
        index = index % this._stacks.length;
        if (index < 0) index += this._stacks.length;
        return this._stacks[index];
    }

    /** 查看王牌区的第 n 墩（0=宝5, 6=岭1） */
    peekDeadWall(n) {
        return this._stacks[this._dead_wall_stack(n)];
    }

    /**
     * 查看牌山末尾（海底侧）n 张牌，不修改牌山。
     * @param {number} n — 张数
     * @returns {string[]} 末尾 n 张（按摸牌顺序，最后摸到的在前）
     */
    peekWallEnd(n) {
        const result = [];
        const len = this._stacks.length;

        /* 活牌区已空，无牌可看 */
        if (this._cursor === this._haitei) return result;

        let idx = (this._haitei - 1 + len) % len;
        /* 活牌区起点前一墩（沿减方向），越过此墩即进入王牌/已消耗区域 */
        const livingBoundary = (this._cursor - 1 + len) % len;

        while (result.length < n && idx !== livingBoundary) {
            const stack = this._stacks[idx];
            if (stack.bottom != null && result.length < n) {
                result.unshift(stack.bottom);
            }
            if (stack.top != null && result.length < n) {
                result.unshift(stack.top);
            }
            idx = (idx - 1 + len) % len;
        }
        return result;
    }

    /**
     * 格式化牌山活牌区（分上下墩），用于调试日志
     * 显示 cursor 到 dead_wall_start 之间的栈，每墩 [上,下] 表示
     */
    _formatLivingWall() {
        let stacks = [];
        let i = this._cursor;
        let dead = (this._haitei - 1 + this._stacks.length) % this._stacks.length;
        let visited = 0;
        while (visited < this._stacks.length) {
            let s = this._stacks[i];
            let top = s.top || '_';
            let bot = s.bottom || '_';
            if (i === this._cursor) {
                stacks.push('(' + top + ',' + bot + ')');
            } else {
                stacks.push('[' + top + ',' + bot + ']');
            }
            if (i === dead) break;
            i = (i + 1) % this._stacks.length;
            visited++;
        }
        return 'wall[' + stacks.join('') + ']';
    }

    /**
     * 格式化王牌区（分上下墩），用于调试日志
     * 王牌区布局: [补充墩...] 宝5 宝4 宝3 宝2 宝1 岭2 岭1
     */
    _formatDeadWall() {
        let stacks = [];
        let total = this._dw_count;
        for (let i = 0; i < total; i++) {
            let idx = (this._haitei + i) % this._stacks.length;
            let s = this._stacks[idx];
            let top = s.top || '_';
            let bot = s.bottom || '_';
            let label;
            let supp = this._dw_count - 7;
            if (i < supp) {
                label = '补' + (supp - i);
            } else {
                let orig = i - supp;
                if (orig < 5) label = '宝' + (5 - orig);
                else label = '岭' + (7 - orig);
            }
            stacks.push(label + '[' + top + ',' + bot + ']');
        }
        return 'dead[' + stacks.join('') + ']';
    }
};
