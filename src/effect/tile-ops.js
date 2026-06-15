/**
 * 牌操作原子模块 (tile-ops)
 *
 * 对牌山、王牌、宝牌、岭上、手牌进行纯原子操作。不涉及 UI、AI 逻辑。
 * 所有操作均为同步、纯数据处理。
 *
 * ── 牌堆结构 ──
 *
 *   牌山：环形 68 墩（每墩 1 上 1 下），可摸牌范围从 _cursor 到海底牌，
 *   最后一张称为海底牌。摸牌方向：上层 → 下层 → 下一墩。
 *
 *   王牌：初始为牌堆的最后 7 墩，王牌顺序与牌山相反。
 *   初始翻开王牌第 3 墩的上方牌，为初始宝牌指示牌（宝 1），
 *   下方为第 1 张里宝牌指示牌。
 *   宝牌指示牌前的 2 墩称为岭上牌，
 *   宝牌指示牌后的 4 墩，上方为第 2~5 张表宝牌指示牌，下方为第 2~5 张里宝牌指示牌。
 *   开杠后摸取一张岭上牌，并将海底牌移动至王牌尾部形成补充墩。
 *
 *   环形布局（沿摸牌方向）：
 *     _cursor → 活牌区 → 海底(_haitei-1) → [_haitei]王牌尾部 → 王牌区(_dw_count墩) → 王牌头部(岭上) → 空墩区 → 回到_cursor
 *
 *   王牌区内部布局（从王牌尾部 _haitei 向王牌头部）：
 *     [补充墩...] 宝5 宝4 宝3 宝2 宝1 岭2 岭1
 *
 *     宝牌指示牌 (dora indicators):   宝1~宝5 的上层
 *     里宝牌     (ura-dora):          宝1~宝5 的下层
 *     岭上牌     (rinshan):           岭1~岭2 的上/下层（王牌头部）
 *
 * ── 牌山前 ──
 *   peekFront(model, n)             — 查看牌山前 n 张（从游标开始）
 *   popFront(model, n)              — 移除牌山前 n 张（推进游标）
 *   pushFront(model, tiles)         — 向牌山前插入牌
 *
 * ── 海底 ──
 *   peekEnd(model, n)               — 查看牌山末尾（海底）n 张
 *   popEnd(model, n)                — 从海底移除 n 张
 *   pushEnd(model, tiles)           — 向海底追加牌
 *
 * ── 岭上 ──
 *   peekRinshan(model, n)           — 查看岭上 n 张
 *   popRinshan(model, n)            — 从岭上移除 n 张
 *   pushRinshan(model, tiles)       — 向岭上追加牌
 *
 * ── 王牌 ──
 *   peekDeadWall(model, n)          — 查看王牌区（含补充墩）前 n 张
 *   popDeadWall(model, n)           — 从王牌区移除前 n 张
 *   pushDeadWall(model, tiles)      — 向王牌区补充墩追加牌
 *
 * ── 宝牌指示牌 ──
 *   peekDoraIndicators(model, n, includeUnflipped)
 *                                   — 查看前 n 张宝牌指示牌
 *   replaceDoraIndicator(model, index, newTile)
 *                                   — 更换第 index 张表宝牌指示牌
 *   removeDoraIndicator(model, index)
 *                                   — 移除第 index 张表宝牌指示牌
 *
 * ── 里宝牌 ──
 *   peekUraDora(model, n, includeUnrevealed)
 *                                   — 查看前 n 张里宝牌
 *   replaceUraDora(model, index, newTile)
 *                                   — 更换第 index 张里宝牌（仅更换，不移除）
 *
 * ── 手牌 ──
 *   removeFromHand(shoupai, tile)   — 从手牌移除一张
 *   addToHand(shoupai, tile)        — 向手牌添加一张
 *   swapInHand(shoupai, out, in)    — 手牌中交换一张
 */
'use strict';

/* 手牌变更通知回调（保留兼容），由 game 初始化时注入 */
let _onHandChanged = null;

/* 游戏引用，用于操作后自动刷新手牌 UI */
let _game = null;

/**
 * 刷新指定手牌对应的 UI（清理 badge 残留 + redraw + adjust）
 * 联机模式通过 _broadcastData 通知客户端，本地模式直接操作 DOM。
 * @param {Object} shoupai — Majiang.Shoupai 实例
 */
