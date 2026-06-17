/*
 *  Player
 */
"use strict";

const Majiang = require('@kobalab/majiang-core');
const SuanPai = require('./suanpai');
const ShoupaiView = require('../core/shoupai-view.js');
const { HandTiles } = require('../core/hand-tile.js');
const meldParser = require('../core/meld-parser.js');

const width = [8, 8*4, 8*4*2];

function add_hongpai(tingpai) {
    let pai = [];
    for (let p of tingpai) {
        if (p[0] != 'z' && p[1] == '5') pai.push(p.replace(/5/,'0'));
        pai.push(p);
    }
    return pai;
}

module.exports = class Player extends Majiang.Player {

    qipai(qipai) {
        this._defen_cache = {};
        this._eval_cache  = {};
        this._suanpai = new SuanPai(this._rule['赤牌']);
        this._suanpai.qipai(
            qipai, (this._id + 4 - this._model.qijia + 4 - qipai.jushu) % 4);
        super.qipai(qipai);
    }
    zimo(zimo, gangzimo) {
        if (zimo.l == this._menfeng) this._eval_cache = {};
        this._suanpai.zimo(zimo);
        super.zimo(zimo, gangzimo);
    }
    dapai(dapai) {
        if (dapai.l != this._menfeng) this._eval_cache = {};
        this._suanpai.dapai(dapai);
        super.dapai(dapai);
    }
    fulou(fulou) {
        this._suanpai.fulou(fulou);
        super.fulou(fulou);
    }
    gang(gang)   {
        this._suanpai.gang(gang);
        super.gang(gang);
    }
    kaigang(kaigang) {
        this._defen_cache = {};
        this._eval_cache  = {};
        this._suanpai.kaigang(kaigang);
        super.kaigang(kaigang);
    }


    action_kaiju(kaiju) { this._callback() }
    action_qipai(qipai) { this._callback() }

    action_zimo(zimo, gangzimo) {
        if (zimo.l != this._menfeng) return this._callback();
        let m;
        if      (this.select_hule(null, gangzimo))
                                         this._callback({hule: '-'});
        else if (zimo.canHule)           this._callback({hule: '-'});
        else if (this.select_pingju())   this._callback({daopai: '-'});
        else if (m = this.select_gang()) this._callback({gang: m});
        else this._callback({dapai: this.select_dapai()});
    }

    action_dapai(dapai) {
        if (dapai.l == this._menfeng)  {
            if (this.select_daopai()) this._callback({daopai: '-'});
            else                      this._callback();
            return;
        }
        if (!dapai.p) {
            this._callback();
            return;
        }
        let m;
        if      (this.select_hule(dapai))      this._callback({hule: '-'});
        else if (dapai.canHule)                this._callback({hule: '-'});
        else if (m = this.select_fulou(dapai)) this._callback({fulou: m});
        else if (this.select_daopai())         this._callback({daopai: '-'});
        else                                   this._callback();
    }

    action_fulou(fulou) {
        if (fulou.l != this._menfeng)      return this._callback();
        if (fulou.m.match(/^[mpsz]\d{4}/)) return this._callback();
        this._callback({dapai: this.select_dapai()});
    }

    action_gang(gang) {
        if (gang.l == this._menfeng) return this._callback();
        if (this.select_hule(gang, true)) this._callback({hule: '-'});
        else                              this._callback();
    }

    action_hule(hule)     { this._callback() }
    action_pingju(pingju) { this._callback() }
    action_jieju(jieju)   { this._callback() }


    /* ================================================================
     * 技能 AI 决策
     * ================================================================ */

    /**
     * 对技能提示动作做 AI 决策
     * @param {Object} action - SkillManager.trigger() 返回的动作
     * @param {Object} context - 触发上下文（来自 game 的 _skill_trigger）
     * @returns {{activate: boolean, choice?: any}}
     */
    decideSkillAction(action, context) {
        let skill = action.skill;
        if (!skill || !skill.aiDecision) {
            return { activate: true };  // 无决策函数，默认发动
        }
        let enriched = this._enrichAiContext(context);
        return skill.aiDecision(enriched);
    }

    /**
     * 富化 AI 决策上下文（添加 AI 专用数据）
     */
    _enrichAiContext(context) {
        let seat = this._menfeng;
        let model = this._model;

        return Object.assign({}, context, {
            seat: this._menfeng,
            model: this._model,
            xiangting: Majiang.Util.xiangting(this.shoupai),
            heLen: this._countHeLen(seat),
            fulouCount: this._countFulouPlayers(),
            baopai: (model && model.shan && model.shan.baopai) ? model.shan.baopai : [],
            shoupai: this.shoupai.clone(),
            xiangtingFn: (s) => this.xiangting(s),
            weixianFn: this._suanpai
                ? (p) => this._suanpai.suan_weixian(p, seat)
                : null,
            paijiaFn: this._suanpai
                ? (p) => this._suanpai.paijia(p)
                : null,
            getDapaiFn: (s) => {
                let dapai = [];
                let dp = s.get_dapai(true);
                if (dp) for (let p of dp) dapai.push(p);
                return dapai;
            },
            /** 评估和了打点：返回得分（供技能②听牌高目排序） */
            getDefenFn: (newShoupai, oldShoupai) => {
                return this.get_defen(newShoupai, oldShoupai);
            },
            /** 评估待牌改良值：换入 tile 后听牌形是否变好（0=无改良, 正数越大越好） */
            waitImproveFn: (oldShoupai, tile) => {
                return this._waitImprovement(oldShoupai, tile);
            },
            riverTiles: this._collectRiverTiles(),
        });
    }

    /**
     * 评估待牌改良：换入 tile 打出原有某张牌后，听牌形是否变好
     * @returns {number} 改良值（正数=变好，越大越好）
     */
    _waitImprovement(oldShoupai, tile) {
        let bestScore = 0;
        /* 统计当前听牌待牌数 */
        let currentWaits = this._countWaitTiles(oldShoupai);
        /* 对每张可打牌尝试交换 */
        let dapai = [];
        try { dapai = oldShoupai.clone().zimo(tile).get_dapai(true); } catch(e) { return 0; }
        for (let p of dapai) {
            let s2 = oldShoupai.clone().zimo(tile);
            s2.dapai(p.replace(/[\*_]$/, ''));
            if (Majiang.Util.xiangting(s2) === 0) {
                let newWaits = this._countWaitTiles(s2);
                /* 改良值 = 新待牌数 - 旧待牌数 + 听牌形评分差 */
                let improvement = newWaits.count - currentWaits.count
                    + (newWaits.quality - currentWaits.quality) * 0.5;
                if (improvement > bestScore) bestScore = improvement;
            }
        }
        return Math.max(0, bestScore);
    }

    /**
     * 统计听牌待牌：数量 + 质量
     * 质量分：双面(4分) > 两面(3) > 嵌张/边张(2) > 单骑(1) > 双碰(1)
     */
    _countWaitTiles(shoupai) {
        let count = 0;
        let qualityScore = 0;
        let allPai = [];
        for (let s of ['m','p','s','z']) {
            for (let n = 1; n <= (s === 'z' ? 7 : 9); n++) {
                allPai.push(s + n);
            }
        }
        for (let p of allPai) {
            /* 检查手牌是否已有4张该牌，避免 zimo 时抛异常 */
            let s = p[0], n = +p[1];
            let ht = HandTiles.fromShoupai(shoupai);
            if (ht.countOf(s, n) >= 4) continue;
            let s2 = shoupai.clone().zimo(p);
            if (Majiang.Util.xiangting(s2) === -1) {
                count++;
                /* 质量评估：检查是哪种听牌形 */
                let q = 1; // 默认单骑/双碰
                /* 检查双面/嵌张：摸入后 self_pai 出现两个相邻牌即是好形 */
                let pai = String(s2);
                let s = p[0], n = +p[1];
                if (s !== 'z') {
                    let hasLeft  = pai.indexOf(s + (n-1)) >= 0;
                    let hasRight = pai.indexOf(s + (n+1)) >= 0;
                    if (hasLeft && hasRight) q = 4;     // 双面
                    else if (hasLeft || hasRight) q = 2; // 嵌张/边张
                }
                qualityScore += q;
            }
        }
        return { count, quality: qualityScore };
    }

    /** 计算自己牌河的有效牌数（不含副露标记） */
    _countHeLen(seat) {
        let he = this._model.he[seat];
        if (!he || !he._pai) return 0;
        let len = 0;
        for (let p of he._pai) {
            if (p !== '_') len++;
        }
        return len;
    }

    /** 统计场上副露玩家数 */
    _countFulouPlayers() {
        let model = this._model;
        let count = 0;
        for (let l = 0; l < 4; l++) {
            let view = ShoupaiView.fromShoupai(model.shoupai[l]);
            if (view.melds.length > 0) {
                count++;
            }
        }
        return count;
    }

    /** 收集牌河中所有可见牌 */
    _collectRiverTiles() {
        let model = this._model;
        let tiles = [];
        for (let l = 0; l < 4; l++) {
            let he = model.he[l];
            if (!he || !he._pai) continue;
            for (let i = 0; i < he._pai.length; i++) {
                let p = he._pai[i];
                if (p === '_') continue;
                if (he._hidden && he._hidden[i]) continue;
                tiles.push({ seat: l, index: i, pai: p });
            }
        }
        return tiles;
    }


    select_hule(data, hupai, info) {

        let rongpai;
        if (data) {
            if (data.m && data.m.match(/^[mpsz]\d{4}$/)) return false;
            let d = ['','+','=','-']
                        [(4 + this._model.lunban - this._menfeng) % 4];
            rongpai = data.m ? data.m[0] + data.m.slice(-1) + d
                             : data.p.slice(0,2) + d;
        }
        let hule = this.allow_hule(this.shoupai, rongpai, hupai);

        if (info && hule) {
            let shoupai = this.shoupai.clone();
            if (rongpai) shoupai.zimo(rongpai);
            info.push({
                m: '', n_xiangting: -1,
                ev: this.get_defen(this.shoupai, rongpai),
                shoupai: shoupai.toString()
            });
        }

        return hule;
    }

    select_pingju() {
        if (Majiang.Util.xiangting(this.shoupai) < 4) return false;
        return this.allow_pingju(this.shoupai);
    }

    select_fulou(dapai, info) {

        let n_xiangting = Majiang.Util.xiangting(this.shoupai);
        if (this._model.shoupai.find(s=>s.lizhi) && n_xiangting >= 3) return;

        let d = ['','+','=','-'][(4 + this._model.lunban - this._menfeng) % 4];
        let p = dapai.p.slice(0,2) + d;

        if (n_xiangting < 3) {

            let mianzi = this.get_gang_mianzi(this.shoupai, p)
                            .concat(this.get_peng_mianzi(this.shoupai, p))
                            .concat(this.get_chi_mianzi(this.shoupai, p));
            /* 合并服务端预检的扩展器副露面 */
            if (dapai.gangMianzi) mianzi = mianzi.concat(dapai.gangMianzi);
            if (dapai.pengMianzi) mianzi = mianzi.concat(dapai.pengMianzi);
            if (dapai.chiMianzi)  mianzi = mianzi.concat(dapai.chiMianzi);
            if (! mianzi.length) return;

            let fulou;
            let paishu = this._suanpai.get_paishu();
            let max    = this.eval_shoupai(this.shoupai, paishu, '');

            if (info) {
                info.push({
                    m: '', n_xiangting: n_xiangting, ev: max,
                    shoupai: this.shoupai.toString()
                });
            }

            for (let m of mianzi) {
                let shoupai = this.shoupai.clone().fulou(m);
                let x = Majiang.Util.xiangting(shoupai);
                if (x >= 3) continue;

                let ev = this.eval_shoupai(shoupai, paishu);

                if (info && ev > 0) {
                    info.push({
                        m: m, n_xiangting: x, ev: ev,
                        shoupai: shoupai.toString()
                    });
                }

                if (this._model.shoupai.find(s=>s.lizhi)) {
                    if (x  > 0 && ev < 750) continue;
                    if (x == 0 && ev < 250) continue;
                }

                if (ev - max > 0.0000001) {
                    max   = ev;
                    fulou = m;
                }
            }
            return fulou;
        }
        else {

            let mianzi = this.get_peng_mianzi(this.shoupai, p)
                            .concat(this.get_chi_mianzi(this.shoupai, p));
            if (! mianzi.length) return;

            n_xiangting = this.xiangting(this.shoupai);

            let paishu;
            if (info) {
                paishu = this._suanpai.get_paishu();
                let ev = this.eval_shoupai(this.shoupai, paishu);
                let n_tingpai = Majiang.Util.tingpai(this.shoupai)
                                    .map(p => this._suanpai._paishu[p[0]][p[1]])
                                    .reduce((x, y)=> x + y, 0);
                info.push({
                    m: '', n_xiangting: n_xiangting, ev: ev,
                    n_tingpai: n_tingpai, shoupai: this.shoupai.toString()
                });
            }

            for (let m of mianzi) {
                let shoupai = this.shoupai.clone().fulou(m);
                let x = this.xiangting(shoupai);
                if (x >= n_xiangting) continue;

                if (info) {
                    info.push({
                        m: m, n_xiangting: x,
                        shoupai: shoupai.toString()
                    });
                }

                return m;
            }
        }
    }

    select_gang(info) {

        let n_xiangting = Majiang.Util.xiangting(this.shoupai);
        if (this._model.shoupai.find(s=>s.lizhi) && n_xiangting > 0) return;

        let paishu = this._suanpai.get_paishu();

        if (n_xiangting < 3) {

            let gang, max = this.eval_shoupai(this.shoupai, paishu);
            for (let m of this.get_gang_mianzi(this.shoupai)) {
                let shoupai = this.shoupai.clone().gang(m);
                if (Majiang.Util.xiangting(shoupai) >= 3) continue;

                let ev = this.eval_shoupai(shoupai, paishu);

                if (info) {
                    let p = m.match(/\d{4}$/) ? m.slice(0,2)
                                              : m[0] + m.slice(-1);
                    let tingpai = Majiang.Util.tingpai(shoupai);
                    let n_tingpai = tingpai
                                    .map(p => this._suanpai._paishu[p[0]][p[1]])
                                    .reduce((x, y)=> x + y, 0);
                    info.push({
                        p: p, m: m, n_xiangting: n_xiangting, ev: ev,
                        tingpai: tingpai, n_tingpai: n_tingpai,
                    });
                }

                if (ev - max > -0.0000001) {
                    gang = m;
                    max  = ev;
                }
            }
            return gang;
        }
        else {

            n_xiangting = this.xiangting(this.shoupai);

            for (let m of this.get_gang_mianzi(this.shoupai)) {
                let shoupai = this.shoupai.clone().gang(m);
                if (this.xiangting(shoupai) == n_xiangting) {

                    if (info) {
                        let p = m.match(/\d{4}$/) ? m.slice(0,2)
                                                  : m[0] + m.slice(-1);
                        let ev = this.eval_shoupai(shoupai, paishu);
                        let tingpai = Majiang.Util.tingpai(shoupai);
                        let n_tingpai = tingpai
                                        .map(p =>
                                             this._suanpai._paishu[p[0]][p[1]])
                                        .reduce((x, y)=> x + y, 0);
                        info.push({
                            p: p, m: m, n_xiangting: n_xiangting, ev: ev,
                            tingpai: tingpai, n_tingpai: n_tingpai,
                        });
                    }

                    return m;
                }
            }
        }
    }

    select_dapai(info) {

        let anquan, min = Infinity;
        const weixian = this._suanpai.suan_weixian_all(this.shoupai._bingpai);
        if (weixian) {
            for (let p of this.get_dapai(this.shoupai)) {
                if (weixian(p) < min) {
                    min = weixian(p);
                    anquan = p;
                }
            }
        }

        let dapai = anquan, max = -1, min_tingpai = 0, backtrack = [];
        let n_xiangting = Majiang.Util.xiangting(this.shoupai);
        let paishu = this._suanpai.get_paishu();
        const paijia = this._suanpai.make_paijia(this.shoupai);
        const cmp = (a, b)=> paijia(a) - paijia(b);
        for (let p of this.get_dapai(this.shoupai).reverse().sort(cmp)) {
            if (! dapai) dapai = p;
            let shoupai = this.shoupai.clone().dapai(p);
            if (n_xiangting > 2 && this.xiangting(shoupai) > n_xiangting ||
                Majiang.Util.xiangting(shoupai) > n_xiangting)
            {
                if (anquan) continue;
                if (n_xiangting < 2) backtrack.push(p);
                continue;
            }

            let ev = this.eval_shoupai(shoupai, paishu);

            let tingpai = Majiang.Util.tingpai(shoupai);
            let n_tingpai = tingpai.map(p => this._suanpai._paishu[p[0]][p[1]])
                                   .reduce((x, y)=> x + y, 0);

            if (info) {
                info.map(i =>{ if (i.p == p.slice(0,2) && i.m)
                                    i.weixian = weixian && weixian(p) });
                if (! info.find(i => i.p == p.slice(0,2) && ! i.m)) {
                    info.push({
                        p: p.slice(0,2), n_xiangting: n_xiangting, ev: ev,
                        tingpai: tingpai, n_tingpai: n_tingpai,
                        weixian: weixian && weixian(p)
                    });
                }
            }

            if (weixian && weixian(p) > min) {
                if (weixian(p) >= 13.0) continue;
                if (n_xiangting > 2 ||  n_xiangting > 0 && ev < 80) {
                    if (weixian(p) >= 8.0) continue;
                    if (min < 3.2) continue;
                }
                else if (n_xiangting  > 0 && ev < 750 ||
                         n_xiangting == 0 && ev <  50)
                {
                    if (weixian(p) >= 8.0) continue;
                    if (min < 3.2 && weixian(p) >= 3.2) continue;
                }
            }

            if (ev - max > 0.0000001) {
                max         = ev;
                dapai       = p;
                min_tingpai = n_tingpai * 6;
            }
        }
        let tmp_max = max;

        for (let p of backtrack) {
            let shoupai = this.shoupai.clone().dapai(p);
            let tingpai = Majiang.Util.tingpai(shoupai);
            let n_tingpai = tingpai.map(p => this._suanpai._paishu[p[0]][p[1]])
                                   .reduce((x, y)=> x + y, 0);
            if (n_tingpai < min_tingpai) continue;

            let back = p[0] + (+p[1]||5);
            let ev = this.eval_backtrack(shoupai, paishu, back, tmp_max * 2);

            if (info && ev > 0) {
                if (! info.find(i => i.p == p.slice(0,2) && ! i.m)) {
                    info.push({
                        p: p.slice(0,2), n_xiangting: n_xiangting + 1, ev: ev,
                        tingpai: tingpai, n_tingpai: n_tingpai
                    });
                }
            }

            if (ev - max > 0.0000001) {
                max   = ev;
                dapai = p;
            }
        }

        if (anquan) {

            if (info && dapai == anquan
                && ! info.find(i=> i.p == anquan.slice(0,2)))
            {
                info.push({
                    p: anquan.slice(0,2),
                    n_xiangting: Majiang.Util.xiangting(
                                        this.shoupai.clone().dapai(anquan)),
                    weixian: weixian && weixian(anquan)
                });
            }
        }

        if (this.select_lizhi(dapai) && max >= 350) dapai += '*';
        return dapai;
    }

    select_lizhi(p) {
        return this.allow_lizhi(this.shoupai, p);
    }

    select_daopai() {
        return this.allow_no_daopai(this.shoupai);
    }

    xiangting(shoupai) {
        function xiangting_menqian(shoupai) {
            return shoupai.menqian ? Majiang.Util.xiangting(shoupai) : Infinity;
        }
        function xiangting_fanpai(shoupai, zhuangfeng, menfeng, suanpai) {
            let n_fanpai = 0, back;
            let ht = HandTiles.fromShoupai(shoupai);
            let view = ShoupaiView.fromShoupai(shoupai);
            for (let n of [ zhuangfeng + 1, menfeng + 1, 5, 6, 7 ]) {
                let cntZ = ht.countOf('z', n);
                if      (cntZ >= 3) n_fanpai++;
                else if (cntZ == 2
                         && suanpai._paishu.z[n])    back = 'z'+n+n+n+'+';
                for (let m of view.melds) {
                    if (m.tiles[0][0] == 'z' && +m.tiles[0][1] == n) n_fanpai++;
                }
            }
            if (n_fanpai) return Majiang.Util.xiangting(shoupai);
            if (back) {
                let new_shoupai = shoupai.clone();
                new_shoupai.fulou(back, false);
                let htNew = HandTiles.fromShoupai(new_shoupai);
                htNew.clearZimo();
                htNew.syncTo(new_shoupai);
                return Majiang.Util.xiangting(new_shoupai) + 1;
            }
            return Infinity;
        }
        function xiangting_duanyao(shoupai, rule) {
            if (! rule['クイタンあり'] && ! shoupai.menqian) return Infinity;
            let view = ShoupaiView.fromShoupai(shoupai);
            if (view.melds.some(m => m.tiles.some(t => t[0] === 'z' || t[1] === '1' || t[1] === '9'))) return Infinity;
            let new_shoupai = shoupai.clone();
            for (let s of ['m','p','s']) {
                new_shoupai._bingpai[s][1] = 0;
                new_shoupai._bingpai[s][9] = 0;
            }
            new_shoupai._bingpai.z = [0,0,0,0,0,0,0,0];
            return Majiang.Util.xiangting(new_shoupai);
        }
        function xiangting_duidui(shoupai) {
            let view = ShoupaiView.fromShoupai(shoupai);
            if (view.melds.some(m => m.type === 'chi'))
                                                            return Infinity;
            let n_kezi = view.melds.length, n_duizi = 0;
            let ht = HandTiles.fromShoupai(shoupai);
            for (let s of ['m','p','s','z']) {
                let maxN = s === 'z' ? 7 : 9;
                for (let n = 1; n <= maxN; n++) {
                    let cnt = ht.countOf(s, n);
                    if      (cnt >= 3) n_kezi++;
                    else if (cnt == 2) n_duizi++;
                }
            }
            if (n_kezi + n_duizi > 5) n_duizi = 5 - n_kezi;
            return 8 - n_kezi * 2 - n_duizi;
        }
        function xiangting_yise(shoupai,suit) {
            let view = ShoupaiView.fromShoupai(shoupai);
            if (view.melds.some(m => m.tiles[0][0] !== 'z' && m.tiles[0][0] !== suit)) return Infinity;
            let new_shoupai = shoupai.clone();
            for (let s of ['m','p','s']) {
                if (s != suit) new_shoupai._bingpai[s] = [0,0,0,0,0,0,0,0,0,0];
            }
            return Majiang.Util.xiangting(new_shoupai);
        }

        return Math.min(
            xiangting_menqian(shoupai),
            xiangting_fanpai(shoupai,
                    this._model.zhuangfeng, this._menfeng, this._suanpai),
            xiangting_duanyao(shoupai, this._rule),
            xiangting_duidui(shoupai),
            xiangting_yise(shoupai, 'm'),
            xiangting_yise(shoupai, 'p'),
            xiangting_yise(shoupai, 's')
        );
    }

    tingpai(shoupai) {

        let n_xiangting = this.xiangting(shoupai);

        let pai = [];
        for (let p of Majiang.Util.tingpai(shoupai, (s)=>this.xiangting(s))) {

            if (n_xiangting > 0) {

                for (let m of this.get_peng_mianzi(shoupai, p+'+')) {
                    let new_shoupai = shoupai.clone().fulou(m);
                    if (this.xiangting(new_shoupai) < n_xiangting) {
                        pai.push(p+'+');
                        break;
                    }
                }
                if (pai[pai.length - 1] == p+'+') continue;

                for (let m of this.get_chi_mianzi(shoupai, p+'-')) {
                    let new_shoupai = shoupai.clone().fulou(m);
                    if (this.xiangting(new_shoupai) < n_xiangting) {
                        pai.push(p+'-');
                        break;
                    }
                }
                if (pai[pai.length - 1] == p+'-') continue;
            }
            pai.push(p);
        }
        return pai;
    }

    get_defen(shoupai, rongpai) {

        let paistr = shoupai.toString();
        if (rongpai)
                paistr = paistr.replace(/^([^\*\,]*)(.*)$/, `$1${rongpai}$2`);
        if (this._defen_cache[paistr] != null) return this._defen_cache[paistr];

        let param = {
            rule:       this._rule,
            zhuangfeng: this._model.zhuangfeng,
            menfeng:    this._menfeng,
            hupai:      { lizhi: shoupai.menqian },
            baopai:     this.shan.baopai,
            jicun:      { changbang: 0, lizhibang: 0 }
        };
        let hule = Majiang.Util.hule(shoupai, rongpai, param);

        /* hule 可能返回 undefined（_zimo 为副露面字时 hule_mianzi 返回空，
         * 或手牌状态异常时）。尝试用面字中的被叫牌作为荣和牌重新计算。 */
        if (!hule && shoupai._zimo && shoupai._zimo.length > 2) {
            let meta = meldParser.parseMianzi(shoupai._zimo);
            if (meta && meta.calledTileIndex != null) {
                let calledTile = meta.tiles[meta.calledTileIndex];
                let dir = meta.fromSeat != null ? ['','+','=','-'][meta.fromSeat] : '+';
                let rongpai2 = calledTile + dir;
                let clone = shoupai.clone();
                clone._zimo = null;
                hule = Majiang.Util.hule(clone, rongpai2, param);
            }
        }

        this._defen_cache[paistr] = hule ? hule.defen : 0;
        return this._defen_cache[paistr];
    }

    eval_shoupai(shoupai, paishu, back) {

        let paistr = shoupai.toString() + (back != null ? `:${back}` : '');
        if (this._eval_cache[paistr] != null) return this._eval_cache[paistr];

        let rv = 0;
        let n_xiangting = Majiang.Util.xiangting(shoupai);

        if (n_xiangting == -1) {
            rv = this.get_defen(shoupai);
        }
        else if (shoupai._zimo) {
            for (let p of this.get_dapai(shoupai)) {
                let new_shoupai = shoupai.clone().dapai(p);
                if (Majiang.Util.xiangting(new_shoupai) > n_xiangting) continue;

                let ev = this.eval_shoupai(new_shoupai, paishu, back);

                if (ev > rv) rv = ev;
            }
        }
        else if (n_xiangting < 3) {
            for (let p of add_hongpai(Majiang.Util.tingpai(shoupai))) {
                if (p == back) { rv = 0; break }
                if (paishu.val(p) == 0) continue;
                let new_shoupai = shoupai.clone().zimo(p);
                paishu.pop(p);

                let ev = this.eval_shoupai(new_shoupai, paishu, back);
                if (! back) {
                    if (n_xiangting > 0)
                        ev += this.eval_fulou(shoupai, p, paishu, back);
                }

                paishu.push(p);
                rv += ev * paishu.val(p);
            }
            rv /= width[n_xiangting];
        }
        else {
            for (let p of add_hongpai(this.tingpai(shoupai))) {
                if (paishu.val(p, 1) == 0) continue;

                rv += paishu.val(p, 1) * (   p[2] == '+' ? 4
                                           : p[2] == '-' ? 2
                                           :               1  );
            }
        }

        this._eval_cache[paistr] = rv;
        return rv;
    }

    eval_backtrack(shoupai, paishu, back, min) {

        let n_xiangting = Majiang.Util.xiangting(shoupai);

        let rv = 0
        for (let p of add_hongpai(Majiang.Util.tingpai(shoupai))) {
            if (p.replace(/0/,'5') == back) continue;
            if (paishu.val(p) == 0)         continue;

            let new_shoupai = shoupai.clone().zimo(p);
            paishu.pop(p);

            let ev = this.eval_shoupai(new_shoupai, paishu, back);

            paishu.push(p);
            if (ev - min > 0.0000001) rv += ev * paishu.val(p);
        }
        return rv / width[n_xiangting];
    }

    eval_fulou(shoupai, p, paishu, back) {

        let n_xiangting = Majiang.Util.xiangting(shoupai);

        let peng_max = 0;
        for (let m of this.get_peng_mianzi(shoupai, p+'+')) {
            let new_shoupai = shoupai.clone().fulou(m);
            if (Majiang.Util.xiangting(new_shoupai) >= n_xiangting) continue;
            peng_max = Math.max(this.eval_shoupai(new_shoupai, paishu, back),
                                peng_max);
        }

        let chi_max = 0;
        for (let m of this.get_chi_mianzi(shoupai, p+'-')) {
            let new_shoupai = shoupai.clone().fulou(m);
            if (Majiang.Util.xiangting(new_shoupai) >= n_xiangting) continue;
            chi_max  = Math.max(this.eval_shoupai(new_shoupai, paishu, back),
                                chi_max);
        }

        return peng_max > chi_max ? peng_max * 3 : peng_max * 2 + chi_max;
    }
}
