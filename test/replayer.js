/**
 * 牌谱复现器 CLI
 * 
 * 加载保存的增强型牌谱，还原到指定步骤，检查错误或继续运行。
 * 支持标准模式和 debug 模式：debug 模式输出详细日志用于排查错误。
 * 
 * 用法：
 *   # 列出牌谱中所有步骤（查找出错的步骤）
 *   node test/replayer.js --paipu=test/paipu/game_xxx.json --list
 *   
 *   # 还原到某局某步并查看场况
 *   node test/replayer.js --paipu=test/paipu/game_xxx.json --round=3 --step=15 --inspect
 *   
 *   # 还原到指定步骤，在 debug 模式下续跑复现错误
 *   node test/replayer.js --paipu=test/paipu/crash_xxx.json --round=3 --step=15 --debug --cont
 *   
 *   # 从第一局开始 debug 续跑（自动检测错误位置）
 *   node test/replayer.js --paipu=test/paipu/crash_xxx.json --debug --cont
 *   
 *   # 还原后仅查看场况（不续跑）
 *   node test/replayer.js --paipu=test/paipu/game_xxx.json --round=3 --step=0 --inspect
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { restoreGame, buildScenario, continueFromState } = require('./game-restorer');

/* ===== 命令行参数 ===== */
const args = {};
process.argv.slice(2).forEach(arg => {
    let m = arg.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
    else if (arg.match(/^--(list|debug|cont|inspect|verbose)$/)) args[arg.slice(2)] = true;
});

/* ===== 加载牌谱 ===== */
let paipuPath = args.paipu;
if (!paipuPath) {
    /* 尝试找最新的牌谱 */
    let paipuDir = path.join(__dirname, 'paipu');
    if (fs.existsSync(paipuDir)) {
        let files = fs.readdirSync(paipuDir)
            .filter(f => f.endsWith('.json'))
            .sort();
        if (files.length > 0) {
            /* 优先找崩溃牌谱 */
            let crashes = files.filter(f => f.startsWith('crash_'));
            if (crashes.length > 0) {
                paipuPath = path.join(paipuDir, crashes[crashes.length - 1]);
            } else {
                paipuPath = path.join(paipuDir, files[files.length - 1]);
            }
            console.log('使用最新牌谱: ' + path.basename(paipuPath));
        }
    }
}
if (!paipuPath) {
    console.error('用法: node test/replayer.js --paipu=<path> [--round=N] [--step=N] [--debug] [--cont] [--list] [--inspect]');
    process.exit(1);
}

let paipu = JSON.parse(fs.readFileSync(paipuPath, 'utf-8'));

console.log('╔══════════════════════════════════════╗');
console.log('║  牌谱复现器                           ║');
console.log('╚══════════════════════════════════════╝');
console.log('牌谱: ' + path.basename(paipuPath));
console.log('  标题:    ' + (paipu.title || '无标题'));
console.log('  玩家:    ' + (paipu.player || []).join(', '));
console.log('  总局数:  ' + paipu.log.length);
console.log('  有墙数据: ' + (!!paipu.wall ? '有（可完整复现）' : '无（部分复现）'));
console.log('  角色记录: ' + (paipu.character ? '有' : '无'));

if (paipu._error) {
    console.log('  记录错误: ' + paipu._error.message);
    console.log('  错误标签: ' + (paipu._error.label || ''));
}

/* 显示总步数和各局步数 */
console.log('\n  各局步数:');
for (let r = 0; r < paipu.log.length; r++) {
    console.log('    第' + (r+1) + '局: ' + paipu.log[r].length + ' 步');
}

/* ===== --list: 列出所有步骤 ===== */
if (args.list) {
    let globalIdx = 0;
    for (let r = 0; r < paipu.log.length; r++) {
        let roundLog = paipu.log[r];
        console.log('\n--- 第' + (r+1) + '局 (' + roundLog.length + ' 步) ---');
        for (let s = 0; s < roundLog.length; s++) {
            let entry = roundLog[s];
            let keys = Object.keys(entry);
            let opType = keys[0] || '?';
            let brief = _formatBrief(opType, entry[opType]);
            console.log('  [' + globalIdx + '] 局'+(r+1)+'步'+s+' ' + opType + ' ' + brief);
            globalIdx++;
        }
    }
    console.log('\n总步数: ' + globalIdx);
    process.exit(0);
}

/* ===== 确定目标 ===== */
let round = parseInt(args.round) || 1;
let step = parseInt(args.step) || 0;
let debug = !!args.debug;
let cont = !!args.cont;
let inspect = !!args.inspect;
let verbose = !!args.verbose || debug;

/* ===== 还原游戏 ===== */
console.log('\n--- 还原游戏 ---');
console.log('目标: 局' + round + ' 步' + step + (debug ? ' [DEBUG模式]' : ''));
console.log();

try {
    var result = restoreGame(paipu, {
        stopAtRound: round,
        stopAtRoundStep: step,
        debug: verbose,
    });
} catch (e) {
    console.error('还原失败: ' + e.message);
    console.error(e.stack);
    process.exit(1);
}