function _refreshHandUI(shoupai) {
    if (_onHandChanged) _onHandChanged(shoupai);
    if (!_game || !_game._model) return;

    /* 找到 shoupai 对应的 seat */
    let seat = -1;
    for (let l = 0; l < 4; l++) {
        if (_game._model.shoupai[l] === shoupai) {
            seat = l;
            break;
        }
    }
    if (seat < 0) return;

    /* 联机模式：发送 hand_sync 到目标玩家（直接传 _bingpai 数组，绕过 fromString 的 14 张截断限制） */
    if (_game._skillPrompt && _game._skillPrompt._sendToSeat) {
        console.log(`[tile-ops] _refreshHandUI: sending hand_sync for seat=${seat} shoupai=${shoupai.toString()}`);
        /* 直接序列化 _bingpai 数据，支持超过 14 张的中间状态手牌 */
        let bp = {};
        for (let s of ['m','p','s','z']) {
            bp[s] = shoupai._bingpai[s].slice();
        }
        bp._ = shoupai._bingpai._;
        _game._skillPrompt._sendToSeat({
            hand_sync: {
                seat: seat,
                bingpai: bp,
                zimo: shoupai._zimo
            }
        }, seat);
        return;
    }

    /* 本地模式：直接操作 DOM */
    if (!_game._view) return;
    let hv = _game._view._view && _game._view._view.shoupai[seat];
    if (!hv) return;
    let $b = hv._node.bingpai;
    /* 清理技能提示 badge 残留 */
    $b.find('.pai-badge-wrap').each(function() {
        $(this).children().unwrap();
    });
    $b.find('.tile-sel-badge').remove();
    $b.find('.pai')
        .removeClass('skill-selectable hand-selected')
        .removeAttr('data-hand-idx')
        .off('click.skillpai');
    hv.redraw();
    hv.adjust();
}

/* ================================================================
 * 内部 helper — 墩下落 & 空墩压缩
 * ================================================================ */

/**
 * 活牌区墩下落：将 living wall 内所有「上层有牌、下层为空」的墩
 * 上层滑落到下层。
 *
 * @param {Object} shan — model.shan
 */
function _slideDownLivingWall(shan) {
    const len = shan._stacks.length;
    if (len === 0) return;
    if (shan._cursor === shan._haitei) return;

    let i = shan._cursor;
    while (i !== shan._haitei) {
        const stack = shan._stacks[i];
        if (stack.top != null && stack.bottom == null) {
            /* cursor 墩且 half_consumed 时上层已摸走，不滑动 */
            if (!(i === shan._cursor && shan._half_consumed)) {
                stack.bottom = stack.top;
                stack.top = null;
            }
        }
        i = (i + 1) % len;
    }
}

/**
 * 压缩活牌区尾部空墩：将王牌整体向海底移位填满空墩。
 * 从海底向前扫描完全为空的墩，每发现一个空墩，王牌整体移位 1 墩。
 *
 * @param {Object} shan — model.shan
 */
function _compressEmptyEnd(shan) {
    if (shan._cursor === shan._haitei) return;

    const len = shan._stacks.length;
    let scan_idx = (shan._haitei - 1 + len) % len;
    let empty_count = 0;

    while (scan_idx !== shan._cursor) {
        const s = shan._stacks[scan_idx];
        if (s.top == null && s.bottom == null) {
            empty_count++;
            scan_idx = (scan_idx - 1 + len) % len;
        } else {
            break;
        }
    }

    if (empty_count > 0) {
        shan._shiftDeadWallTowardCursor(empty_count);
    }
}

/**
 * 活牌区完整维护：下滑 + 压缩。
 * @param {Object} shan
 */
function _maintainLivingWall(shan) {
    _slideDownLivingWall(shan);
    _compressEmptyEnd(shan);
}

/* ================================================================
 * 牌山前 (front, at cursor)
 * ================================================================ */

/**
 * 查看牌山前 n 张牌（从游标位置开始，沿摸牌方向）。
 *
 * @param {Object} model — Game._model
 * @param {number} n     — 要查看的张数
 * @returns {string[]} 牌山前 n 张牌
 */
function peekFront(model, n) {
    const shan = model.shan;
    const tiles = [];
    if (n <= 0 || shan._cursor === shan._haitei) return tiles;

    let i = shan._cursor;
    const len = shan._stacks.length;
    /* 当前墩上层可能已被半消费 */
    const startHalf = shan._half_consumed;
    let half = startHalf;

    while (tiles.length < n && i !== shan._haitei) {
        const stack = shan._stacks[i];
        if (i === shan._cursor && half) {
            /* 上层已摸走，直接从下层开始 */
            if (stack.bottom != null) tiles.push(stack.bottom);
        } else {
            if (stack.top != null && tiles.length < n) tiles.push(stack.top);
            if (stack.bottom != null && tiles.length < n) tiles.push(stack.bottom);
        }
        half = false;
        i = (i + 1) % len;
    }
    return tiles;
}

/**
 * 从牌山前移除 n 张牌（沿摸牌方向移除，推进游标）。
 *
 * @param {Object} model — Game._model
 * @param {number} n     — 要移除的张数
 * @returns {string[]} 被移除的牌
 */
