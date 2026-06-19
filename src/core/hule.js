/*
 *  Majiang.Util.hule
 */
"use strict";

const Majiang = {
    Shan: require('./shan'),
    rule: require('./rule')
};

const meldParser = require('./meld-parser.js');

function toOldFormat(m) {
    if (!meldParser.isNewFormat(m)) return m;
    let meta = meldParser.parseMianzi(m);
    if (!meta) return m;

    let { type, tiles, fromSeat } = meta;
    let suit = tiles[0][0];
    let dir  = fromSeat != null ? ({ 0: '+', 1: '=', 2: '-' })[fromSeat] : '';

    if (type === 'chi') {
        let nums = tiles.map(t => t[1]).sort();
        return suit + nums.join('') + dir;
    } else if (type === 'pon') {
        let num = tiles[0][1];
        return suit + num.repeat(3) + dir;
    } else if (type === 'minkan') {
        let num = tiles[0][1];
        return suit + num.repeat(4) + dir;
    } else if (type === 'kakan') {
        let num = tiles[0][1];
        return suit + num.repeat(3) + dir + num;
    } else if (type === 'ankan') {
        let num = tiles[0][1];
        return suit + num.repeat(4);
    }

    return m;
}

function mianzi(s, bingpai, n = 1) {

    if (n > 9) return [[]];

    if (bingpai[n] == 0) return mianzi(s, bingpai, n+1);

    let shunzi = [];
    if (n <= 7 && bingpai[n] > 0 && bingpai[n+1] > 0 && bingpai[n+2] > 0) {
        bingpai[n]--; bingpai[n+1]--; bingpai[n+2]--;
        shunzi = mianzi(s, bingpai, n);
        bingpai[n]++; bingpai[n+1]++; bingpai[n+2]++;
        for (let s_mianzi of shunzi) {
            s_mianzi.unshift(s+(n)+(n+1)+(n+2));
        }
    }

    let kezi = [];
    if (bingpai[n] == 3) {
        bingpai[n] -= 3;
        kezi = mianzi(s, bingpai, n+1);
        bingpai[n] += 3;
        for (let k_mianzi of kezi) {
            k_mianzi.unshift(s+n+n+n);
        }
    }

    return shunzi.concat(kezi);
}

function mianzi_all(shoupai) {

    let shupai_all = [[]];
    for (let s of ['m','p','s']) {
        let new_mianzi = [];
        for (let mm of shupai_all) {
            for (let nn of mianzi(s, shoupai._bingpai[s])) {
                new_mianzi.push(mm.concat(nn));
            }
        }
        shupai_all = new_mianzi;
    }

    let zipai = [];
    for (let n = 1; n <= 7; n++) {
        if (shoupai._bingpai.z[n] == 0) continue;
        if (shoupai._bingpai.z[n] != 3) return [];
        zipai.push('z'+n+n+n);
    }

    let fulou = shoupai._fulou.map(m => toOldFormat(m).replace(/0/g,'5'));

    return shupai_all.map(shupai => shupai.concat(zipai).concat(fulou));
}

function add_hulepai(mianzi, p) {

    let [s, n, d] = p;
    let regexp   = new RegExp(`^(${s}.*${n})`);
    let replacer = `$1${d}!`;

    let new_mianzi = [];

    for (let i = 0; i < mianzi.length; i++) {
        if (mianzi[i].match(/[\+\=\-]|\d{4}/)) continue;
        if (i > 0 && mianzi[i] == mianzi[i-1]) continue;
        let m = mianzi[i].replace(regexp, replacer);
        if (m == mianzi[i]) continue;
        let tmp_mianzi = mianzi.concat();
        tmp_mianzi[i] = m;
        new_mianzi.push(tmp_mianzi);
    }

    return new_mianzi;
}

function hule_mianzi_yiban(shoupai, hulepai) {

    let mianzi = [];

    for (let s of ['m','p','s','z']) {
        let bingpai = shoupai._bingpai[s];
        for (let n = 1; n < bingpai.length; n++) {
            if (bingpai[n] < 2) continue;
            bingpai[n] -= 2;
            let jiangpai = s+n+n;
            for (let mm of mianzi_all(shoupai)) {
                mm.unshift(jiangpai);
                if (mm.length != 5) continue;
                mianzi = mianzi.concat(add_hulepai(mm, hulepai));
            }
            bingpai[n] += 2;
        }
    }

    return mianzi;
}

