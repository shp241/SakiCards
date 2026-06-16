/**
 * 超能力麻将 - 角色 AI 技能模拟测试（增强版）
 * 
 * 支持标准对战和 debug 两种模式。
 * - 标准模式：静默运行，每局牌谱自动保存，出错时记录完整牌谱
 * - Debug 模式：输出大量详细日志（技能触发、AI决策、每步状态），保存所有牌谱
 * 
 * 牌谱记录初始牌堆和所有操作，可使用 game-restorer.js 快速还原，
 * 也可通过 replayer.js + --debug 模式快速复现场况查找错误。
 * 
 * 用法：
 *   node test/simulate.js --chars=both --games=20
 *   node test/simulate.js --chars=Aislinn --games=5 --debug
 *   node test/simulate.js --chars=Koromo --games=10 --out=test/paipu/koromo
 */

'use strict';

const Module = require('module');
const path = require('path');
const fs = require('fs');
const originalResolveFilename = Module._resolveFilename;
const ROOT = path.resolve(__dirname, '..');

Module._resolveFilename = function(request, parent, isMain, options) {
    const aliases = {
        '@kobalab/majiang-core': path.resolve(ROOT, 'src/core/index.js'),
        '@kobalab/majiang-ai': path.resolve(ROOT, 'src/ai/index.js'),
        '@kobalab/majiang-ui': path.resolve(ROOT, 'src/ui/index.js'),
    };
    if (aliases[request]) return aliases[request];
    return originalResolveFilename.call(this, request, parent, isMain, options);
};

const Majiang = require('@kobalab/majiang-core');
const AI = require('@kobalab/majiang-ai');
const characters = require('../src/skill/characters_skills');
const { SkillManager } = require('../src/skill/index');
const { serializeShan } = require('./shan-serialize');

/* ================================================================
 * 命令行参数
 * ================================================================ */
const args = {};
process.argv.slice(2).forEach(arg => {
    let m = arg.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
    else if (arg === '--debug') args.debug = true;
    else if (arg === '--verbose') args.verbose = true;
});

const CONFIG = {
    charMode: args.chars || 'both',
    gamesPerTest: parseInt(args.games) || 20,
    debug: !!args.debug,
    verbose: !!args.verbose || !!args.debug,
    workers: parseInt(args.workers) || 0,
    outDir: args.out || path.join(__dirname, 'paipu'),
};

/* ================================================================
 * 工具函数
 * ================================================================ */
function getChar(charName) {
    return characters.find(c => c.id === charName) || null;
}

function charNameById(id) {
    let c = characters.find(c => c.id === id);
    return c ? c.name : id || 'none';
}

function pad(n, w) { return String(n).padStart(w); }

/* 确保输出目录存在 */
if (!fs.existsSync(CONFIG.outDir)) {
    fs.mkdirSync(CONFIG.outDir, { recursive: true });
}

/* ================================================================
 * 全局统计
 * ================================================================ */
const stats = {
    totalGames: 0,
    totalRounds: 0,
    crashes: 0,
    crashPaipuPaths: [],
    errors: [],
    koromo: {
        skill1Activated: 0, skill2Activated: 0, skill4Activated: 0,
        skill4Swapped: 0, skill4NoSwap: 0,
        paishuZeroSkip: 0, paishuOneN1: 0, zihaiSkipped: 0,
    },
    aislinn: {
        skill0Activated: 0, skill0Rejected: 0,
        skill1Activated: 0, skill1Rejected: 0, riverDrawCount: 0,
    },
};

/* ================================================================
 * 牌谱保存
 * ================================================================ */

/** 全局牌谱计数器 */
let paipuSeq = 0;

/**
 * 保存增强型牌谱（含初始牌山 + 所有操作记录 + 角色分配）
 */