function popFront(model, n) {
    const shan = model.shan;
    const removed = [];
    if (n <= 0) return removed;

    const len = shan._stacks.length;
    let i = shan._cursor;
    let half = shan._half_consumed;

    while (removed.length < n && i !== shan._haitei) {
        const stack = shan._stacks[i];
        if (i === shan._cursor && half) {
            /* 上层已消费 */
            if (stack.bottom != null) {
                removed.push(stack.bottom);
                stack.bottom = null;
            }
            /* 进到下一墩 */
            half = false;
            i = (i + 1) % len;
        } else {
            if (stack.top != null && removed.length < n) {
                removed.push(stack.top);
                stack.top = null;
                if (i === shan._cursor) shan._half_consumed = true;
            }
            if (stack.bottom != null && removed.length < n) {
                removed.push(stack.bottom);
                stack.bottom = null;
                /* 上下层都消费完 → 前进 */
                if (i === shan._cursor) shan._half_consumed = false;
                half = false;
                i = (i + 1) % len;
            } else if (i === shan._cursor && shan._half_consumed) {
                /* 上层已消费，下层为空 → 跳过此墩 */
                shan._half_consumed = false;
                half = false;
                i = (i + 1) % len;
            }
        }
    }

    shan._cursor = i;
    if (shan._cursor === shan._haitei) {
        shan._half_consumed = false;
    }
    _maintainLivingWall(shan);
    return removed;
}

/**
 * 向牌山前（游标位置）插入牌。
 *
 * @param {Object} model  — Game._model
 * @param {string[]} tiles — 要插入的牌（按摸牌顺序，tiles[0] 最先被摸到）
 */
function pushFront(model, tiles) {
    const shan = model.shan;
    if (!tiles || tiles.length === 0) return;

    /* 每插入一张牌，王牌整体远离海底空出一墩 */
    for (let k = tiles.length - 1; k >= 0; k--) {
        shan._shiftDeadWallAwayFromCursor(1);
        /* 移位后旧 haitei 位置 = (haitei - 1)，放入新墩 */
        const len = shan._stacks.length;
        const pos = (shan._haitei - 1 + len) % len;
        shan._stacks[pos] = { top: tiles[k], bottom: null };
        shan._dw_count++;
        /* haitei 回退指向新墩 */
        shan._haitei = (shan._haitei - 1 + len) % len;
    }
    /* cursor 不变 */
    _maintainLivingWall(shan);
}

/**
 * 替换牌山前（游标侧）指定位置的牌，不移动其他牌。
 * index 与 peekFront 返回值索引一致（正向），index 0 = 游标处第一张。
 *
 * @param {Object} model  — Game._model
 * @param {number} index  — 目标位置（与 peekFront 同序）
 * @param {string} newTile — 新牌
 * @returns {boolean} 是否成功
 */
function swapWallFront(model, index, newTile) {
    const shan = model.shan;
    const len = shan._stacks.length;
    if (shan._cursor === shan._haitei) return false;

    let i = shan._cursor;
    let remaining = index;
    let half = shan._half_consumed;

    while (i !== shan._haitei) {
        const stack = shan._stacks[i];

        if (i === shan._cursor && half) {
            /* 游标墩上层已摸走，只检查下层 */
            if (stack.bottom != null) {
                if (remaining === 0) { stack.bottom = newTile; return true; }
                remaining--;
            }
        } else {
            /* 上层先，下层后（与 peekFront 同序） */
            if (stack.top != null) {
                if (remaining === 0) { stack.top = newTile; return true; }
                remaining--;
            }
            if (stack.bottom != null) {
                if (remaining === 0) { stack.bottom = newTile; return true; }
                remaining--;
            }
        }

        i = (i + 1) % len;
    }
    return false;
}

/* ================================================================
 * 海底 (end, haitei = just before dead_wall_start)
 * ================================================================ */

/**
 * 查看牌山末尾（海底侧）n 张牌。
 *
 * @param {Object} model — Game._model
 * @param {number} n     — 张数
 * @returns {string[]} 末尾 n 张（倒数第二张在前，海底牌在后）
 */
function peekEnd(model, n) {
    /* peekWallEnd 从海底向前遍历用 unshift，结果顺序为 [倒数第二张, 海底牌]。
     * swapWallEnd 走 bottom→top 遍历，index 0 = 海底牌，二者索引相反。 */
    return model.shan.peekWallEnd(n);
}

/**
 * 从牌山末尾（海底）移除 n 张牌。
 *
 * @param {Object} model — Game._model
 * @param {number} n     — 张数
 * @returns {string[]} 被移除的牌
 */