function hule_mianzi_qidui(shoupai, hulepai) {

    if (shoupai._fulou.length > 0) return [];

    let mianzi = [];

    for (let s of ['m','p','s','z']) {
        let bingpai = shoupai._bingpai[s];
        for (let n = 1; n < bingpai.length; n++) {
            if (bingpai[n] == 0) continue;
            if (bingpai[n] == 2) {
                let m = (s+n == hulepai.slice(0,2))
                            ? s+n+n + hulepai[2] + '!'
                            : s+n+n;
                mianzi.push(m);
            }
            else return [];
        }
    }

    return (mianzi.length == 7) ? [ mianzi ] : [];
}

function hule_mianzi_guoshi(shoupai, hulepai) {

    if (shoupai._fulou.length > 0) return [];

    let mianzi = [];
    let n_duizi = 0;

    for (let s of ['m','p','s','z']) {
        let bingpai = shoupai._bingpai[s];
        let nn = (s == 'z') ? [1,2,3,4,5,6,7] :[1,9];
        for (let n of nn) {
            if (bingpai[n] == 2) {
                let m = (s+n == hulepai.slice(0,2))
                            ? s+n+n + hulepai[2] + '!'
                            : s+n+n;
                mianzi.unshift(m);
                n_duizi++;
            }
            else if (bingpai[n] == 1) {
                let m = (s+n == hulepai.slice(0,2))
                            ? s+n + hulepai[2] + '!'
                            : s+n;
                mianzi.push(m);
            }
            else return [];
        }
    }

    return (n_duizi == 1) ? [ mianzi ] : [];
}

function hule_mianzi_jiulian(shoupai, hulepai) {

    if (shoupai._fulou.length > 0) return [];

    let s = hulepai[0];
    if (s == 'z') return [];

    let mianzi = s;
    let bingpai = shoupai._bingpai[s];
    for (let n = 1; n <= 9; n++) {
        if (bingpai[n] == 0) return [];
        if ((n == 1 || n == 9) && bingpai[n] < 3) return [];
        let n_pai = (n == hulepai[1]) ? bingpai[n] - 1 : bingpai[n];
        for (let i = 0; i < n_pai; i++) {
            mianzi += n;
        }
    }
    if (mianzi.length != 14) return [];
    mianzi += hulepai.slice(1) + '!';

    return [ [mianzi] ];
}

function hule_mianzi(shoupai, rongpai) {

    let new_shoupai = shoupai.clone();
    if (rongpai) new_shoupai.zimo(rongpai);

    if (! new_shoupai._zimo || new_shoupai._zimo.length > 2) return [];
    let hulepai = (rongpai || new_shoupai._zimo + '_').replace(/0/,'5');

    return [].concat(hule_mianzi_yiban(new_shoupai, hulepai))
             .concat(hule_mianzi_qidui(new_shoupai, hulepai))
             .concat(hule_mianzi_guoshi(new_shoupai, hulepai))
             .concat(hule_mianzi_jiulian(new_shoupai, hulepai));
}

