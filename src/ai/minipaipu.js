/*
 *  minipaipu
 */
"use strict";

const Majiang = require('@kobalab/majiang-core');

function parse_heinfo(heinfo, menfeng, paistr) {

    let he = [], fulou = [];
    for (let i = 0; i < 4; i++) {
        let l = (menfeng + i) % 4;
        fulou[l] = (heinfo[i]||'').split(/,/);
        he[l] = fulou[l].shift().match(/[mpsz]\d[_\*\+\=\-\^]*/g) || [];
        fulou[l] = fulou[l].map(m => Majiang.Shoupai.valid_mianzi(m))
                           .filter(m => m);
    }
    fulou[menfeng] = paistr.split(/,/).slice(1);

    for (let l = 0; l < 4; l++) {
        for (let m of fulou[l].reverse()) {

            if (m.match(/[mpsz]\d{3}[\+\=\-]\d$/)) {
                let p = m[0] + m[5] + '^';
                let i = he[l].lastIndexOf(p);
                if (i >= 0) {
                    he[l][i] = `^,${m}`;
                    m = m.slice(0,5);
                }
            }

            let d = { '+': 1, '=': 2, '-': 3 }[m.match(/[\+\=\-]/)] || 0;
            if (d) {
                let p = m[0] + m.match(/\d[\+\=\-]/);
                let i = he[(l+d)%4].map(p=>p.replace(/[_\*]/,''))
                                   .lastIndexOf(p);
                if (i < 0) he[(l+d)%4].unshift(`${p},${m}`);
                else       he[(l+d)%4][i] += `,${m}`;
            }
            else {
                let p = m[0] + m[1] + '^';
                let i = he[l].lastIndexOf(p);
                if (i < 0) he[l].unshift(`^,${m}`);
                else       he[l][i] = `^,${m}`;
            }
        }
    }
    return he;
}

function play_heinfo(player, heinfo, menfeng, paistr, fix) {

    let he = parse_heinfo(heinfo, menfeng, paistr);

    let rv = ['','','',''];

    let l = 0, fulou, gang;
    while (he.find(h => h && h.length) || gang) {
        if (! he[l].length || fulou && he[l][0][0] == '^') {
            if (fulou) {
                player.model.shoupai[l]._bingpai._--;
                fulou = null;
            }
            else {
                player.shan.paishu--;
            }
            if (gang) {
                he[l].unshift(`^,${gang}`);
                gang = null;
            }
            l = (l + 1) % 4;
            continue;
        }

        let id = player.model.seatToPlIdx[l];

        let [ p, m ] = he[l].shift().split(/,/);

        if (p == '^') {
            if (l != menfeng) {
                player.zimo({ l: l, m:'_'});
                player.gang({ l: l, m: m });
            }
            else {
                player.shan.paishu--;
            }
            rv[id] += m[0] + (m[5]||m[1]) + '^';
            continue;
        }
        else {
            p = p.replace(/[\+\=\-\^]$/,'');

            if (! fulou) {
                player.zimo({ l: l, p: p });
            }
            else if (l == menfeng) {
                player._suanpai._paishu[p[0]][p[1]]--;
                if (p[1] == 0) player._suanpai._paishu[p[0]][5]--;
            }

            player.dapai({ l: l, p: p });

            rv[id] += p;
            if (gang) {
                he[l].unshift(`^,${gang}`);
                gang = null;
            }
        }

        if (m) {

            let d = { '+': 1, '=': 2, '-': 3 }[m.match(/[\+\=\-]/)];
            l = (l + 4 - d) % 4;

            if (m.match(/[mpsz]\d{3}[\+\=\-]\d$/)) {
                gang = m;
                m = m.slice(0,5);
            }

            if (l != menfeng) {
                player.fulou({ l: l, m: m });
            }
            else {
                player.model.he[player.model.lunban].fulou(m);
                player.shoupai._bingpai._++;
                player._suanpai._paishu[p[0]][p[1]]++;
                if (p[1] == 0) player._suanpai._paishu[p[0]][5]++;
            }
            rv[id] += m.match(/[\+\=\-]/);

            if (m.length == 5) fulou = m;
        }
        else {
            l = (l + 1) % 4;
            fulou = null;
        }
    }

    player.shoupai.fromString(paistr);
    for (let i = 1; i < 4; i++) {
        let l = (menfeng + i) % 4;
        let fulou = (heinfo[i]||'').split(/,/).slice(1)
                                   .map(m => Majiang.Shoupai.valid_mianzi(m))
                                   .filter(m => m);
        rv[i] = [ rv[i], ...fulou ].join(',');
        if (fix) player.model.shoupai[l]._fulou = fulou;
    }

    return rv;
}

function minipaipu(player, baseinfo, heinfo, fix) {

    let { paistr, zhuangfeng, menfeng, baopai, hongpai, xun } = baseinfo;

    baopai = baopai.filter(p => Majiang.Shoupai.valid_pai(p));

    const rule = hongpai ? Majiang.rule({'赤牌':{m:1,p:1,s:1}})
                         : Majiang.rule({'赤牌':{m:0,p:0,s:0}});

    player.kaiju({ id: 0, rule: rule, qijia: 0 });

    let qipai = {
        zhuangfeng: zhuangfeng,
        jushu:      [0,3,2,1][menfeng],
        changbang:  0,
        lizhibang:  0,
        defen:      [25000,25000,25000,25000],
        baopai:     baopai.shift(),
        shoupai:    ['','','','']
    };
    qipai.shoupai[menfeng] = paistr;

    player.qipai(qipai);

    if (player.shoupai.get_dapai()) player.model.shan.paishu--;

    let rv;
    if (heinfo)   rv = play_heinfo(player, heinfo, menfeng, paistr, fix);
    else if (xun) player.shan.paishu -= (xun - 1) * 4 + menfeng;

    while (baopai.length) player.kaigang({ baopai: baopai.shift() });
    if (player._suanpai._n_zimo) player._suanpai._n_zimo = player.shan.paishu;

    return rv;
}

module.exports = minipaipu;