function popEnd(model, n) {
    const shan = model.shan;
    const moved = [];
    const len = shan._stacks.length;

    /* 活牌区已空（cursor 已追上 haitei），无牌可移 */
    if (shan._cursor === shan._haitei) return moved;

    let idx = (shan._haitei - 1 + len) % len;
    /* 活牌区起点前一墩（沿减方向），越过此墩即进入王牌/已消耗区域 */
    const livingBoundary = (shan._cursor - 1 + len) % len;

    while (moved.length < n && idx !== livingBoundary) {
        const stack = shan._stacks[idx];
        if (stack.bottom != null && moved.length < n) {
            moved.unshift(stack.bottom);
            stack.bottom = null;
        }
        if (stack.top != null && moved.length < n) {
            moved.unshift(stack.top);
            stack.top = null;
        }
        idx = (idx - 1 + len) % len;
    }

    /* 海底墩只剩上层时滑落 */
    _maintainLivingWall(shan);
    return moved;
}

/**
 * 向海底（牌山末尾）追加牌。
 *
 * @param {Object} model  — Game._model
 * @param {string[]} tiles — 要追加的牌（按摸牌顺序，tiles[0] 先被摸到，tiles[最后] 最靠海底）
 */
function pushEnd(model, tiles) {
    const shan = model.shan;
    if (!tiles || tiles.length === 0) return;

    /* 两张一组构成完整墩，单张构成半墩；新增墩属于活牌区（海底） */
    for (let k = tiles.length - 1; k >= 0; k--) {
        shan._shiftDeadWallAwayFromCursor(1);
        const len = shan._stacks.length;
        const pos = (shan._haitei - 1 + len) % len;

        if (k >= 1) {
            /* 两张牌构成完整一墩：上层 tiles[k]，下层 tiles[k-1] */
            shan._stacks[pos] = { top: tiles[k], bottom: tiles[k - 1] };
            k--; /* 已消费下一张作为下层 */
        } else {
            /* 单张牌构成半墩 */
            shan._stacks[pos] = { top: tiles[k], bottom: null };
        }
        /* 不移 haitei、不增 _dw_count：新增墩属于活牌区（海底），非王牌 */
    }
    /* 让上层滑落到下层 */
    _maintainLivingWall(shan);
}

/**
 * 替换海底指定位置的牌，不移动其他牌、不改牌山结构。
 * index 与 peekWallEnd 遍历顺序一致（先 bottom 后 top）：
 *   qty=2 时 index 0 = 海底牌, index 1 = 倒数第二张
 *   qty=1 时 index 0 = 海底牌
 * 注意：与 peekEnd 返回值索引相反 — peekEnd[0] = 倒数第二张, peekEnd[1] = 海底牌
 *
 * @param {Object} model  — Game._model
 * @param {number} index  — 目标位置
 * @param {string} newTile — 新牌
 * @returns {boolean} 是否成功
 */
function swapWallEnd(model, index, newTile) {
    const shan = model.shan;
    const len = shan._stacks.length;

    /* 活牌区已空，无法交换 */
    if (shan._cursor === shan._haitei) return false;

    let idx = (shan._haitei - 1 + len) % len;
    const livingBoundary = (shan._cursor - 1 + len) % len;
    let remaining = index;

    while (idx !== livingBoundary) {
        const stack = shan._stacks[idx];

        /* 先 bottom（海底牌）、再 top（倒数第二张），与 peekEnd 的 push 顺序一致 */
        if (stack.bottom != null) {
            if (remaining === 0) {
                stack.bottom = newTile;
                return true;
            }
            remaining--;
        }
        if (stack.top != null) {
            if (remaining === 0) {
                stack.top = newTile;
                return true;
            }
            remaining--;
        }

        idx = (idx - 1 + len) % len;
    }

    return false;
}

/* ================================================================
 * 岭上 (rinshan)
 *
 * 岭上摸牌顺序: 岭1上层 → 岭1下层 → 岭2上层 → 岭2下层
 * _dead_wall_stack(6) = 岭1, _dead_wall_stack(5) = 岭2
 * ================================================================ */

/**
 * 查看岭上前 n 张牌（不含已摸走的）。
 *
 * @param {Object} model — Game._model
 * @param {number} n     — 张数
 * @returns {string[]} 岭上牌
 */
function peekRinshan(model, n) {
    const shan = model.shan;
    const tiles = [];
    const drawn = shan._rinshan_drawn;
    const max = 4 - drawn;
    const count = Math.min(n, max);
    if (count <= 0) return tiles;

    for (let k = 0; k < count; k++) {
        const pos = drawn + k;
        const stack_n = pos < 2 ? 6 : 5;  /* 岭1(n=6) or 岭2(n=5) */
        const stack_idx = shan._dead_wall_stack(stack_n);
        const slot = pos % 2 === 0 ? 'top' : 'bottom';
        const tile = shan._stacks[stack_idx][slot];
        if (tile != null) tiles.push(tile);
    }
    return tiles;
}

