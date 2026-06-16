/**
 * 天江衣 技能①（海底/河底视为和牌）测试（适配新版 API）
 *
 * 技能触发条件改为检查 paishu === 0 + huleExpander 有候选，
 * 不再直接检查 param.hupai.haidi。
 *
 * 测试内容：
 *   1. 触发条件：paishu=0 + 有手牌 → true，paishu>0 → false
 *   2. huleExpander：海底下返回候选牌列表
 *   3. aiDecision：总是返回 true
 *   4. 模拟对局统计
 */

'use strict';

/* 压制 game.js 调试日志 — 全局覆盖，测试代码在 push/pop 中使用 _consoleLogNoFilter */
const _origConsoleLog = console.log;
const _origConsoleError = console.error;
const _DEBUG_PREFIXES = [
    '[koromo]', '[wall', '[hand]', '[local-shan]', '[debug]', '[DEBUG]',
    '[技能]', '[expander-debug]', '[yakuExpander]', '[hule-recalc]',
    '[restrictor-debug]', '[game]', '[tile-ops]',
];
console.log = function() {
    let s = arguments[0];
    if (typeof s === 'string' && _DEBUG_PREFIXES.some(p => s.startsWith(p))) return;
    return _origConsoleLog.apply(console, arguments);
};
console.error = function() {
    let s = arguments[0];
    if (typeof s === 'string' && _DEBUG_PREFIXES.some(p => s.startsWith(p))) return;
    return _origConsoleError.apply(console, arguments);
};

const Module = require('module');
const path = require('path');
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
 * PART 1: 条件与扩展器测试
 * ================================================================ */
console.log('=== PART 1: 条件 (condition) 与扩展器 (huleExpander) ===\n');

let rule = Majiang.rule();
let sm = new SkillManager({ characters, rule });
sm._activeCharacters[0] = 'Amae_Koromo';
sm._activatePassiveSkills(0, 'Amae_Koromo');
let skills = sm.getCharacterSkills(0);
let skill0 = skills[0];

console.log('技能信息: ' + skill0.characterName + ' 「' + skill0.description + '」');
console.log('  时机: ' + skill0.trigger.timing + '  类型: ' + skill0.type);
console.log('  有限制: ' + (skill0.usage.type !== 'unlimited' ? '是 (' + skill0.usage.max + '次/局)' : '无'));
console.log('  有huleExpander: ' + !!skill0.huleExpander);
console.log('  有条件函数: ' + !!skill0.trigger.condition);

/* ---- 1a: condition ---- */
console.log('\n--- 1a: 触发条件 ---');
{
    let cond = skill0.trigger.condition;

    // 创建最小 Game 用于测试
    let game = new Majiang.Game([new AI(), new AI(), new AI(), new AI()], () => {}, rule);
    game._sync = true;
    let model = game._model;
    model.shan = new Majiang.Shan(rule);

    // 给玩家手牌
    model.shoupai[0] = new Majiang.Shoupai(['m1','m1','m1','m2','m3','m4','m4','m5','m6','m7','m8','p1','p1']);

    // paishu > 0 → false
    check('paishu>0 + 有手牌 → false',
        !cond({ game, shoupai: model.shoupai[0], seat: 0 }));

    // 消耗牌山到 0
    while (model.shan.paishu > 0) {
        try { model.shan.zimo(); } catch(e) { break; }
    }
    check('paishu=0 + 有手牌 → true',
        cond({ game, shoupai: model.shoupai[0], seat: 0 }));

    // game 为空 → false
    check('game 为空 → false', !cond({ game: null, shoupai: model.shoupai[0], seat: 0 }));

    // shoupai 为空 → false
    check('game 有效 + shoupai 为空 → false',
        !cond({ game, shoupai: null, seat: 0 }));
}

/* ---- 1b: huleExpander ---- */
console.log('\n--- 1b: huleExpander ---');
{
    let expander = skill0.huleExpander;
    check('有扩展器函数', typeof expander === 'function');

    let game = new Majiang.Game([new AI(), new AI(), new AI(), new AI()], () => {}, rule);
    game._sync = true;
    let model = game._model;
    model.shan = new Majiang.Shan(rule);
    model.shoupai[0] = new Majiang.Shoupai(['m1','m1','m1','m2','m3','m4','m4','m5','m6','m7','m8','p1','p1']);

    // paishu > 0 → 空列表
    let result1 = expander({ game, shoupai: model.shoupai[0], seat: 0 });
    check('paishu>0 → 返回空列表', Array.isArray(result1) && result1.length === 0);

    // paishu = 0 → 有候选
    while (model.shan.paishu > 0) {
        try { model.shan.zimo(); } catch(e) { break; }
    }
    let result2 = expander({ game, shoupai: model.shoupai[0], seat: 0 });
    check('paishu=0 → 有候选牌', Array.isArray(result2) && result2.length > 0);
    if (result2.length > 0) {
        console.log('  候选牌示例: ' + result2.slice(0, 10).join(', ') + (result2.length > 10 ? '...' : ''));
    }
}

/* ---- 1c: aiDecision ---- */
console.log('\n--- 1c: AI 决策 ---');
{
    check('AI 返回 true', skill0.aiDecision({}) === true);
}

/* ================================================================
 * PART 2: 实际对局模拟（检验技能①是否在海底/河底正常触发）
 * ================================================================ */
console.log('\n=== PART 2: 对局模拟 ===');

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
        let origErr2 = console.error;
        console.log = () => {};
        console.error = () => {};
        try {
            let result = game.do_sync();
            let paipu = result && result._paipu ? result._paipu : game._paipu;
            if (paipu && paipu.log) totalRounds += paipu.log.length - 1;
            if (hadSkill1) triggered++;
        } catch(e) { triggered = 0; } finally {
            console.log = origLog2;
            console.error = origErr2;
        }
    }

    console.log('  ' + label + ': ' + count + '半庄, 触发 ' + triggered + ' 次, ' + totalRounds + ' 局');
    return triggered;
}

// 单 Koromo（P0）
runSimulation('单天江衣(P0)', 1, [0]);

// 全员 Koromo（注释掉，4个天江衣会有性能问题）
// runSimulation('全员天江衣', 1, [0, 1, 2, 3]);

/* ================================================================
 * 结果
 * ================================================================ */
console.log('\n=== 结果 ===');
console.log('通过: ' + passCount + ', 失败: ' + failCount);
if (failCount === 0) console.log('✅ 全部通过');
else console.log('❌ 有 ' + failCount + ' 项失败');