function get_hudi(mianzi, zhuangfeng, menfeng, rule) {

    const zhuangfengpai = new RegExp(`^z${zhuangfeng+1}.*$`);
    const menfengpai    = new RegExp(`^z${menfeng+1}.*$`);
    const sanyuanpai    = /^z[567].*$/;

    const yaojiu        = /^.*[z19].*$/;
    const zipai         = /^z.*$/;

    const kezi          = /^[mpsz](\d)\1\1.*$/;
    const ankezi        = /^[mpsz](\d)\1\1(?:\1|_\!)?$/;
    const gangzi        = /^[mpsz](\d)\1\1.*\1.*$/;

    const danqi         = /^[mpsz](\d)\1[\+\=\-\_]\!$/;
    const kanzhang      = /^[mps]\d\d[\+\=\-\_]\!\d$/;
    const bianzhang     = /^[mps](123[\+\=\-\_]\!|7[\+\=\-\_]\!89)$/;

    let hudi = {
        fu:         20,
        menqian:    true,
        zimo:       true,
        shunzi:     { m: [0,0,0,0,0,0,0,0],
                      p: [0,0,0,0,0,0,0,0],
                      s: [0,0,0,0,0,0,0,0]  },
        kezi:       { m: [0,0,0,0,0,0,0,0,0,0],
                      p: [0,0,0,0,0,0,0,0,0,0],
                      s: [0,0,0,0,0,0,0,0,0,0],
                      z: [0,0,0,0,0,0,0,0]      },
        n_shunzi:   0,
        n_kezi:     0,
        n_ankezi:   0,
        n_gangzi:   0,
        n_yaojiu:   0,
        n_zipai:    0,
        danqi:      false,
        pinghu:     false,
        zhuangfeng: zhuangfeng,
        menfeng:    menfeng
    };

    for (let m of mianzi) {

        if (m.match(/[\+\=\-](?!\!)/))  hudi.menqian = false;
        if (m.match(/[\+\=\-]\!/))      hudi.zimo    = false;

        if (mianzi.length == 1) continue;

        if (m.match(danqi))             hudi.danqi   = true;

        if (mianzi.length == 13) continue;

        if (m.match(yaojiu))            hudi.n_yaojiu++;
        if (m.match(zipai))             hudi.n_zipai++;

        if (mianzi.length != 5) continue;

        if (m == mianzi[0]) {
            let fu = 0;
            if (m.match(zhuangfengpai)) fu += 2;
            if (m.match(menfengpai))    fu += 2;
            if (m.match(sanyuanpai))    fu += 2;
            fu = rule['連風牌は2符'] && fu > 2 ? 2 : fu;
            hudi.fu += fu;
            if (hudi.danqi)             hudi.fu += 2;
        }
        else if (m.match(kezi)) {
            hudi.n_kezi++;
            let fu = 2;
            if (m.match(yaojiu)) { fu *= 2;                  }
            if (m.match(ankezi)) { fu *= 2; hudi.n_ankezi++; }
            if (m.match(gangzi)) { fu *= 4; hudi.n_gangzi++; }
            hudi.fu += fu;
            hudi.kezi[m[0]][m[1]]++;
        }
        else {
            hudi.n_shunzi++;
            if (m.match(kanzhang))  hudi.fu += 2;
            if (m.match(bianzhang)) hudi.fu += 2;
            hudi.shunzi[m[0]][m[1]]++;
        }
    }

    if (mianzi.length == 7) {
        hudi.fu = 25;
    }
    else if (mianzi.length == 5) {
        hudi.pinghu = (hudi.menqian && hudi.fu == 20);
        if (hudi.zimo) {
            if (! hudi.pinghu)      hudi.fu +=  2;
        }
        else {
            if (hudi.menqian)       hudi.fu += 10;
            else if (hudi.fu == 20) hudi.fu  = 30;
        }
        hudi.fu = Math.ceil(hudi.fu / 10) * 10;
    }

    return hudi;
}

function get_pre_hupai(hupai) {

    let pre_hupai = [];

    if (hupai.lizhi == 1)   pre_hupai.push({ name: '立直', fanshu: 1, type: 'yaku' });
    if (hupai.lizhi == 2)   pre_hupai.push({ name: '两立直', fanshu: 2, type: 'yaku' });
    if (hupai.yifa)         pre_hupai.push({ name: '一发', fanshu: 1, type: 'yaku' });
    if (hupai.haidi == 1)   pre_hupai.push({ name: '海底捞月', fanshu: 1, type: 'yaku' });
    if (hupai.haidi == 2)   pre_hupai.push({ name: '河底捞鱼', fanshu: 1, type: 'yaku' });
    if (hupai.lingshang)    pre_hupai.push({ name: '岭上开花', fanshu: 1, type: 'yaku' });
    if (hupai.qianggang)    pre_hupai.push({ name: '抢杠', fanshu: 1, type: 'yaku' });

    if (hupai.tianhu == 1)  pre_hupai = [{ name: '天和', fanshu: '*', type: 'yaku' }];
    if (hupai.tianhu == 2)  pre_hupai = [{ name: '地和', fanshu: '*', type: 'yaku' }];

    return pre_hupai;
}