/**
 * 从岭上移除 n 张牌。
 *
 * @param {Object} model — Game._model
 * @param {number} n     — 张数
 * @returns {string[]} 被移除的牌
 */
function popRinshan(model, n) {
    const shan = model.shan;
    const removed = [];
    const drawn = shan._rinshan_drawn;
    const max = 4 - drawn;
    const count = Math.min(n, max);
    if (count <= 0) return removed;

    for (let k = 0; k < count; k++) {
        const pos = drawn + k;
        const stack_n = pos < 2 ? 6 : 5;
        const stack_idx = shan._dead_wall_stack(stack_n);
        const slot = pos % 2 === 0 ? 'top' : 'bottom';
        const tile = shan._stacks[stack_idx][slot];
        if (tile != null) {
            removed.push(tile);
            shan._stacks[stack_idx][slot] = null;
        }
    }

    shan._rinshan_drawn += removed.length;

    /* 岭上摸牌后海底补充（与原 gangzimo 逻辑一致） */
    if (shan._rinshan_drawn <= 3 && drawn < 2 && shan._rinshan_drawn >= 1) {
        /* 触发一次或两次 replenish，需要判断 */
        for (let r = drawn; r < Math.min(shan._rinshan_drawn, 2); r++) {
            shan._replenish_haitei();
        }
    }

    return removed;
}

/**
 * 向岭上追加牌。
 * 优先填充已被摸空的位置，再追加到岭上末端。
 *
 * @param {Object} model  — Game._model
 * @param {string[]} tiles — 要追加的牌
 */
function pushRinshan(model, tiles) {
    const shan = model.shan;
    if (!tiles || tiles.length === 0) return;

    let remaining = tiles.slice();

    /* 先填充已摸空的岭上位置 */
    for (let pos = 0; pos < 4 && remaining.length > 0; pos++) {
        const stack_n = pos < 2 ? 6 : 5;
        const stack_idx = shan._dead_wall_stack(stack_n);
        const slot = pos % 2 === 0 ? 'top' : 'bottom';
        if (shan._stacks[stack_idx][slot] == null) {
            shan._stacks[stack_idx][slot] = remaining.shift();
        }
    }

    /* 若还有剩余 → 在岭上末端追加新墩（王牌头部，远离海底方向） */
    while (remaining.length > 0) {
        /* 岭1(n=6) 是王牌最后一墩，在其后方（远离海底方向）插入 */
        const len = shan._stacks.length;
        const rinshan1_idx = shan._dead_wall_stack(6);
        /* 在岭1后一墩位置写入，需要王牌整体远离海底空出位置 */
        /* 王牌头部扩充，直接写入 (haitei + dw_count) 位置 */
        const insert_pos = (shan._haitei + shan._dw_count) % len;
        const tile = remaining.shift();
        shan._stacks[insert_pos] = { top: tile, bottom: null };
        shan._dw_count++;
        /* 王牌尾部扩充了，dora_start 不变 */
    }
}

/* ================================================================
 * 王牌区 (dead wall general)
 *
 * 王牌区 = 补充墩 + 原王牌(7墩)
 * 从 dead_wall_start 开始遍历即为王牌区顺序。
 * ================================================================ */

/**
 * 查看王牌区前 n 张牌（含补充墩，从王牌起始位开始）。
 *
 * @param {Object} model — Game._model
 * @param {number} n     — 张数
 * @returns {string[]} 王牌区前 n 张
 */
function peekDeadWall(model, n) {
    const shan = model.shan;
    const tiles = [];
    if (n <= 0) return tiles;

    const count = Math.min(n, shan._dw_count * 2);
    let i = shan._haitei;
    let collected = 0;

    while (collected < count) {
        const stack = shan._stacks[i];
        if (stack.top != null && collected < count) {
            tiles.push(stack.top);
            collected++;
        }
        if (stack.bottom != null && collected < count) {
            tiles.push(stack.bottom);
            collected++;
        }
        i = (i + 1) % shan._stacks.length;
    }
    return tiles;
}

/**
 * 从王牌区移除前 n 张牌。
 * 优先从补充墩移除，不足再从原王牌墩移除。
 *
 * @param {Object} model — Game._model
 * @param {number} n     — 张数
 * @returns {string[]} 被移除的牌
 */
