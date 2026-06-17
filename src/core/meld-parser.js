/*
 *  Majiang.MeldParser — Mianzi 字符串格式解析/生成
 *
 *  新统一格式：
 *    TYPE:TILE|TILE|TILE[dir][|TILE]
 *
 *    - TYPE:  chi / pon / minkan / kakan / ankan
 *    - TILE:  [mpsz][0-9]（红5 用 0）
 *    - dir:   +（下家）/ =（对家）/ -（上家），附加在被叫牌上，暗杠无
 *
 *    MeldMeta = {
 *        type:            "chi"|"pon"|"minkan"|"kakan"|"ankan",
 *        tiles:           string[],   // 所有组成牌
 *        fromSeat:        0|1|2|null, // 0=下家, 1=对家, 2=上家, null=暗杠
 *        calledTileIndex: number|null // tiles 中被叫牌的索引
 *    }
 *
 *  兼容读取旧格式（fromString 等场景）：
 *    s1-23 → {type:"chi", tiles:["s1","s2","s3"], fromSeat:2, calledTileIndex:0}
 *    m34-0 → {type:"chi", tiles:["m3","m4","m0"], fromSeat:2, calledTileIndex:0}
 *    z222= → {type:"pon", tiles:["z2","z2","z2"], fromSeat:1, calledTileIndex:0}
 *    m5555+ → {type:"minkan", tiles:["m5","m5","m5","m5"], fromSeat:0, calledTileIndex:0}
 *    p111=1 → {type:"kakan", tiles:["p1","p1","p1","p1"], fromSeat:1, calledTileIndex:0}
 *    s3333 → {type:"ankan", tiles:["s3","s3","s3","s3"], fromSeat:null, calledTileIndex:null}
 */
"use strict";

const MAJIANG_REGEX = /^[mpsz][0-9]$/;

const DIRECTION_MAP = { '+': 0, '=': 1, '-': 2 };
const SEAT_MAP      = { 0: '+', 1: '=', 2: '-' };

const VALID_TYPE = new Set(['chi','pon','minkan','kakan','ankan']);