let game = result.game;
let model = game._model;

console.log('还原完成');
console.log('  当前状态: ' + game._status);
console.log('  当前玩家: ' + model.lunban + ' (' + (model.player && model.player[model.lunban]) + ')');
console.log('  剩余牌数: ' + (model.shan ? model.shan.paishu : '?'));
console.log('  得分:     ' + (model.defen || []).join(', '));
console.log('  局号:     ' + (model.jushu != null ? model.jushu : '?'));
console.log('  庄风:     ' + (model.zhuangfeng != null ? model.zhuangfeng : '?'));

/* ===== --inspect: 详细场况 ===== */
if (inspect) {
    _printInspect(game, model, paipu);
    if (!cont) process.exit(0);
}

/* ===== --cont: 续跑 ===== */
if (cont) {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  ' + (debug ? 'DEBUG模式续跑' : '标准模式续跑') + '                     ║');
    console.log('╚══════════════════════════════════════╝');

    game._sync = true;
    game.speed = 0;
    game.wait = 0;

    /* Debug 模式：注入详细日志钩子 */
    if (debug) {
        _injectContinueDebugHooks(game);
    }

    /* 使用 game-restorer 的 continueFromState */
    let contResult = continueFromState(game, { debug, verbose });

    if (contResult.success) {
        console.log('\n✅ 续跑完成，无崩溃！');
        console.log('  完成的局数: ' + contResult.roundsCompleted);
        console.log('  执行步数:   ' + contResult.totalSteps);
        console.log('  最终得分:   ' + (model.defen || []).join(', '));
    } else {
        console.error('\n❌ 续跑崩溃: ' + contResult.error.message);
        if (debug || verbose) {
            console.error('  status=' + game._status
                + ' lunban=' + (model ? model.lunban : '?')
                + ' paishu=' + (model && model.shan ? model.shan.paishu : '?'));
            console.error(contResult.error.stack);
        }
        /* 保存崩溃牌谱 */
        _saveCrashPaipu(game, contResult.error, paipuPath);
        process.exit(1);
    }
}

/* ===== 如果不是 cont 也不是 inspect，显示简要场况 ===== */
if (!cont && !inspect) {
    console.log('\n提示: 使用 --inspect 查看详细场况，--cont 续跑，--debug --cont 调试续跑');
}

/* ================================================================
 * 辅助函数
 * ================================================================ */

function _formatBrief(opType, data) {
    if (!data) return '';
    switch (opType) {
    case 'qipai': return '庄风=' + data.zhuangfeng + ' 场=' + data.jushu;
    case 'zimo': return 'l=' + data.l + ' p=' + (data.p || '?');
    case 'dapai':
        return 'l=' + data.l + ' p=' + (data.p || '?')
            + (data.hidden ? ' [暗]' : '');
    case 'fulou': return 'l=' + data.l + ' m=' + (data.m || '?');
    case 'gang': return 'l=' + data.l + ' m=' + (data.m || '?');
    case 'gangzimo': return 'l=' + data.l + ' p=' + (data.p || '?');
    case 'kaigang': return '';
    case 'hule':
        return 'defen=' + JSON.stringify(data.defen || [])
            + (data.shoupai ? ' 手牌=' + data.shoupai.join('/') : '');
    case 'pingju':
        return 'name=' + (data.name || '?')
            + (data.fenpei ? ' 点=' + JSON.stringify(data.fenpei) : '');
    default: return JSON.stringify(data).slice(0, 50);
    }
}

function _printInspect(game, model, paipu) {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  场况详情                             ║');
    console.log('╚══════════════════════════════════════╝');

    for (let l = 0; l < 4; l++) {
        let shoupai = model.shoupai[l];
        let he = model.he[l];
        let charId = game._skillManager ? game._skillManager.getCharacterId(l) : null;
        let charName = charId || '无角色';
        let isActive = model.lunban === l;

        console.log('\n玩家' + l + ' [' + (model.player && model.player[l]) + '] '
            + (isActive ? '◀ 当前' : '') + ' 角色: ' + charName);
        console.log('  手牌: ' + (shoupai ? shoupai.toString() : '?'));
        if (shoupai) {
            try {
                console.log('  向听: ' + require('../src/core/index').Util.xiangting(shoupai));
            } catch (e) {
                console.log('  向听: ?');
            }
        }
        console.log('  牌河: ' + (he ? he._pai.join(' ') : '?')
            + ' (' + (he ? he._pai.length : 0) + '张)');
        console.log('  副露: ' + (shoupai && shoupai._fulou ? shoupai._fulou.length : 0));

        /* 技能信息 */
        if (game._skillManager) {
            let chars = game._skillManager.getCharacter(l);
            if (chars && chars.skills) {
                console.log('  技能: ' + chars.skills.map((s, i) =>
                    '[' + i + '] ' + (s.name || s.description || '技能' + i)).join(' | '));
            }
        }
    }

    /* 牌山信息 */
    if (model.shan) {
        console.log('\n--- 牌山状态 ---');
        console.log('  剩余牌数: ' + model.shan.paishu
            + ' cursor=' + model.shan._cursor + '/' + model.shan._stacks.length
            + ' 王牌起始=' + model.shan._haitei);
        console.log('  宝牌指示牌: ' + (model.shan.baopai || []).join(', '));
        if (model.shan._fubaopai && model.shan._fubaopai.length > 0) {
            console.log('  里宝指示牌: ' + model.shan._fubaopai.join(', '));
        }
        console.log('  岭上摸牌: ' + model.shan._rinshan_drawn);
        console.log('  已翻宝牌数: ' + model.shan._dora_flipped);
    }

    /* 牌谱元信息 */
    if (paipu._error) {
        console.log('\n--- 牌谱错误信息 ---');
        console.log('  错误: ' + paipu._error.message);
        if (paipu._error.stack) {
            console.log('  Stack:\n    ' + paipu._error.stack.split('\n').join('\n    '));
        }
    }
}