function popDeadWall(model, n) {
    const shan = model.shan;
    const removed = [];
    if (n <= 0) return removed;

    const len = shan._stacks.length;
    let i = shan._haitei;
    let dw_scanned = 0;

    while (removed.length < n && dw_scanned < shan._dw_count) {
        const stack = shan._stacks[i];
        if (stack.top != null && removed.length < n) {
            removed.push(stack.top);
            stack.top = null;
        }
        if (stack.bottom != null && removed.length < n) {
            removed.push(stack.bottom);
            stack.bottom = null;
        }
        /* 整墩都空了 → 若在补充墩区则移除该墩（王牌整体向海底移位） */
        if (stack.top == null && stack.bottom == null && dw_scanned < (shan._dw_count - 7)) {
            /* 补充墩在 haitei 处，整体移位 1 墩填满空墩 */
            shan._shiftDeadWallTowardCursor(1);
            shan._dw_count--;
            /* 不前进 i，因为移位后 haitei 位置是新墩 */
            dw_scanned++;
            continue;
        }
        i = (i + 1) % len;
        dw_scanned++;
    }

    /* 压缩移除后可能产生的空墩 */
    _compressDeadWallEmpty(shan);
    return removed;
}

/**
 * 压缩王牌区内部空墩。
 * @param {Object} shan
 */
function _compressDeadWallEmpty(shan) {
    const len = shan._stacks.length;
    let i = shan._haitei;
    const supp = shan._dw_count - 7;
    let empty_count = 0;

    for (let k = 0; k < shan._dw_count; k++) {
        const stack = shan._stacks[i];
        if (stack.top == null && stack.bottom == null && k < supp) {
            empty_count++;
        }
        i = (i + 1) % len;
    }

    /* 批量移位去除空墩 */
    if (empty_count > 0) {
        /* 先逐个清除空墩：移位 + 缩减 dw_count */
        for (let j = 0; j < empty_count; j++) {
            shan._shiftDeadWallTowardCursor(1);
            shan._dw_count--;
        }
    }
}

/**
 * 向王牌区补充墩追加牌。
 *
 * @param {Object} model  — Game._model
 * @param {string[]} tiles — 要追加的牌
 */
function pushDeadWall(model, tiles) {
    const shan = model.shan;
    if (!tiles || tiles.length === 0) return;

    if (tiles.length === 2) {
        /* 两张牌：王牌整体远离海底空出一墩 */
        shan._shiftDeadWallAwayFromCursor(1);
        const len = shan._stacks.length;
        const pos = (shan._haitei - 1 + len) % len;
        shan._stacks[pos] = { top: tiles[1], bottom: tiles[0] };
        shan._dw_count++;
        /* haitei 回退指向新墩 */
        shan._haitei = (shan._haitei - 1 + len) % len;
    } else if (tiles.length === 1) {
        /* 一张牌：先检查 haitei 位置是否有半墩可以填充 */
        const stack = shan._stacks[shan._haitei];
        if (stack && stack.bottom != null && stack.top == null) {
            /* 半墩：将上层设为下层，下层用新牌 */
            stack.top = stack.bottom;
            stack.bottom = tiles[0];
        } else {
            /* 建新墩 */
            shan._shiftDeadWallAwayFromCursor(1);
            const len = shan._stacks.length;
            const pos = (shan._haitei - 1 + len) % len;
            shan._stacks[pos] = { top: null, bottom: tiles[0] };
            shan._dw_count++;
            /* haitei 回退指向新墩 */
            shan._haitei = (shan._haitei - 1 + len) % len;
        }
    }
}

/**
 * 查看王牌尾部 n 张牌（尾部 = 远离岭上的一端）。
 * 从尾部向岭上方向遍历，结果为正序：[离岭上最近, ..., 离尾部最近]。
 *
 * @param {Object} model — Game._model
 * @param {number} n     — 张数
 * @returns {string[]} 王牌尾部 n 张（正向序）
 */
function peekDeadWallEnd(model, n) {
    const shan = model.shan;
    const result = [];
    const len = shan._stacks.length;

    /* 王牌尾部 = haitei（海底+1），从尾部向岭上方向遍历 */
    let idx = shan._haitei;
    let checked = 0;

    while (result.length < n && checked < shan._dw_count) {
        const stack = shan._stacks[idx];
        /* 每墩先下层后上层（与牌山遍历顺序一致） */
        if (stack.bottom != null && result.length < n) {
            result.unshift(stack.bottom);
        }
        if (stack.top != null && result.length < n) {
            result.unshift(stack.top);
        }
        idx = (idx + 1) % len;
        checked++;
    }
    return result;
}

/**
 * 替换王牌尾部指定位置的牌，不移动其他牌。
 * index 从尾部往前数（与 peekDeadWallEnd 索引相反）：
 *   index 0 = 最靠近尾部的牌（peekDeadWallEnd 结果的最后一个元素）
 *
 * @param {Object} model  — Game._model
 * @param {number} index  — 目标位置（从尾部起算）
 * @param {string} newTile — 新牌
 * @returns {boolean} 是否成功
 */