function get_hupai(mianzi, hudi, pre_hupai, post_hupai, rule) {

    function menqianqing() {
        if (hudi.menqian && hudi.zimo)
                return [{ name: '门前清自摸和', fanshu: 1 }];
        return [];
    }
    function fanpai() {
        let feng_hanzi = ['東','南','西','北'];
        let fanpai_all = [];
        if (hudi.kezi.z[hudi.zhuangfeng+1])
                fanpai_all.push({ name: '场风 '+feng_hanzi[hudi.zhuangfeng],
                                  fanshu: 1 });
        if (hudi.kezi.z[hudi.menfeng+1])
                fanpai_all.push({ name: '自风 '+feng_hanzi[hudi.menfeng],
                                  fanshu: 1 });
        if (hudi.kezi.z[5]) fanpai_all.push({ name: '役牌 白', fanshu: 1 });
        if (hudi.kezi.z[6]) fanpai_all.push({ name: '役牌 发', fanshu: 1 });
        if (hudi.kezi.z[7]) fanpai_all.push({ name: '役牌 中', fanshu: 1 });
        return fanpai_all;
    }
    function pinghu() {
        if (hudi.pinghu)        return [{ name: '平和', fanshu: 1 }];
        return [];
    }
    function duanyaojiu() {
        if (hudi.n_yaojiu > 0)  return [];
        if (rule['クイタンあり'] || hudi.menqian)
                                return [{ name: '断幺九', fanshu: 1 }];
        return [];
    }
    function yibeikou() {
        if (! hudi.menqian)     return [];
        const shunzi = hudi.shunzi;
        let beikou = shunzi.m.concat(shunzi.p).concat(shunzi.s)
                        .map(x=>x>>1).reduce((a,b)=>a+b);
        if (beikou == 1)        return [{ name: '一杯口', fanshu: 1 }];
        return [];
    }
    function sansetongshun() {
        const shunzi = hudi.shunzi;
        for (let n = 1; n <= 7; n++) {
            if (shunzi.m[n] && shunzi.p[n] && shunzi.s[n])
                return [{ name: '三色同顺', fanshu: (hudi.menqian ? 2 : 1) }];
        }
        return [];
    }
    function yiqitongguan() {
        const shunzi = hudi.shunzi;
        for (let s of ['m','p','s']) {
            if (shunzi[s][1] && shunzi[s][4] && shunzi[s][7])
                return [{ name: '一气通贯', fanshu: (hudi.menqian ? 2 : 1) }];
        }
        return [];
    }
    function hunquandaiyaojiu() {
        if (hudi.n_yaojiu == 5 && hudi.n_shunzi > 0 && hudi.n_zipai > 0)
                return [{ name: '混全带幺九', fanshu: (hudi.menqian ? 2 : 1) }];
        return [];
    }
    function qiduizi() {
        if (mianzi.length == 7) return [{ name: '七对子', fanshu: 2 }];
        return [];
    }
    function duiduihu() {
        if (hudi.n_kezi == 4)   return [{ name: '对对和', fanshu: 2 }];
        return [];
    }
    function sananke() {
        if (hudi.n_ankezi == 3) return [{ name: '三暗刻', fanshu: 2 }];
        return [];
    }
    function sangangzi() {
        if (hudi.n_gangzi == 3) return [{ name: '三杠子', fanshu: 2 }];
        return [];
    }
    function sansetongke() {
        const kezi = hudi.kezi;
        for (let n = 1; n <= 9; n++) {
            if (kezi.m[n] && kezi.p[n] && kezi.s[n])
                                return [{ name: '三色同刻', fanshu: 2 }];
        }
        return [];
    }
    function hunlaotou() {
        if (hudi.n_yaojiu == mianzi.length
                && hudi.n_shunzi == 0 && hudi.n_zipai > 0)
                                return [{ name: '混老头', fanshu: 2 }];
        return [];
    }
    function xiaosanyuan() {
        const kezi = hudi.kezi;
        if (kezi.z[5] + kezi.z[6] + kezi.z[7] == 2
                && mianzi[0].match(/^z[567]/))
                                return [{ name: '小三元', fanshu: 2 }];
        return [];
    }
    function hunyise() {
        for (let s of ['m','p','s']) {
            const yise = new RegExp(`^[z${s}]`);
            if (mianzi.filter(m=>m.match(yise)).length == mianzi.length
                    && hudi.n_zipai > 0)
                    return [{ name: '混一色', fanshu: (hudi.menqian ? 3 : 2) }];
        }
        return [];
    }
    function chunquandaiyaojiu() {
        if (hudi.n_yaojiu == 5 && hudi.n_shunzi > 0 && hudi.n_zipai == 0)
                return [{ name: '纯全带幺九', fanshu: (hudi.menqian ? 3 : 2) }];
        return [];
    }
    function erbeikou() {
        if (! hudi.menqian)     return [];
        const shunzi = hudi.shunzi;
        let beikou = shunzi.m.concat(shunzi.p).concat(shunzi.s)
                        .map(x=>x>>1).reduce((a,b)=>a+b);
        if (beikou == 2)        return [{ name: '二杯口', fanshu: 3 }];
        return [];
    }
    function qingyise() {
        for (let s of ['m','p','s']) {
            const yise = new RegExp(`^[${s}]`);
            if (mianzi.filter(m=>m.match(yise)).length == mianzi.length)
                    return [{ name: '清一色', fanshu: (hudi.menqian ? 6 : 5) }];
        }
        return [];
    }

    function guoshiwushuang() {
        if (mianzi.length != 13)    return [];
        if (hudi.danqi)         return [{ name: '国士无双十三面', fanshu: '**' }];
        else                    return [{ name: '国士无双', fanshu: '*' }];
    }
    function sianke() {
        if (hudi.n_ankezi != 4)     return [];
        if (hudi.danqi)         return [{ name: '四暗刻单骑', fanshu: '**' }];
        else                    return [{ name: '四暗刻', fanshu: '*' }];
    }
    function dasanyuan() {
        const kezi = hudi.kezi;
        if (kezi.z[5] + kezi.z[6] + kezi.z[7] == 3) {
            let bao_mianzi = mianzi.filter(m =>
                                m.match(/^z([567])\1\1(?:[\+\=\-]|\1)(?!\!)/));
            let baojia = (bao_mianzi[2] && bao_mianzi[2].match(/[\+\=\-]/));
            if (baojia)
                    return [{ name: '大三元', fanshu: '*', baojia: baojia[0]}];
            else    return [{ name: '大三元', fanshu: '*'}];
        }
        return [];
    }
    function sixihu() {
        const kezi = hudi.kezi;
        if (kezi.z[1] + kezi.z[2] + kezi.z[3] + kezi.z[4] == 4) {
            let bao_mianzi = mianzi.filter(m =>
                                m.match(/^z([1234])\1\1(?:[\+\=\-]|\1)(?!\!)/));
            let baojia = (bao_mianzi[3] && bao_mianzi[3].match(/[\+\=\-]/));
            if (baojia)
                    return [{name: '大四喜', fanshu: '**', baojia: baojia[0]}];
            else    return [{name: '大四喜', fanshu: '**'}];
        }
        if (kezi.z[1] + kezi.z[2] + kezi.z[3] + kezi.z[4] == 3
            && mianzi[0].match(/^z[1234]/))
                                return [{ name: '小四喜', fanshu: '*' }];
        return [];
    }
    function ziyise() {
        if (hudi.n_zipai == mianzi.length)
                                return [{ name: '字一色', fanshu: '*' }];
        return [];
    }
    function lvyise() {
        if (mianzi.filter(m => m.match(/^[mp]/)).length > 0)      return [];
        if (mianzi.filter(m => m.match(/^z[^6]/)).length > 0)     return [];
        if (mianzi.filter(m => m.match(/^s.*[1579]/)).length > 0) return [];
        return [{ name: '绿一色', fanshu: '*' }];
    }
    function qinglaotou() {
        if (hudi.n_yaojiu == 5 && hudi.n_kezi == 4 && hudi.n_zipai == 0)
                                return [{ name: '清老头', fanshu: '*' }];
        return [];
    }
    function sigangzi() {
        if (hudi.n_gangzi == 4) return [{ name: '四杠子', fanshu: '*' }];
        return [];
    }
    function jiulianbaodeng() {
        if (mianzi.length != 1)     return [];
        if (mianzi[0].match(/^[mpsz]1112345678999/))
                                return [{ name: '纯正九莲宝灯', fanshu: '**' }];
        else                    return [{ name: '九莲宝灯', fanshu: '*' }];
    }

    let damanguan = (pre_hupai.length > 0 && pre_hupai[0].fanshu[0] == '*')
                        ? pre_hupai : [];
    damanguan = damanguan
                .concat(guoshiwushuang())
                .concat(sianke())
                .concat(dasanyuan())
                .concat(sixihu())
                .concat(ziyise())
                .concat(lvyise())
                .concat(qinglaotou())
                .concat(sigangzi())
                .concat(jiulianbaodeng());

    for (let hupai of damanguan) {
        if (! rule['ダブル役満あり']) hupai.fanshu = '*';
        if (! rule['役満パオあり']) delete hupai.baojia;
        hupai.type = 'yaku';
    }
    if (damanguan.length > 0) return damanguan;

    let hupai = pre_hupai
                .concat(menqianqing())
                .concat(fanpai())
                .concat(pinghu())
                .concat(duanyaojiu())
                .concat(yibeikou())
                .concat(sansetongshun())
                .concat(yiqitongguan())
                .concat(hunquandaiyaojiu())
                .concat(qiduizi())
                .concat(duiduihu())
                .concat(sananke())
                .concat(sangangzi())
                .concat(sansetongke())
                .concat(hunlaotou())
                .concat(xiaosanyuan())
                .concat(hunyise())
                .concat(chunquandaiyaojiu())
                .concat(erbeikou())
                .concat(qingyise());

    if (hupai.length > 0) {
        for (let h of hupai) {
            if (!h.type) h.type = 'yaku';
        }
        hupai = hupai.concat(post_hupai);
    }

    return hupai;
}

