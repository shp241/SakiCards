/**
 * 天江衣 技能①（海底/河底视为和牌）完整测试
 *
 * 海底/河底极难自然触发，本测试用以下两种方式覆盖：
 * 1. 单元测试：直接模拟 reply_hule 中 haidi=1/2 的场景
 * 2. 迷你牌山：构造接近牌山末尾的场景，让 Koromo 在海底/河底听牌
 */

'use strict';

/* 压制 game.js 调试日志 */
const _origConsoleLog = console.log;
console.log = function() {
    let s = arguments[0];
    if (typeof s === 'string' && (s.startsWith('[koromo]') || s.startsWith('[wall') || s.startsWith('[hand]') || s.startsWith('[local-shan]') || s.startsWith('[debug]'))) return;
    return _origConsoleLog.apply(console, arguments);
};

const Module = require('module');
const path = require('path');
const fs = require('fs');
const originalResolveFilename = Module._resolveFilename;
const ROOT = path.resolve(__dirname, '..');
Module._resolveFilename = function(request, parent, isMain, options) {
    const aliases = {
        '@kobalab/majiang-core': path.resolve(ROOT, 'src/core/index.js'),
        '@kobalab/majiang-ai': path.resolve(ROOT, 'src/ai/index.js'),
    };
    if (aliases[request]) return aliases[request];
    return originalResolveFilename.call(this, request, parent, isMain, options);
};

const Majiang = require('@kobalab/majiang-core');
const AI = require('@kobalab/majiang-ai');
const characters = require('../src/skill/characters_skills');
const { SkillManager } = require('../src/skill/index');

let passCount = 0, failCount = 0;
function check(desc, cond) {
    if (cond) { passCount++; console.log('  ✓ ' + desc); }
    else      { failCount++; console.log('  ✗ ' + desc); }
}

/* ================================================================
 * PART 1: 单元测试 — 直接测试技能条件、AI决策、执行
 * ================================================================ */
console.log('=== PART 1: 单元测试 ===\n');

let rule = Majiang.rule();
let sm = new SkillManager({ characters, rule });
sm._activeCharacters[0] = 'Amae_Koromo';
sm._activatePassiveSkills(0, 'Amae_Koromo');
let skills = sm.getCharacterSkills(0);
let skill0 = skills[0];  // 技能① 在 skills[0] 位

console.log('技能信息: ' + skill0.characterName + ' 「' + skill0.description + '」');
console.log('  时机: ' + skill0.trigger.timing + '  类型: ' + skill0.type);

/* ---- 1a: trigger.condition ---- */
console.log('\n--- 1a: 触发条件 ---');
{
    let cond = skill0.trigger.condition;

    check('haidi=1 (海底) + rongpai=null → true',
        cond({ game: { _model: { shan: { paishu: 0 } } }, param: { hupai: { haidi: 1 } } }));
    check('haidi=2 (河底) + rongpai=m1 → true',
        cond({ game: { _model: { shan: { paishu: 0 } } }, param: { hupai: { haidi: 2 } } }));
    check('haidi=0 (非海底) → false',
        cond({ game: { _model: { shan: { paishu: 5 } } }, param: { hupai: { haidi: 0 } } }) === false);
    check('兜底: paishu=0 + rongpai=m2 → true',
        cond({ game: { _model: { shan: { paishu: 0 } } }, param: {}, rongpai: 'm2' }));
    check('兜底: paishu=0 + rongpai=null → false',
        cond({ game: { _model: { shan: { paishu: 0 } } }, param: {}, rongpai: null }) === false);
    check('game 为空 → false',
        cond({ game: null, param: { hupai: { haidi: 1 } } }) === false);
}

/* ---- 1b: AI 决策 ---- */
console.log('\n--- 1b: AI 决策 ---');
{
    check('AI 总是激活 (海底/河底有机会就发动)',
        skill0.aiDecision({ player: 0 }) === true
        || skill0.aiDecision({ player: 0 }).activate === true);
}

/* ---- 1c: execute ---- */
console.log('\n--- 1c: execute ---');
{
    let r = skill0.effect.execute({ player: 0 });
    check('executed = true', r.executed === true);
    check('needWinTileSelection = true', r.needWinTileSelection === true);
}

/* ================================================================
 * PART 2: 天江衣和牌选择逻辑测试（_handleKoromoWinTileSelection 核心逻辑）
 * ================================================================ */
console.log('\n=== PART 2: 和牌选择逻辑 ===\n');