function swapDeadWallEnd(model, index, newTile) {
    const shan = model.shan;
    const len = shan._stacks.length;

    /* 王牌尾部 = haitei（海底+1），从尾部向岭上方向遍历 */
    let idx = shan._haitei;
    let checked = 0;
    let remaining = index;

    while (checked < shan._dw_count) {
        const stack = shan._stacks[idx];

        /* 与 peekDeadWallEnd 同序遍历（先 bottom 后 top），index 0 = 尾部第一张 */
        if (stack.bottom != null) {
            if (remaining === 0) { stack.bottom = newTile; return true; }
            remaining--;
        }
        if (stack.top != null) {
            if (remaining === 0) { stack.top = newTile; return true; }
            remaining--;
        }

        idx = (idx + 1) % len;
        checked++;
    }
    return false;
}

/* ================================================================
 * 宝牌指示牌 (dora indicators)
 *
 * 宝牌指示牌位置映射（_baopai 索引 → 王牌内墩号 n）：
 *   index=0 → 宝1 → _dead_wall_stack(4) top
 *   index=1 → 宝2 → _dead_wall_stack(3) top
 *   index=2 → 宝3 → _dead_wall_stack(2) top
 *   index=3 → 宝4 → _dead_wall_stack(1) top
 *   index=4 → 宝5 → _dead_wall_stack(0) top
 *
 * _dora_flipped = 已翻开的张数（1~5）
 * ================================================================ */

/** 宝牌指示牌索引 → 王牌墩号 */
function _doraIndexToStackN(index) {
    return 4 - index;  /* index 0→n4(宝1), 1→n3(宝2), ... 4→n0(宝5) */
}

/**
 * 查看前 n 张宝牌指示牌。
 *
 * @param {Object}  model            — Game._model
 * @param {number}  n                — 张数
 * @param {boolean} includeUnflipped — 是否包含未翻开的宝牌指示牌
 * @returns {string[]} 宝牌指示牌
 */
function peekDoraIndicators(model, n, includeUnflipped) {
    const shan = model.shan;
    const results = [];
    if (n <= 0) return results;

    /* 已翻开的 */
    const flipped = shan._baopai.filter(x => x);
    for (let i = 0; i < Math.min(n, flipped.length); i++) {
        results.push(flipped[i]);
    }

    /* 未翻开的 */
    if (includeUnflipped && results.length < n) {
        const firstUnflippedN = 4 - shan._dora_flipped;
        for (let ni = firstUnflippedN; ni >= 0 && results.length < n; ni--) {
            const idx = shan._dead_wall_stack(ni);
            const tile = shan._stacks[idx].top;
            if (tile != null) results.push(tile);
        }
    }

    return results;
}

/**
 * 更换第 index 张表宝牌指示牌。
 * 同时更新 _baopai 数组和对应王牌墩的上层牌。
 *
 * @param {Object} model   — Game._model
 * @param {number} index   — 第几张（0-based，对应 _baopai 索引）
 * @param {string} newTile — 新宝牌指示牌
 * @returns {string} 被替换的旧牌
 */
function replaceDoraIndicator(model, index, newTile) {
    const shan = model.shan;
    if (index < 0 || index >= shan._baopai.length) {
        throw new Error('Invalid dora indicator index: ' + index);
    }
    const old = shan._baopai[index];
    shan._baopai[index] = newTile;

    /* 同步更新王牌墩的上层牌 */
    const stackN = _doraIndexToStackN(index);
    const stackIdx = shan._dead_wall_stack(stackN);
    shan._stacks[stackIdx].top = newTile;

    return old;
}

/**
 * 移除第 index 张表宝牌指示牌。
 * 将 _baopai[index] 置空，对应王牌墩上层也置空。
 * 后面的宝牌指示牌不自动前移。
 *
 * @param {Object} model — Game._model
 * @param {number} index — 第几张（0-based）
 * @returns {string} 被移除的牌
 */
function removeDoraIndicator(model, index) {
    const shan = model.shan;
    if (index < 0 || index >= shan._baopai.length) {
        throw new Error('Invalid dora indicator index: ' + index);
    }
    const old = shan._baopai[index];
    shan._baopai[index] = '';

    /* 同步清空王牌墩的上层牌 */
    const stackN = _doraIndexToStackN(index);
    const stackIdx = shan._dead_wall_stack(stackN);
    shan._stacks[stackIdx].top = null;

    return old;
}

/* ================================================================
 * 里宝牌 (ura-dora)
 *
 * 里宝牌位置映射（_fubaopai 索引 → 王牌内墩号 n 的下层）：
 *   与表宝牌相同 index → n 映射，但取 bottom 而非 top
 * 里宝牌只能更换，不能移除。
 * 若 _fubaopai 为 null（规则未启用），replace 为 no-op 并返回 null。
 * ================================================================ */