function get_post_hupai(shoupai, rongpai, baopai, fubaopai) {

    let new_shoupai = shoupai.clone();
    if (rongpai) new_shoupai.zimo(rongpai);
    let paistr = new_shoupai.toString();

    let post_hupai = [];

    let suitstr = paistr.match(/[mpsz][^mpsz,]*/g);

    let n_baopai = 0;
    /* 宝牌计算日志 */
    let baopaiLog = { indicators: [], dora: [], matchedTiles: [] };
    for (let p of baopai) {
        let indicator = p;
        p = Majiang.Shan.zhenbaopai(p);
        baopaiLog.indicators.push(indicator);
        baopaiLog.dora.push(p);
        const regexp = new RegExp(p[1],'g');
        for (let m of suitstr) {
            if (m[0] != p[0]) continue;
            m = m.replace(/0/,'5');
            let nn = m.match(regexp);
            if (nn && nn.length > 0) {
                baopaiLog.matchedTiles.push(p + '×' + nn.length + '(from ' + m + ')');
                n_baopai += nn.length;
            }
        }
    }
    if (n_baopai) post_hupai.push({ name: '宝牌', fanshu: n_baopai, type: 'dora' });

    let n_hongpai = 0;
    let nn = paistr.match(/0/g);
    if (nn) n_hongpai = nn.length;
    if (n_hongpai) post_hupai.push({ name: '红宝牌', fanshu: n_hongpai, type: 'dora' });

    let n_fubaopai = 0;
    /* 里宝牌计算日志 */
    let fubaopaiLog = { indicators: [], uraDora: [], matchedTiles: [] };
    for (let p of fubaopai || []) {
        let indicator = p;
        p = Majiang.Shan.zhenbaopai(p);
        fubaopaiLog.indicators.push(indicator);
        fubaopaiLog.uraDora.push(p);
        const regexp = new RegExp(p[1],'g');
        for (let m of suitstr) {
            if (m[0] != p[0]) continue;
            m = m.replace(/0/,'5');
            let nn = m.match(regexp);
            if (nn && nn.length > 0) {
                fubaopaiLog.matchedTiles.push(p + '×' + nn.length + '(from ' + m + ')');
                n_fubaopai += nn.length;
            }
        }
    }
    if (n_fubaopai) post_hupai.push({ name: '里宝牌', fanshu: n_fubaopai, type: 'dora' });

    return post_hupai;
}