function savePaipu(game, label, error) {
    paipuSeq++;
    let paipu = game._paipu;

    /* 附加初始牌山（如果还没有保存） */
    if (!paipu.wall && game._model && game._model.shan) {
        paipu.wall = serializeShan(game._model.shan);
    }

    /* 附加角色分配信息 */
    if (game._skillManager && game._skillManager._activeCharacters) {
        let chars = [];
        for (let i = 0; i < 4; i++) {
            let charId = game._skillManager._activeCharacters[i] || null;
            chars.push(charId ? { id: charId, name: charNameById(charId) } : null);
        }
        paipu.character = chars;
    }

    /* 附加错误信息 */
    if (error) {
        paipu._error = {
            message: error.message,
            stack: error.stack ? error.stack.split('\n').slice(0, 15).join('\n') : '',
            label: label,
        };
    }

    /* 附加测试元信息 */
    paipu._test_label = label;
    paipu._test_config = {
        charMode: CONFIG.charMode,
        debug: CONFIG.debug,
    };
    paipu._timestamp = new Date().toISOString();
    paipu._seq = paipuSeq;

    /* 生成文件名 */
    let fname = label.replace(/[\/\\:*?"<>|#]/g, '_').replace(/\s+/g, '_');
    let isError = !!error;
    let prefix = isError ? 'crash_' : '';
    let seqStr = pad(paipuSeq, 4);
    let filepath = path.join(CONFIG.outDir, prefix + seqStr + '_' + fname + '.json');

    fs.writeFileSync(filepath, JSON.stringify(paipu, null, 2));

    if (CONFIG.verbose || isError) {
        console.log('  [牌谱] ' + (isError ? '💥 ' : '💾 ') + path.basename(filepath)
            + (isError ? ' [含错误]' : ''));
    }

    return filepath;
}

/* ================================================================
 * Debug 日志辅助
 * ================================================================ */

function debugLog(game, type, data) {
    if (!CONFIG.debug) return;

    let m = game._model;
    let prefix = pad(data.step || 0, 3);

    switch (type) {
    case 'step':
        console.log('  [DEBUG:' + prefix + '] ' + data.op
            + ' lunban=' + m.lunban
            + ' paishu=' + (m.shan ? m.shan.paishu : '?')
            + (data.p ? ' p=' + data.p : '')
            + ' defen=[' + (m.defen || []).join(',') + ']');
        break;
    case 'ai_decision':
        console.log('  [DEBUG:' + prefix + '] AI决策 P' + data.playerIdx
            + ' 向听=' + data.xiangting
            + ' 打=' + data.dapai
            + ' ev=' + (data.ev != null ? data.ev.toFixed(1) : '?')
            + ' 待牌=' + (data.tingpaiCnt || 0) + '种'
            + (data.weixian != null ? ' 危险=' + data.weixian.toFixed(1) : ''));
        break;
    case 'skill':
        console.log('  [DEBUG:' + prefix + '] 技能 P' + data.playerIdx
            + ' ' + data.charName
            + ' 「' + data.skillName + '」'
            + (data.action || '')
            + (data.detail ? ' ' + data.detail : ''));
        break;
    case 'round_start':
        console.log('\n  [DEBUG] ═══ 第' + data.round + '局开始 ═══'
            + ' 庄家=' + data.oya);
        break;
    case 'round_end':
        console.log('  [DEBUG] ═══ 第' + data.round + '局结束: '
            + data.result + ' ═══');
        break;
    }
}

/* ================================================================
 * 游戏运行器
 * ================================================================ */

let globalStepCounter = 0;

function runOneGame(charAssignments, testLabel) {
    stats.totalGames++;
    let gameLog = { label: testLabel, rounds: 0, events: [], wallSaved: false };
    let game = null;
    globalStepCounter = 0;

    try {
        /* ==== 创建 AI 玩家 ==== */
        let players = [];
        for (let i = 0; i < 4; i++) {
            players[i] = new AI();
        }

        /* ==== 创建对局 ==== */
        let rule = Majiang.rule();
        game = new Majiang.Game(players, () => {}, rule);
        game._sync = true;
        game.speed = 0;
        game.wait = 0;

        /* ==== 技能管理器 ==== */
        let sm = new SkillManager({ characters, rule });
        game.skillManager = sm;

        /* ==== 分配角色 ==== */
        for (let i = 0; i < 4; i++) {
            if (charAssignments[i]) {
                sm._activeCharacters[i] = charAssignments[i];
                sm._activatePassiveSkills(i, charAssignments[i]);
            }
        }

        if (CONFIG.debug) {
            console.log('  [DEBUG] 角色分配: ' +
                charAssignments.map((c, i) => 'P' + i + '=' + charNameById(c)).join(', '));
        }

        /* ================================================================
         * 拦截日志和游戏事件（debug 模式注入详细日志）
         * ================================================================ */

        /* ---- 技能触发日志 ---- */
        let origAddActionLog = game._add_action_log.bind(game);
        game._add_action_log = function(text, seat) {
            let playerIdx = game._model.seatToPlIdx[seat];
            let charId = sm.getCharacterId(playerIdx);

            /* 统计计数 */
            if (text.includes('天江衣·①')) stats.koromo.skill1Activated++;
            if (text.includes('天江衣·②')) stats.koromo.skill2Activated++;
            if (text.includes('天江衣·④」')) {
                if (text.includes('公开了牌山末尾')) stats.koromo.skill4Activated++;
                if (text.includes('只展示不交换')) stats.koromo.skill4NoSwap++;
            }
            if (text.includes('交换了')) stats.koromo.skill4Swapped++;

            if (text.includes('发动了技能「爱丝琳·威夏尔特·')) {
                if (text.includes('可进行额外巡')) stats.aislinn.skill0Activated++;
                if (text.includes('从牌河摸牌')) stats.aislinn.skill1Activated++;
            }
            if (text.includes('技能「爱丝琳·威夏尔特·从牌河摸牌 ') && text.includes('拒绝了')) {
                stats.aislinn.skill1Rejected++;
            }

            /* Debug 详细日志 */
            if (CONFIG.debug && (charId === 'Amae_Koromo' || charId === 'Aislinn_Wishart')) {
                let skillName = '';
                if (text.includes('天江衣·①')) skillName = '海底/河底和牌';
                else if (text.includes('天江衣·②')) skillName = '移动海底牌';
                else if (text.includes('天江衣·④')) skillName = '展示交换';
                else if (text.includes('爱丝琳·威夏尔特·从牌河摸牌')) skillName = '牌河摸牌';
                else if (text.includes('爱丝琳·威夏尔特·额外巡')) skillName = '额外巡';

                debugLog(game, 'skill', {
                    step: globalStepCounter,
                    playerIdx,
                    charName: charNameById(charId),
                    skillName,
                    detail: text,
                });
            }

            gameLog.events.push({ seat, charId, text });
            return origAddActionLog(text, seat);
        };

        /* ---- Debug: 拦截游戏步骤 ---- */
        if (CONFIG.debug) {
            _injectDebugHooks(game, sm);
        }

        /* ---- 牌山记录（在 kaiju 后首次 qipai 前拦截） ---- */
        let origGameStart = game.game_start;
        game.game_start = function() {
            origGameStart.call(game);
            if (!gameLog.wallSaved && game._model && game._model.shan) {
                game._paipu.wall = serializeShan(game._model.shan);
                gameLog.wallSaved = true;
                if (CONFIG.debug) {
                    console.log('  [DEBUG] 牌山已记录 paishu=' + game._model.shan.paishu
                        + ' cursor=' + game._model.shan._cursor);
                }
            }
        };

        /* ==== 运行（标准模式静默 core 日志） ==== */
        let origConsoleLog = console.log;
        let origConsoleError = console.error;
        if (!CONFIG.debug) {
            /* 标准模式：静默 game.js 核心的调试日志，只保留错误输出 */
            console.log = () => {};
        }
        let result;
        try {
            result = game.do_sync();
        } finally {
            console.log = origConsoleLog;
            console.error = origConsoleError;
        }
        let paipu = result._paipu || game._paipu;

        if (paipu && paipu.log) {
            gameLog.rounds = paipu.log.length - 1;
            stats.totalRounds += Math.max(0, gameLog.rounds);
        }

        if (CONFIG.verbose) {
            let charStr = charAssignments.map((c, i) => 'P' + i + '=' + charNameById(c)).join(' ');
            console.log('  [' + testLabel + '] 完成, ' + gameLog.rounds + '局, ' + charStr);
        }

        /* 检查异常 */
        for (let e of gameLog.events) {
            if (e.text.includes('跳过') && e.charId === 'Amae_Koromo') {
                if (e.text.includes('paishu < 1')) stats.koromo.paishuZeroSkip++;
                if (e.text.includes('paishu')) stats.koromo.paishuOneN1++;
            }
        }

        /* 保存牌谱（标准模式也自动保存） */
        let savedPath = savePaipu(game, testLabel, null);
        if (CONFIG.verbose) {
            console.log('  [牌谱] 已保存: ' + path.basename(savedPath));
        }

    } catch (e) {
        stats.crashes++;
        stats.errors.push({
            label: testLabel,
            game: stats.totalGames,
            message: e.message,
            stack: e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : '',
        });

        console.error('  [' + testLabel + '] CRASH: ' + e.message);
        if (CONFIG.debug || CONFIG.verbose) {
            console.error('  Stack: ' + (e.stack ? e.stack.split('\n').slice(0, 5).join('\n  ') : ''));
        }

        /* 保存崩溃牌谱 */
        if (game) {
            let crashPath = savePaipu(game, testLabel, e);
            stats.crashPaipuPaths.push(crashPath);
            console.error('  💥 崩溃牌谱已保存: ' + path.basename(crashPath));
        }
    }
}

/* ================================================================
 * Debug 注入：详细日志钩子
 * ================================================================ */

function _injectDebugHooks(game, sm) {
    let model = game._model;

    /* ---- zimo 钩子 ---- */
    let origZimo = game.zimo.bind(game);
    game.zimo = function() {
        globalStepCounter++;
        let p = model.shan && model.shan._stacks.length
            ? model.shan._stacks[model.shan._cursor || 0]
            : null;
        let pai = p ? (p.top || p.bottom || '?') : '?';
        debugLog(game, 'step', {
            step: globalStepCounter,
            op: 'zimo',
            p: pai,
        });
        return origZimo();
    };

    /* ---- dapai 钩子 ---- */
    let origDapai = game.dapai.bind(game);
    game.dapai = function(dp) {
        debugLog(game, 'step', {
            step: globalStepCounter,
            op: 'dapai',
            p: dp || game._dapai,
        });
        return origDapai(dp);
    };

    /* ---- reply_zimo 钩子：捕获 AI 打牌决策 ---- */
    let origReplyZimo = game.reply_zimo.bind(game);
    game.reply_zimo = function() {
        let playerIdx = game._model.seatToPlIdx[model.lunban];
        let player = game._players[playerIdx];

        /* 拦截 AI select_dapai 来采集决策信息 */
        if (player && typeof player.select_dapai === 'function') {
            let origSelectDapai = player.select_dapai.bind(player);
            player.select_dapai = function(info) {
                let n_xiangting = Majiang.Util.xiangting(player.shoupai);
                let result = origSelectDapai(info);
                if (CONFIG.debug && result) {
                    debugLog(game, 'ai_decision', {
                        step: globalStepCounter,
                        playerIdx,
                        xiangting: n_xiangting,
                        dapai: result.p || result,
                        ev: info && info.find(i => i.p === (result.p || result)) ? info.find(i => i.p === (result.p || result)).ev : null,
                        tingpaiCnt: info && info.find(i => i.p === (result.p || result)) ? info.find(i => i.p === (result.p || result)).n_tingpai : null,
                        weixian: info && info.find(i => i.p === (result.p || result)) ? info.find(i => i.p === (result.p || result)).weixian : null,
                    });
                }
                /* 恢复原始方法 */
                player.select_dapai = origSelectDapai;
                return result;
            };
        }

        return origReplyZimo();
    };

    /* ---- reploy_fulou 钩子 ---- */
    let origReplyFulou = game.reply_fulou.bind(game);
    game.reply_fulou = function() {
        let playerIdx = game._model.seatToPlIdx[model.lunban];
        if (CONFIG.debug) {
            debugLog(game, 'step', {
                step: globalStepCounter,
                op: 'fulou',
            });
        }
        return origReplyFulou();
    };

    /* ---- reply_gang 钩子 ---- */
    let origReplyGang = game.reply_gang.bind(game);
    game.reply_gang = function() {
        if (CONFIG.debug) {
            debugLog(game, 'step', {
                step: globalStepCounter,
                op: 'gang',
            });
        }
        return origReplyGang();
    };

    /* ---- hule/pingju 钩子 ---- */
    let origReplyHule = game.reply_hule.bind(game);
    game.reply_hule = function() {
        if (CONFIG.debug) {
            debugLog(game, 'round_end', {
                round: (game._paipu.log ? game._paipu.log.length : '?'),
                result: '和了 defen=[' + (model.defen || []).join(',') + ']',
            });
        }
        return origReplyHule();
    };

    let origReplyPingju = game.reply_pingju.bind(game);
    game.reply_pingju = function() {
        if (CONFIG.debug) {
            debugLog(game, 'round_end', {
                round: (game._paipu.log ? game._paipu.log.length : '?'),
                result: '流局',
            });
        }
        return origReplyPingju();
    };
}

/* ================================================================
 * 测试组
 * ================================================================ */

function runTestGroup(label, getAssignments, count) {
    count = count || CONFIG.gamesPerTest;
    console.log('\n=== ' + label + ' (' + count + ' 半庄) ===');
    for (let i = 0; i < count; i++) {
        runOneGame(getAssignments(i), label + '#' + (i + 1));
    }
}

/* ================================================================
 * 主流程
 * ================================================================ */

console.log('╔══════════════════════════════════════╗');
console.log('║  超能力麻将 AI 技能模拟测试            ║');
console.log('║  模式: ' + (CONFIG.debug ? 'DEBUG (详细日志)'.padEnd(24) : '标准'.padEnd(28)) + ' ║');
console.log('║  角色: ' + CONFIG.charMode.padEnd(32) + ' ║');
console.log('║  每组半庄: ' + String(CONFIG.gamesPerTest).padEnd(25) + ' ║');
console.log('║  输出: ' + CONFIG.outDir.padEnd(32) + ' ║');
console.log('╚══════════════════════════════════════╝');

let startTime = Date.now();

if (CONFIG.workers > 1) {
    /* ================================================================
     * 并行模式：使用 child_process 并行运行
     * ================================================================ */
    console.log('  并行工作进程: ' + CONFIG.workers + '\n');
    const { fork } = require('child_process');
    const workerPath = path.join(__dirname, 'simulate-worker.js');

    // 构建测试组列表
    // both 模式：每个 worker 内部已跑所有三组，不需要再单独分 Koromo/Aislinn
    let testGroups = [];
    if (CONFIG.charMode === 'both') {
        testGroups.push({ chars: 'both' });
    } else if (CONFIG.charMode === 'Koromo') {
        testGroups.push({ chars: 'Koromo' });
    } else if (CONFIG.charMode === 'Aislinn') {
        testGroups.push({ chars: 'Aislinn' });
    }

    // 每个组分配 worker
    let allWorkers = [];
    for (let tg of testGroups) {
        let gamesPerWorker = Math.ceil(CONFIG.gamesPerTest / CONFIG.workers);
        for (let w = 0; w < CONFIG.workers; w++) {
            allWorkers.push({
                chars: tg.chars,
                games: gamesPerWorker,
                id: (allWorkers.length + 1),
            });
        }
    }

    // 启动所有 worker 并行
    console.log('  启动 ' + allWorkers.length + ' 个 worker...');
    let promises = allWorkers.map(w => {
        return new Promise((resolve) => {
            let worker = fork(workerPath, [
                '--chars=' + w.chars,
                '--games=' + w.games,
                '--id=' + w.id,
                '--out=' + CONFIG.outDir,
            ], { silent: true });

            let stdout = '';
            let stderr = '';
            worker.stdout.on('data', d => stdout += d);
            worker.stderr.on('data', d => stderr += d);

            worker.on('close', (code) => {
                if (stderr) process.stderr.write('  [worker ' + w.id + ' stderr] ' + stderr.trim().replace(/\n/g, '\n  ') + '\n');
                try {
                    let result = JSON.parse(stdout.trim());
                    resolve({ ok: true, result });
                } catch(e) {
                    resolve({ ok: false, error: stdout.trim() || 'exit code ' + code });
                }
            });
        });
    });

    // 等待所有 worker 完成
    Promise.all(promises).then(results => {
        for (let r of results) {
            if (!r.ok) {
                stats.errors.push({ message: '并行 worker 失败: ' + (r.error || 'unknown'), label: 'worker' });
                continue;
            }
            let w = r.result;
            stats.totalGames += w.totalGames;
            stats.totalRounds += w.totalRounds;
            stats.crashes += w.crashes;
            stats.koromo.skill1Activated += (w.koromo.skill1Activated || 0);
            stats.koromo.skill2Activated += (w.koromo.skill2Activated || 0);
            stats.koromo.skill4Activated += (w.koromo.skill4Activated || 0);
            stats.koromo.skill4Swapped += (w.koromo.skill4Swapped || 0);
            stats.koromo.skill4NoSwap += (w.koromo.skill4NoSwap || 0);
            stats.aislinn.skill0Activated += (w.aislinn.skill0Activated || 0);
            stats.aislinn.skill1Activated += (w.aislinn.skill1Activated || 0);
            stats.aislinn.skill1Rejected += (w.aislinn.skill1Rejected || 0);
            if (w.errors) {
                for (let e of w.errors) stats.errors.push({ message: String(e), label: 'worker-' + w.workerId });
            }
        }
        printReport(startTime);
    }).catch(e => {
        stats.errors.push({ message: '并行执行异常: ' + e.message, label: 'system' });
        printReport(startTime);
    });

    // 并行模式下 result report 在回调中执行
    process.stdout.write(''); // 保持事件循环
} else {
    /* ================================================================
     * 串行模式（原有逻辑）
     * ================================================================ */
    if (CONFIG.charMode === 'Koromo' || CONFIG.charMode === 'both') {
        runTestGroup('全员天江衣', () => ['Amae_Koromo', 'Amae_Koromo', 'Amae_Koromo', 'Amae_Koromo']);
    }

    if (CONFIG.charMode === 'Aislinn' || CONFIG.charMode === 'both') {
        runTestGroup('全员爱丝琳', () => ['Aislinn_Wishart', 'Aislinn_Wishart', 'Aislinn_Wishart', 'Aislinn_Wishart']);
    }

    if (CONFIG.charMode === 'both') {
        runTestGroup('混合阵容', () =>
            ['Amae_Koromo', 'Aislinn_Wishart', 'Amae_Koromo', 'Aislinn_Wishart']
        );
    }

    printReport(startTime);
}

/* 清除定时器防止进程挂起 */
process.on('beforeExit', () => {
    // 确保所有定时器被清除
});

/* ================================================================
 * 结果报告（提取为函数以支持并行回调）
 * ================================================================ */

function printReport(startTime) {
let elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

console.log('\n╔══════════════════════════════════════╗');
console.log('║  测试结果报告                         ║');
console.log('╚══════════════════════════════════════╝');

console.log('\n--- 基本统计 ---');
console.log('  总半庄数: ' + stats.totalGames);
console.log('  总局数:   ' + stats.totalRounds);
console.log('  崩溃次数: ' + stats.crashes);
console.log('  耗时:     ' + elapsed + 's');
console.log('  牌谱目录: ' + CONFIG.outDir);
console.log('  牌谱总数: ' + (CONFIG.workers > 1 ? stats.totalGames + ' (各worker分别保存)' : paipuSeq));

console.log('\n--- 天江衣 (Amae_Koromo) ---');
console.log('  技能① (海底/河底和牌): ' + stats.koromo.skill1Activated);
console.log('  技能② (移动海底牌):   ' + stats.koromo.skill2Activated);
console.log('  技能④ (展示交换):     ' + stats.koromo.skill4Activated);
console.log('    ├─ 实际交换:         ' + stats.koromo.skill4Swapped);
console.log('    └─ 只展示不交换:     ' + stats.koromo.skill4NoSwap);

console.log('\n--- 爱丝琳 (Aislinn_Wishart) ---');
console.log('  技能0 (额外巡):       ' + stats.aislinn.skill0Activated);
console.log('  技能1 (牌河摸牌):     ' + stats.aislinn.skill1Activated);

console.log('\n--- 异常汇总 (' + stats.errors.length + ') ---');
if (stats.errors.length === 0) {
    console.log('  ✅ 无崩溃错误');
} else {
    let byType = {};
    for (let e of stats.errors) {
        let key = e.message.substring(0, 80);
        if (!byType[key]) byType[key] = { count: 0, examples: [] };
        byType[key].count++;
        if (byType[key].examples.length < 3) byType[key].examples.push(e.label);
    }
    for (let [msg, info] of Object.entries(byType)) {
        console.log('  ❌ [' + info.count + '次] ' + msg);
        console.log('      示例: ' + info.examples.join(', '));
    }

    console.log('\n--- 崩溃牌谱文件 ---');
    for (let p of stats.crashPaipuPaths) {
        console.log('  ' + p);
    }

    console.log('\n  可通过复现器重现错误:');
    if (stats.crashPaipuPaths.length > 0) {
        let firstPath = stats.crashPaipuPaths[0];
        console.log('    node test/replayer.js --paipu=' + firstPath + ' --debug --cont');
        console.log('    # 或先查看步骤:');
        console.log('    node test/replayer.js --paipu=' + firstPath + ' --list');
    }
    console.log('    # 也可以用技能测试工具单独测试:');
    console.log('    node test/skill-tester.js --paipu=<崩溃牌谱> --round=1 --step=0 --player=0 --skill=0');
}
}

/* 退出码：有崩溃则为1 */
process.exitCode = stats.crashes > 0 ? 1 : 0;