function testWinTileSelection(desc, menfeng, haidiVal, rongpai, tenpaiHand) {
    console.log('--- ' + desc + ' ---');

    let game = new Majiang.Game([new AI(), new AI(), new AI(), new AI()], () => {}, rule);
    game._sync = true;
    game.speed = 0;
    game.wait = 0;

    let gsm = new SkillManager({ characters, rule });
    game.skillManager = gsm;
    for (let i = 0; i < 4; i++) {
        gsm._activeCharacters[i] = 'Amae_Koromo';
        gsm._activatePassiveSkills(i, 'Amae_Koromo');
    }

    // 初始化基本状态
    let model = game._model;
    model.qijia = 0;
    model.zhuangfeng = 0;
    model.jushu = 0;
    model.changbang = 0;
    model.lizhibang = 0;
    model.defen = [25000, 25000, 25000, 25000];

    for (let l = 0; l < 4; l++) {
        model.shoupai[l] = new Majiang.Shoupai([]);
        model.he[l] = new Majiang.He();
        model.player_id[l] = (menfeng) % 4;  // simplify for test
    }

    // 设置 Koromo 的手牌
    model.shoupai[menfeng] = new Majiang.Shoupai(tenpaiHand);
    model.lunban = (menfeng + 3) % 4;  // 上一个玩家

    // 计算 param
    let shoupai = model.shoupai[menfeng].clone();
    let param = {
        rule: rule,
        zhuangfeng: model.zhuangfeng,
        menfeng: (menfeng - model.qijia - model.jushu + 4) % 4,
        hupai: {
            lizhi: 0, yifa: 0, qianggang: false, lingshang: false,
            haidi: haidiVal, tianhu: 0
        },
        baopai: [],
        fubaopai: null,
        jicun: { changbang: 0, lizhibang: 0 }
    };

    let xiangting_before = Majiang.Util.xiangting(shoupai);
    console.log('  向听数(不含荣牌): ' + xiangting_before);

    // 模拟 _koromoGetAllPossibleWins
    let results = [];
    if (xiangting_before === 0) {
        let tingpaiList = Majiang.Util.tingpai(shoupai);
        for (let p of tingpaiList) {
            if (p[1] !== '0') results.push({ pai: p, fromHidden: false });
        }
    }
    console.log('  可选和牌数: ' + results.length + ' → ' + results.map(r => r.pai).join(', '));

    // 按 defen 排序选最佳
    let scored = [];
    for (let w of results) {
        let s2 = shoupai.clone();
        if (rongpai) {
            let rp = w.pai + '_+=-'[(4 + model.lunban - menfeng) % 4];
            let h = Majiang.Util.hule(s2, rp, param);
            scored.push({ ...w, defen: h.defen || 0, damanguan: !!h.damanguan });
        } else {
            let s3 = shoupai.clone();
            try { s3.zimo(w.pai); } catch(e) {}
            let h = Majiang.Util.hule(s3, null, param);
            scored.push({ ...w, defen: h.defen || 0, damanguan: !!h.damanguan });
        }
    }
    scored.sort((a, b) => {
        if (a.damanguan !== b.damanguan) return b.damanguan - a.damanguan;
        return b.defen - a.defen;
    });

    if (scored.length > 0) {
        let best = scored[0];
        console.log('  最佳选择: ' + best.pai + ' (defen=' + best.defen + (best.damanguan ? ' 役满' : '') + ')');
    }

    // 验证
    check('有可选和牌', results.length > 0);
    console.log('  实际可选: ' + results.map(r => r.pai).join(', '));
}

/* 场景 A: 简单听牌 (m4,m5 两面听 m3,m6) */
testWinTileSelection(
    '场景A: 两面听牌 + 河底荣和', 0, 2, 'm3',
    ['m1','m1','m1','m2','m3','m4','m4','m5','m6','m7','m8','p1','p1']
);

/* 场景 B: 多面听牌 (三面听) */
testWinTileSelection(
    '场景B: 三面听 + 海底自摸', 0, 1, null,
    ['m2','m3','m3','m3','m4','m4','m4','m5','m5','m5','p1','p1','p1']
);

/* 场景 C: 字牌听牌 */
testWinTileSelection(
    '场景C: 字牌听 + 河底荣和', 0, 2, 'm1',
    ['z1','z1','z1','m2','m2','m2','m3','m3','m3','p1','p1','p2','p2']
);

/* 场景 D: 役满机会 */
testWinTileSelection(
    '场景D: 役满 (国士无双听牌) + 河底', 0, 2, 'm5',
    ['m1','m9','p1','p9','s1','s9','z1','z2','z3','z4','z5','z6','z7']
);