function get_defen(fu, hupai, rongpai, param) {

    if (hupai.length == 0) return { defen: 0 };

    let menfeng = param.menfeng;
    let fanshu, damanguan, defen, base, baojia, defen2, base2, baojia2;

    if (hupai[0].fanshu[0] == '*') {
        fu = undefined;
        damanguan = ! param.rule['役満の複合あり'] ? 1
                  : hupai.map(h => h.fanshu.length).reduce((x, y) => x + y);
        base      = 8000 * damanguan;

        let h = hupai.find(h => h.baojia);
        if (h) {
            baojia2 = (menfeng + { '+': 1, '=': 2, '-': 3}[h.baojia]) % 4;
            base2   = 8000 * Math.min(h.fanshu.length, damanguan);
        }
    }
    else {
        fanshu = hupai.map(h => h.fanshu).reduce((x, y) => x + y);
        base   = (fanshu >= 13 && param.rule['数え役満あり'])
                                ? 8000
               : (fanshu >= 11) ? 6000
               : (fanshu >=  8) ? 4000
               : (fanshu >=  6) ? 3000
               : param.rule['切り上げ満貫あり'] && fu << (2 + fanshu) == 1920
                    ? 2000
                    : Math.min(fu << (2 + fanshu), 2000);
    }

    let fenpei  = [ 0, 0, 0, 0 ];
    let chang = param.jicun.changbang;
    let lizhi = param.jicun.lizhibang;

    if (baojia2 != null) {
        if (rongpai) base2 = base2 / 2;
        base   = base - base2;
        defen2 = base2 * (menfeng == 0 ? 6 : 4);
        fenpei[menfeng] += defen2;
        fenpei[baojia2] -= defen2;
    }
    else defen2 = 0;

    if (rongpai || base == 0) {
        baojia = (base == 0)
                    ? baojia2
                    : (menfeng + { '+': 1, '=': 2, '-': 3}[rongpai[2]]) % 4;
        defen  = Math.ceil(base * (menfeng == 0 ? 6 : 4) / 100) * 100;
        fenpei[menfeng] += defen + chang * 300 + lizhi * 1000;
        fenpei[baojia]  -= defen + chang * 300;
    }
    else {
        let zhuangjia = Math.ceil(base * 2 / 100) * 100;
        let sanjia    = Math.ceil(base     / 100) * 100;
        if (menfeng == 0) {
            defen = zhuangjia * 3;
            for (let l = 0; l < 4; l++) {
                if (l == menfeng)
                        fenpei[l] += defen     + chang * 300 + lizhi * 1000;
                else    fenpei[l] -= zhuangjia + chang * 100;
            }
        }
        else {
            defen = zhuangjia + sanjia * 2;
            for (let l = 0; l < 4; l++) {
                if (l == menfeng)
                        fenpei[l] += defen     + chang * 300 + lizhi * 1000;
                else if (l == 0)
                        fenpei[l] -= zhuangjia + chang * 100;
                else    fenpei[l] -= sanjia    + chang * 100;
            }
        }
    }

    return {
        hupai:      hupai,
        fu:         fu,
        fanshu:     fanshu,
        damanguan:  damanguan,
        defen:      defen + defen2,
        fenpei:     fenpei
    };
}