module.exports = {

    /**
     * 检测是否为新格式 mianzi 字符串（以 TYPE: 开头）
     */
    isNewFormat(m) {
        return /^(chi|pon|minkan|kakan|ankan):/.test(m);
    },

    /**
     * 校验 & 规范化 mianzi 字符串（仅新格式）
     * @param {string} m — mianzi 字符串
     * @returns {string|null} 规范化后的字符串，非法则返回 null
     */
    validMianzi(m) {
        if (!m || typeof m !== 'string') return null;

        // 检测并分发
        if (this.isNewFormat(m)) return this._validNewFormat(m);
        return null;  // 旧格式不在此处通过
    },

    /**
     * 校验新格式 mianzi
     */
    _validNewFormat(m) {
        let match = m.match(/^(chi|pon|minkan|kakan|ankan):(.+)$/);
        if (!match) return null;

        let type = match[1];
        let body = match[2];

        // 按 | 分割
        let parts = body.split('|');
        if (parts.length < 3 || parts.length > 4) return null;

        let tiles = [];
        let hasDir = false, direction = null, calledIdx = null;

        for (let i = 0; i < parts.length; i++) {
            let p = parts[i];

            // 提取方向标记
            let dMatch = p.match(/[\+\=\-]$/);
            if (dMatch) {
                if (hasDir) return null;  // 只能有一个方向标记
                hasDir = true;
                direction = dMatch[0];
                calledIdx = i;
                p = p.slice(0, -1);  // 去掉方向标记
            }

            if (!MAJIANG_REGEX.test(p)) return null;
            tiles.push(p);
        }

        // 暗杠不能有方向
        if (type === 'ankan' && hasDir) return null;

        // 非暗杠必须有方向（除非是异形副露？不，标准非暗杠都需要方向）
        if (type !== 'ankan' && !hasDir) return null;

        // 重建规范化字符串
        let resultParts = tiles.map((t, i) => {
            if (i === calledIdx && direction) return t + direction;
            return t;
        });

        return type + ':' + resultParts.join('|');
    },

    /**
     * MeldMeta → 新格式 mianzi 字符串
     * @param {object} meta — { type, tiles[], fromSeat, calledTileIndex }
     * @returns {string}
     */
    toMianziString(meta) {
        let { type, tiles, fromSeat, calledTileIndex } = meta;
        let dir = fromSeat != null ? SEAT_MAP[fromSeat] : '';

        let parts = tiles.map((t, i) => {
            if (i === calledTileIndex && dir) return t + dir;
            return t;
        });

        return type + ':' + parts.join('|');
    },

    /**
     * 解析 mianzi 字符串 → MeldMeta
     * 兼容新旧两种格式
     * @param {string} str — mianzi 字符串
     * @returns {object|null} — MeldMeta 或 null
     */
    parseMianzi(str) {
        if (!str || typeof str !== 'string') return null;

        if (this.isNewFormat(str)) return this._parseNewFormat(str);
        return this._parseOldFormat(str);
    },

    /**
     * 解析新格式
     */
    _parseNewFormat(str) {
        str = this.validMianzi(str);
        if (!str) return null;

        let match = str.match(/^(chi|pon|minkan|kakan|ankan):(.+)$/);
        let type = match[1];
        let parts = match[2].split('|');

        let tiles = [];
        let direction = null, calledIdx = null;

        for (let i = 0; i < parts.length; i++) {
            let dMatch = parts[i].match(/[\+\=\-]$/);
            if (dMatch) {
                direction = dMatch[0];
                calledIdx = i;
                tiles.push(parts[i].slice(0, -1));
            } else {
                tiles.push(parts[i]);
            }
        }

        let fromSeat = direction ? DIRECTION_MAP[direction] : null;

        return { type, tiles, fromSeat, calledTileIndex: calledIdx };
    },

    /**
     * 解析旧格式（兼容读取）
     * 支持的旧格式：
     *   chi:    s1-23, s2-34, s3-45, m34-0
     *   pon:    z222=, p111+
     *   minkan: m5555+, p1111-
     *   kakan:  p111=1, m555+5
     *   ankan:  s3333, m5555
     */
    _parseOldFormat(str) {
        // 禁例：字牌不能含 0/8/9
        if (str.match(/^z.*[089]/)) return null;

        let h = str.replace(/0/g, '5');
        let s = str[0];  // 花色（旧格式所有牌同花色）

        // 暗杠：sXXXX，无方向标记
        if (h.match(/^[mpsz](\d)\1\1\1$/)) {
            let digits = str.match(/\d/g);
            return {
                type: 'ankan',
                tiles: digits.map(d => s + d),
                fromSeat: null,
                calledTileIndex: null
            };
        }

        // 明杠（大明杠）：sXXXX[+\=\-] — 必须在加杠前检查
        if (h.match(/^[mpsz](\d)\1\1\1[\+\=\-]$/)) {
            let dMatch = str.match(/[\+\=\-]/);
            let direction = dMatch[0];
            let digits = str.match(/\d/g);
            return {
                type: 'minkan',
                tiles: digits.map(d => s + d),
                fromSeat: DIRECTION_MAP[direction],
                calledTileIndex: 2  // 新格式约定：方向在第3张牌
            };
        }

        // 加杠：sXXX[+\=\-]N
        if (h.match(/^[mpsz](\d)\1\1[\+\=\-]\d$/)) {
            let dMatch = str.match(/[\+\=\-]/);
            let direction = dMatch[0];
            let digits = str.match(/\d/g);
            return {
                type: 'kakan',
                tiles: digits.map(d => s + d),
                fromSeat: DIRECTION_MAP[direction],
                calledTileIndex: 2  // 新格式约定：方向在第3张牌
            };
        }

        // 碰：sXXX[+\=\-]
        if (h.match(/^[mpsz](\d)\1\1[\+\=\-]$/)) {
            let dMatch = str.match(/[\+\=\-]/);
            let direction = dMatch[0];
            let digits = str.match(/\d/g);
            return {
                type: 'pon',
                tiles: digits.map(d => s + d),
                fromSeat: DIRECTION_MAP[direction],
                calledTileIndex: 2  // 新格式约定：方向在最后一张
            };
        }

        // 吃：sXXX- 格式（如 s1-23, m34-0）
        if (h.match(/^[mps]\d+\-\d*$/)) {
            let allDigits = str.match(/\d/g);  // 所有数字（含方向前数字）
            if (allDigits.length !== 3) return null;

            // 连续校验
            let sorted = allDigits.map(d => d === '0' ? 5 : +d).sort((a,b) => a-b);
            if (sorted[0] + 1 !== sorted[1] || sorted[1] + 1 !== sorted[2]) return null;

            // 方向标记所在数字 — 捕获组：(数字)(方向)
            let dMatch = str.match(/(\d)([\+\=\-])/);
            let calledDigit = dMatch[1];
            let direction = dMatch[2];

            let tiles = allDigits.map(d => s + d);

            // calledTileIndex：方向标记前的数字在 tiles 中的位置
            let calledIdx = allDigits.indexOf(calledDigit);

            return {
                type: 'chi',
                tiles: tiles,
                fromSeat: DIRECTION_MAP[direction],
                calledTileIndex: calledIdx
            };
        }

        return null;
    },

    /**
     * 从 mianzi 字符串推导副露类型
     * @param {string} m — mianzi 字符串（新旧格式均支持）
     * @returns {string|null} "chi"|"pon"|"minkan"|"kakan"|"ankan"
     */
    fulouType(m) {
        if (!m || typeof m !== 'string') return null;

        // 新格式：直接从前缀读取
        if (this.isNewFormat(m)) {
            let meta = this._parseNewFormat(m);
            return meta ? meta.type : null;
        }

        // 旧格式：正则判断
        let h = m.replace(/0/g, '5');
        if (h.match(/^[mpsz](\d)\1\1\1$/))               return 'ankan';
        if (h.match(/^[mpsz](\d)\1\1\1[\+\=\-]?$/))       return 'minkan';
        if (h.match(/^[mpsz](\d)\1\1[\+\=\-]\d$/))        return 'kakan';
        if (h.match(/^[mpsz](\d)\1\1[\+\=\-]$/))          return 'pon';
        if (h.match(/^[mps]\d+\-\d*$/))                    return 'chi';
        return null;
    },

    /**
     * 从 mianzi 字符串提取组成牌张列表
     * @param {string} m — mianzi 字符串（新旧格式均支持）
     * @returns {string[]} 牌张字符串数组
     */
    fulouTiles(m) {
        if (!m || typeof m !== 'string') return [];

        // 统一通过 parseMianzi 获取（自动兼容新旧格式）
        let meta = this.parseMianzi(m);
        return meta ? meta.tiles : [];
    },

};