/**
 * Debug 模式下注入详细日志钩子
 */
function _injectContinueDebugHooks(game) {
    let model = game._model;
    let stepCount = 0;

    /* 拦截游戏步骤 */
    let origZimo = game.zimo.bind(game);
    game.zimo = function() {
        stepCount++;
        console.log('  [DEBUG:' + stepCount + '] zimo lunban=' + model.lunban
            + ' paishu=' + (model.shan ? model.shan.paishu : '?'));
        let result = origZimo();
        console.log('    -> status=' + game._status);
        return result;
    };

    let origDapai = game.dapai.bind(game);
    game.dapai = function() {
        console.log('  [DEBUG:' + stepCount + '] dapai p=' + (game._dapai || '?')
            + ' hidden=' + game._dapaiHidden);
        return origDapai();
    };

    /* 拦截 AI 决策 */
    let origReplyZimo = game.reply_zimo.bind(game);
    game.reply_zimo = function() {
        let playerIdx = model.player_id ? model.player_id[model.lunban] : null;
        let player = playerIdx != null ? game._players[playerIdx] : null;

        if (player && typeof player.select_dapai === 'function') {
            let origSelectDapai = player.select_dapai.bind(player);
            player.select_dapai = function(info) {
                try {
                    let n_xt = require('../src/core/index').Util.xiangting(player.shoupai);
                    console.log('  [DEBUG:' + stepCount + '] AI P' + playerIdx
                        + ' 向听=' + n_xt
                        + ' 手牌=' + String(player.shoupai));
                } catch (e) {}
                let result = origSelectDapai(info);
                console.log('  [DEBUG:' + stepCount + '] AI P' + playerIdx
                    + ' 打=' + (result ? (result.p || result) : '?'));
                player.select_dapai = origSelectDapai;
                return result;
            };
        }
        return origReplyZimo();
    };

    /* 拦截技能日志 */
    let origAddActionLog = game._add_action_log.bind(game);
    game._add_action_log = function(text, seat) {
        if (text.includes('发动') || text.includes('技能')) {
            let playerIdx = model.player_id ? model.player_id[seat] : seat;
            console.log('  [DEBUG:' + stepCount + '] 技能 P' + playerIdx + ' ' + text);
        }
        return origAddActionLog(text, seat);
    };

    /* 拦截 fulou/gang */
    let origReplyFulou = game.reply_fulou.bind(game);
    game.reply_fulou = function() {
        console.log('  [DEBUG:' + stepCount + '] fulou lunban=' + model.lunban);
        return origReplyFulou();
    };

    let origReplyGang = game.reply_gang.bind(game);
    game.reply_gang = function() {
        console.log('  [DEBUG:' + stepCount + '] gang lunban=' + model.lunban);
        return origReplyGang();
    };

    /* 局结束时打印 */
    let origReplyHule = game.reply_hule.bind(game);
    game.reply_hule = function() {
        console.log('  [DEBUG:' + stepCount + '] hule defen=[' + (model.defen || []).join(',') + ']');
        return origReplyHule();
    };

    let origReplyPingju = game.reply_pingju.bind(game);
    game.reply_pingju = function() {
        console.log('  [DEBUG:' + stepCount + '] pingju');
        return origReplyPingju();
    };
}

function _saveCrashPaipu(game, error, origPath) {
    const { serializeShan } = require('./shan-serialize');
    let paipu = game._paipu;
    if (!paipu.wall && game._model.shan) {
        paipu.wall = serializeShan(game._model.shan);
    }
    paipu._replay_error = {
        message: error.message,
        stack: error.stack ? error.stack.split('\n').slice(0, 10).join('\n') : '',
        status: game._status,
        lunban: game._model ? game._model.lunban : null,
    };

    let crashPath = origPath.replace(/\.json$/, '_replay_crash.json');
    let dir = path.dirname(crashPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(crashPath, JSON.stringify(paipu, null, 2));
    console.log('  崩溃牌谱已保存: ' + path.basename(crashPath));
}