function hule(shoupai, rongpai, param) {

    if (rongpai) {
        if (! rongpai.match(/[\+\=\-]$/)) throw new Error(rongpai);
        rongpai = rongpai.slice(0,2) + rongpai.slice(-1);
    }

    let max;

    let pre_hupai  = get_pre_hupai(param.hupai);
    let post_hupai = get_post_hupai(shoupai, rongpai,
                                    param.baopai, param.fubaopai);

    for (let mianzi of hule_mianzi(shoupai, rongpai)) {

        let hudi  = get_hudi(mianzi, param.zhuangfeng, param.menfeng,
                             param.rule);
        let hupai = get_hupai(mianzi, hudi, pre_hupai, post_hupai, param.rule);
        let rv    = get_defen(hudi.fu, hupai, rongpai, param);

        if (! max || rv.defen > max.defen
            || rv.defen == max.defen
                && (! rv.fanshu || rv.fanshu > max.fanshu
                    || rv.fanshu == max.fanshu && rv.fu > max.fu)) max = rv;
    }

    return max;
}

function hule_param(param = {}) {

    let rv = {
        rule:           param.rule       ?? Majiang.rule(),
        zhuangfeng:     param.zhuangfeng ?? 0,
        menfeng:        param.menfeng    ?? 1,
        hupai: {
            lizhi:      param.lizhi      ?? 0,
            yifa:       param.yifa       ?? false,
            qianggang:  param.qianggang  ?? false,
            lingshang:  param.lingshang  ?? false,
            haidi:      param.haidi      ?? 0,
            tianhu:     param.tianhu     ?? 0
        },
        baopai:         param.baopai   ? [].concat(param.baopai)   : [],
        fubaopai:       param.fubaopai ? [].concat(param.fubaopai) : null,
        jicun: {
            changbang:  param.changbang  ?? 0,
            lizhibang:  param.lizhibang  ?? 0
        }
    };

    return rv;
}

module.exports = {
    hule:           hule,
    hule_param:     hule_param,
    hule_mianzi:    hule_mianzi,
    get_post_hupai: get_post_hupai,
};