/* ================================================================
 * PART 3: 迷你牌山端到端测试 — 直接调用 reply_hule 模拟海底场景
 * ================================================================ */
console.log('\n=== PART 3: reply_hule 场景模拟 ===\n');

function testReplyHuleScenario(desc, menfeng, haidiVal, useRongpai, tenpaiHand) {
    console.log('--- ' + desc + ' ---');

    let game = new Majiang.Game([new AI(), new AI(), new AI(), new AI()], () => {}, rule);
    game._sync = true;
    game.speed = 0;
    game.wait = 0;

    let gsm = new SkillManager({ characters, rule });
    game.skillManager = gsm;
    for (let i = 0; i < 4; i++) {
        gsm._activeCharacters[i] = 'Amae_Koromo';
        gsm._activatePassiveSkills(i, 'Amae_Koromo');
    }

    let model = game._model;
    model.qijia = 0;
    model.zhuangfeng = 0;
    model.jushu = 0;
    model.changbang = 0;
    model.lizhibang = 0;
    model.defen = [25000, 25000, 25000, 25000];
    model.lunban = (menfeng + 3) % 4;

    for (let l = 0; l < 4; l++) {
        model.he[l] = new Majiang.He();
        model.player_id[l] = l;
    }

    // 给 Koromo 听牌手牌
    model.shoupai[menfeng] = new Majiang.Shoupai(tenpaiHand);

    // 给其他人随便发点牌
    for (let l = 0; l < 4; l++) {
        if (l === menfeng) continue;
        model.shoupai[l] = new Majiang.Shoupai(['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','p4']);
    }

    // 创建最小牌山（paishu=0 触发海底）
    model.shan = new Majiang.Shan(rule);
    // 消耗所有牌
    while (model.shan.paishu > 0) {
        try { model.shan.zimo(); } catch(e) { break; }
    }

    // 初始化 hule 相关状态
    game._fenpei = [0, 0, 0, 0];
    game._lianzhuang = false;
    game._changbang = 0;
    game._neng_rong = [true, true, true, true];
    game._yifa = [0, 0, 0, 0];
    game._lizhi = [0, 0, 0, 0];
    game._diyizimo = false;
    game._dapaiHidden = false;
    game._rule = rule;
    game._koromoHuleSelectionDone = false;
    game._hasKoromoSkills = game._hasKoromoSkills.bind(game);

    // 设置 _dapai 为某个牌（模拟玩家刚舍牌）
    game._dapai = useRongpai || 'm1';
    game._status = 'dapai';  // 荣和来自 dapai 状态

    let skill1Triggered = false;
    let skill1Log = [];
    let huleCompleted = false;
    let origAddActionLog = game._add_action_log.bind(game);
    game._add_action_log = function(text, seat) {
        if (text.includes('天江衣·①') || text.includes('天江衣·将海底') || text.includes('海底/河底')) {
            skill1Triggered = true;
        }
        if (text.includes('天江衣')) skill1Log.push(text);
        return origAddActionLog(text, seat);
    };

    // 拦截 delay 防止它实际执行后续
    game.delay = function(fn, t) { return 0; };

    try {
        if (useRongpai) {
            /* 河底荣和: rongpai 不为 null → haidi=2 */
            game._hule = [menfeng];  // 让 hule() 取到 menfeng
            game.hule();
        } else {
            /* 海底自摸: rongpai=null → haidi=1 */
            game._hule = [model.lunban];  // 自摸时 menfeng = model.lunban
            game.hule();
        }
    } catch(e) {
        console.log('  hule 异常: ' + e.message);
    }

    let huleLogs = (game._paipu && game._paipu.action_log ? game._paipu.action_log.flat() : [])
        .filter(l => typeof l === 'string' && l.includes('天江衣'));

    console.log('  技能①触发: ' + (skill1Triggered ? '是 ✓' : '否'));
    for (let l of huleLogs) console.log('    ' + l);

    check('技能①在海底/河底正常触发', skill1Triggered);
}

/* 场景: 河底荣和 — Koromo 听牌时有人舍最后一张牌 */
testReplyHuleScenario('河底荣和: Koromo(P0) 听牌 + 河底荣和', 0, 2, 'm2',
    ['m1','m1','m1','m2','m3','m4','m4','m5','m6','m7','m8','p1','p1']);

/* 场景: 海底自摸 — Koromo 自摸最后一张牌 */
testReplyHuleScenario('海底自摸: Koromo(P0) 听牌 + 海底自摸', 0, 1, null,
    ['m1','m1','m1','m2','m3','m4','m4','m5','m6','m7','m8','p1','p1']);