/**
 * 查看前 n 张里宝牌。
 *
 * @param {Object}  model              — Game._model
 * @param {number}  n                  — 张数
 * @param {boolean} includeUnrevealed  — 是否包含未翻开的里宝牌
 * @returns {string[]} 里宝牌（牌山未关闭时仅 includeUnrevealed=true 可见未翻开的）
 */
function peekUraDora(model, n, includeUnrevealed) {
    const shan = model.shan;
    const results = [];
    if (n <= 0) return results;

    if (shan._fubaopai) {
        /* 已翻开的（关闭后可见） */
        const revealed = shan._fubaopai.filter(x => x);
        for (let i = 0; i < Math.min(n, revealed.length); i++) {
            results.push(revealed[i]);
        }
    }

    /* 未翻开的（无论是否关闭，直接从王牌墩读取） */
    if (includeUnrevealed && results.length < n) {
        const firstUnrevealedN = 4 - shan._dora_flipped;
        for (let ni = firstUnrevealedN; ni >= 0 && results.length < n; ni--) {
            const idx = shan._dead_wall_stack(ni);
            const tile = shan._stacks[idx].bottom;
            if (tile != null) results.push(tile);
        }
    }

    return results;
}

/**
 * 更换第 index 张里宝牌。
 * 仅更换，不移除。同时更新 _fubaopai 和对应王牌墩的下层牌。
 *
 * @param {Object} model   — Game._model
 * @param {number} index   — 第几张（0-based）
 * @param {string} newTile — 新里宝牌
 * @returns {string|null} 被替换的旧牌（_fubaopai 为 null 时返回 null）
 */
function replaceUraDora(model, index, newTile) {
    const shan = model.shan;
    if (!shan._fubaopai) return null;

    if (index < 0 || index >= shan._fubaopai.length) {
        throw new Error('Invalid ura-dora index: ' + index);
    }
    const old = shan._fubaopai[index];
    shan._fubaopai[index] = newTile;

    /* 同步更新王牌墩的下层牌 */
    const stackN = _doraIndexToStackN(index);
    const stackIdx = shan._dead_wall_stack(stackN);
    shan._stacks[stackIdx].bottom = newTile;

    return old;
}

/* ================================================================
 * 手牌操作
 * ================================================================ */

/**
 * 从手牌中移除一张牌。
 *
 * @param {Object} shoupai — Majiang.Shoupai 实例
 * @param {string} tile    — 要移除的牌，如 'm1'、'p0'
 */
function removeFromHand(shoupai, tile) {
    const s = tile[0];
    const n = +tile[1];
    shoupai.decrease(s, n);
    if (shoupai._zimo && shoupai._zimo.length <= 2 && shoupai._zimo === tile) {
        shoupai._zimo = null;
    }
    _refreshHandUI(shoupai);
}

/**
 * 向手牌中添加一张牌。
 *
 * @param {Object} shoupai — Majiang.Shoupai 实例
 * @param {string} tile    — 要添加的牌，如 'm1'、'p0'
 */
function addToHand(shoupai, tile) {
    shoupai.zimo(tile, false);
    _refreshHandUI(shoupai);
}

/**
 * 手牌中交换一张牌。
 *
 * @param {Object} shoupai — Majiang.Shoupai 实例
 * @param {string} outTile — 要移除的牌
 * @param {string} inTile  — 要添加的牌
 */
function swapInHand(shoupai, outTile, inTile) {
    removeFromHand(shoupai, outTile);
    addToHand(shoupai, inTile);
}

/* ================================================================
 * 导出
 * ================================================================ */

module.exports = {
    /* 牌山前 */
    peekFront,
    popFront,
    pushFront,
    swapWallFront,
    /* 海底 */
    peekEnd,
    popEnd,
    pushEnd,
    swapWallEnd,
    /* 岭上 */
    peekRinshan,
    popRinshan,
    pushRinshan,
    /* 王牌 */
    peekDeadWall,
    popDeadWall,
    pushDeadWall,
    peekDeadWallEnd,
    swapDeadWallEnd,
    /* 宝牌指示牌 */
    peekDoraIndicators,
    replaceDoraIndicator,
    removeDoraIndicator,
    /* 里宝牌 */
    peekUraDora,
    replaceUraDora,
    /* 手牌 */
    removeFromHand,
    addToHand,
    swapInHand,
    /* 手牌变更回调 */
    setHandChangeCallback: function(cb) { _onHandChanged = cb; },
    /** 注入游戏引用，使 addToHand / removeFromHand 自动刷新手牌 UI */
    setGame: function(g) { console.log('[tile-ops] setGame called, g:', !!g); _game = g; },
};