/* 场景: 非 Koromo 不能触发 — 只有 P0 是 Koromo，P1 不能触发 */
{
    let game = new Majiang.Game([new AI(), new AI(), new AI(), new AI()], () => {}, rule);
    game._sync = true;
    game.speed = 0;
    game.wait = 0;
    let gsm = new SkillManager({ characters, rule });
    game.skillManager = gsm;
    gsm._activeCharacters[0] = 'Amae_Koromo';
    gsm._activatePassiveSkills(0, 'Amae_Koromo');

    let model = game._model;
    model.qijia = 0;
    model.zhuangfeng = 0;
    model.jushu = 0;
    model.changbang = 0;
    model.lizhibang = 0;
    model.defen = [25000, 25000, 25000, 25000];
    model.lunban = 2;  // P2 舍牌，P1 荣和

    for (let l = 0; l < 4; l++) {
        model.he[l] = new Majiang.He();
        model.player_id[l] = l;
    }
    model.shoupai[1] = new Majiang.Shoupai(['m1','m1','m1','m2','m3','m4','m4','m5','m6','m7','m8','p1','p1']);
    for (let l = 0; l < 4; l++) {
        if (l === 1) continue;
        model.shoupai[l] = new Majiang.Shoupai(['m1','m2','m3','m4','m5','m6','m7','m8','m9','p1','p2','p3','p4']);
    }
    model.shan = new Majiang.Shan(rule);
    while (model.shan.paishu > 0) { try { model.shan.zimo(); } catch(e) { break; } }

    game._fenpei = [0,0,0,0]; game._lianzhuang = false; game._changbang = 0;
    game._neng_rong = [true,true,true,true]; game._yifa = [0,0,0,0];
    game._lizhi = [0,0,0,0]; game._diyizimo = false; game._dapaiHidden = false;
    game._rule = rule; game._koromoHuleSelectionDone = false;
    game._hasKoromoSkills = game._hasKoromoSkills.bind(game);
    game._dapai = 'm2'; game._status = 'dapai'; game._hule = [1]; // P1 荣和
    game.delay = function(fn, t) { return 0; };

    let triggered = false;
    let origLog = game._add_action_log.bind(game);
    game._add_action_log = function(text, seat) {
        if (text.includes('天江衣·①') || text.includes('天江衣·将海底')) triggered = true;
        return origLog(text, seat);
    };
    try { game.hule(); } catch(e) {}
    console.log('  河底荣和: 非Koromo(P1) 技能①触发: ' + (triggered ? '是 ✗' : '否 ✓'));
    check('非Koromo 不能触发技能①', !triggered);
}

/* ================================================================
 * PART 4: 模拟对局统计（大量对局中统计技能①触发）
 * ================================================================ */
console.log('\n=== PART 4: 大量对局统计 ===');

function runSimulation(label, count, koromoPositions) {
    let triggered = 0;
    let totalRounds = 0;

    for (let g = 0; g < count; g++) {
        let game = new Majiang.Game([new AI(), new AI(), new AI(), new AI()], () => {}, rule);
        game._sync = true;
        game.speed = 0;
        game.wait = 0;

        let gsm = new SkillManager({ characters, rule });
        game.skillManager = gsm;
        for (let pos of koromoPositions) {
            gsm._activeCharacters[pos] = 'Amae_Koromo';
            gsm._activatePassiveSkills(pos, 'Amae_Koromo');
        }

        let hadSkill1 = false;
        let origLog = game._add_action_log.bind(game);
        game._add_action_log = function(text, seat) {
            if (text.includes('天江衣·①') || text.includes('天江衣·将海底')) hadSkill1 = true;
            return origLog(text, seat);
        };

        let origLog2 = console.log;
        console.log = () => {};
        try {
            let r = game.do_sync();
            let paipu = r._paipu || game._paipu;
            if (paipu && paipu.log) totalRounds += paipu.log.length - 1;
            if (hadSkill1) triggered++;
        } catch(e) {} finally {
            console.log = origLog2;
        }
    }

    console.log('  ' + label + ': ' + count + '半庄, 触发 ' + triggered + ' 次, ' + totalRounds + ' 局');
    return triggered;
}

// 单 Koromo（P0）
runSimulation('单天江衣(P0)', 10, [0]);

// 全员 Koromo
runSimulation('全员天江衣', 10, [0, 1, 2, 3]);

/* ================================================================
 * 结果
 * ================================================================ */
console.log('\n=== 结果 ===');
console.log('通过: ' + passCount + ', 失败: ' + failCount);
if (failCount === 0) console.log('✅ 全部通过');
else console.log('❌ 有 ' + failCount + ' 项失败');
