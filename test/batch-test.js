/**
 * 超能力麻将 - 全角色批量 AI 对局测试
 *
 * 对除 Test_Character 外的所有角色进行 4 人同角色对局测试，
 * 收集报错信息并生成汇总报告。
 *
 * 用法：
 *   node test/batch-test.js --games=1                    # 每角色 1 半庄（快速检查）
 *   node test/batch-test.js --games=3 --workers=4        # 每角色 3 半庄，4 进程并行
 *   node test/batch-test.js --chars=Amae_Koromo,Aislinn_Wishart --games=5  # 只测指定角色
 *   node test/batch-test.js --debug --chars=Koromo       # debug 模式测天江衣
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
    };
    if (aliases[request]) return aliases[request];
    return originalResolveFilename.call(this, request, parent, isMain, options);
};

const Majiang = require('@kobalab/majiang-core');
const AI = require('@kobalab/majiang-ai');
const characters = require('../src/skill/characters_skills');
const { SkillManager } = require('../src/skill/index');
const { SKILL_EXECUTE_MAP } = require('../src/skill/skill-registry');
const { serializeShan } = require('./shan-serialize');

/* ================================================================
 * 命令行参数
 * ================================================================ */
const args = {};
process.argv.slice(2).forEach(arg => {
    let m = arg.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
    else if (arg === '--debug') args.debug = true;
    else if (arg === '--no-log') args.noLog = true;
    else if (arg === '--log') args.log = true;
});

const CONFIG = {
    gamesPerChar: parseInt(args.games) || 1,
    debug: !!args.debug,
    workers: parseInt(args.workers) || 0,
    outDir: args.out || path.join(__dirname, 'paipu'),
    /* --chars=id1,id2,... 只测指定角色 */
    onlyChars: args.chars ? args.chars.split(',').map(s => s.trim()).filter(Boolean) : null,
    /* --skip=id1,id2,... 跳过指定角色 */
    skipChars: args.skip ? args.skip.split(',').map(s => s.trim()).filter(Boolean) : [],
    /* --log=dir: 指定日志目录，默认自动输出到 test/logs/；--no-log 关闭 */
    logDir: args.noLog ? null : (typeof args.log === 'string' ? args.log : path.join(__dirname, 'logs')),
    /* --timeout=<秒>: 单局超时（默认 300 秒） */
    timeout: parseInt(args.timeout) || 300,
};

/* 控制游戏引擎 debug 日志（仅 --debug 时启用） */
Majiang.Game._debugHule = !!CONFIG.debug;

/* ================================================================
 * 角色列表
 * ================================================================ */

/** 排除 ID（测试角色 + 命令行跳过） */
const EXCLUDE_IDS = new Set(['Test_Character', ...CONFIG.skipChars]);

/** 有实际技能实现的角色 ID 集合 */
const IMPLEMENTED_IDS = new Set(Object.keys(SKILL_EXECUTE_MAP));

/** 待测角色列表（仅包含有实现的角色） */
function buildTestList() {
    let list = [];
    for (let c of characters) {
        if (EXCLUDE_IDS.has(c.id)) continue;
        if (!IMPLEMENTED_IDS.has(c.id)) {
            continue;
        }
        if (CONFIG.onlyChars && !CONFIG.onlyChars.some(
            s => c.id === s || c.id.includes(s) || c.name.includes(s)
        )) continue;
        list.push({ id: c.id, name: c.name });
    }
    return list;
}

/* ================================================================
 * 工具函数
 * ================================================================ */
function pad(n, w) { return String(n).padStart(w); }
function charNameById(id) {
    let c = characters.find(c => c.id === id);
    return c ? c.name : id || 'none';
}

if (!fs.existsSync(CONFIG.outDir)) {
    fs.mkdirSync(CONFIG.outDir, { recursive: true });
}

/* ================================================================
 * 全局统计
 * ================================================================ */
const stats = {
    totalGames: 0,
    totalCrashes: 0,
    results: [],        // { id, name, games, crashes, errors[], skillActivations: {}, expectedSkills: [] }
};

/** 全局技能发动计数（跨所有对局） */
const skillActivations = {}; // { charId: { 'skill_desc': count, ... } }

/** 获取角色预定义技能描述列表 */
function getExpectedSkills(charId) {
    let c = characters.find(c => c.id === charId);
    if (!c || !c.skills) return [];
    return c.skills.map(s => s.replace(/;+$/, '').trim());
}

/* ================================================================
 * 牌谱保存
 * ================================================================ */
let paipuSeq = 0;

function savePaipu(game, charId, gameIdx, error) {
    paipuSeq++;
    let paipu = game._paipu;

    if (!paipu.wall && game._model && game._model.shan) {
        paipu.wall = serializeShan(game._model.shan);
    }

    if (game._skillManager && game._skillManager._activeCharacters) {
        let chars = [];
        for (let i = 0; i < 4; i++) {
            let cid = game._skillManager._activeCharacters[i] || null;
            chars.push(cid ? { id: cid, name: charNameById(cid) } : null);
        }
        paipu.character = chars;
    }

    if (error) {
        paipu._error = {
            message: error.message,
            stack: error.stack ? error.stack.split('\n').slice(0, 15).join('\n') : '',
        };
    }

    paipu._test_char = charId;
    paipu._test_game = gameIdx;
    paipu._timestamp = new Date().toISOString();

    let prefix = error ? 'crash_' : '';
    let seqStr = pad(paipuSeq, 4);
    let fname = charId.replace(/[\/\\:*?"<>|#]/g, '_');
    let filepath = path.join(CONFIG.outDir, prefix + seqStr + '_' + fname + '_' + gameIdx + '.json');

    fs.writeFileSync(filepath, JSON.stringify(paipu, null, 2));
    return filepath;
}

/* ================================================================
 * 单局运行器
 * ================================================================ */
function runOneGame(charId, gameIdx) {
    let game = null;
    let logStream = null;
    let heartbeatTimer = null;
    let timeoutTimer = null;
    let gameSteps = 0;
    let origConsoleLog = null;
    let origConsoleError = null;

    /* 准备日志文件 */
    let logFilePath = null;
    if (CONFIG.logDir) {
        try { fs.mkdirSync(CONFIG.logDir, { recursive: true }); } catch (e) {}
        logFilePath = path.join(CONFIG.logDir,
            charId + '_g' + String(gameIdx).padStart(2, '0') + '_' +
            new Date().toISOString().replace(/[:.]/g, '-') + '.log');
        logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    }

    function log(msg) {
        if (logStream) {
            logStream.write(new Date().toISOString() + ' ' + msg + '\n');
        }
    }

    try {
        let players = [new AI(), new AI(), new AI(), new AI()];

        let rule = Majiang.rule();
        game = new Majiang.Game(players, () => {}, rule);
        game._sync = true;
        game.speed = 0;
        game.wait = 0;
        game._debugSkill = !!CONFIG.debug;

        /* 注入游戏动作日志（记录到文件） */
        if (logStream) {
            game._gameLog = (action, detail) => {
                gameSteps++;
                log('[' + String(gameSteps).padStart(5, '0') + '] ' + action + ' ' + (detail || ''));
            };
        }

        let sm = new SkillManager({ characters, rule });

        /* 4 人同角色 */
        for (let i = 0; i < 4; i++) {
            sm._activeCharacters[i] = charId;
            sm._activatePassiveSkills(i, charId);
        }

        /* ---- 静默运行（压制游戏引擎自身的日志输出） ---- */
        origConsoleLog = console.log;
        origConsoleError = console.error;
        if (!CONFIG.debug) {
            console.log = () => {};
            console.error = () => {};
        }

        game.skillManager = sm;

        /* ---- 拦截技能发动日志 ---- */
        if (!skillActivations[charId]) {
            skillActivations[charId] = {};
        }
        let origAddActionLog = game._add_action_log.bind(game);
        game._add_action_log = function(text, seat) {
            /* 匹配 "发动了技能「角色名·技能描述」" */
            let m = text.match(/发动了技能「(.+?)·(.+?)」/);
            if (m) {
                let desc = m[2].replace(/;+$/, '').trim();
                skillActivations[charId][desc] = (skillActivations[charId][desc] || 0) + 1;
            }
            return origAddActionLog(text, seat);
        };

        let result;
        /* 心跳：每 5 秒输出一次，证明未卡死 */
        if (logStream) {
            heartbeatTimer = setInterval(() => {
                log('... heartbeat steps=' + gameSteps + ' still running ...');
            }, 5000);
            /* 超时：超过配置秒数则抛异常 */
            timeoutTimer = setTimeout(() => {
                log('!!! TIMEOUT after ' + CONFIG.timeout + 's, game hung at step ' + gameSteps + ' !!!');
                throw new Error('TIMEOUT: game hung at step ' + gameSteps +
                    ' (' + CONFIG.timeout + 's limit)');
            }, CONFIG.timeout * 1000);
        }
        try {
            result = game.do_sync();
        } finally {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            if (timeoutTimer) clearTimeout(timeoutTimer);
            log('GAME_END steps=' + gameSteps + ' reason=' + (result ? 'complete' : 'unknown'));
        }

        /* 保存牌谱 */
        savePaipu(game, charId, gameIdx, null);

        /* 每局进度输出到控制台 */
        let paipu = result._paipu || game._paipu;
        let rounds = paipu && paipu.log ? paipu.log.length - 1 : 0;
        console.log('  [#' + String(gameIdx).padStart(2) + '] ' + charNameById(charId) + ' 完成, ' + rounds + '局');

    } catch (e) {
        /* 崩溃：写入报错日志到文件 */
        log('!!! CRASH: ' + e.message);
        if (e.stack) {
            log('  stack: ' + e.stack.split('\n').slice(0, 10).join('\n  '));
        }
        savePaipu(game, charId, gameIdx, e);
        throw e;
    } finally {
        /* 恢复控制台输出 */
        if (!CONFIG.debug && origConsoleLog) {
            console.log = origConsoleLog;
            console.error = origConsoleError;
        }
        /* 关闭日志文件流 */
        if (logStream) {
            try { logStream.end(); } catch (_) {}
        }
    }
}

/* ================================================================
 * 单角色测试组
 * ================================================================ */
function runCharGroup(charId, charName, count) {
    /* 初始化技能计数 */
    if (!skillActivations[charId]) {
        skillActivations[charId] = {};
    }
    let expectedSkills = getExpectedSkills(charId);

    let result = {
        id: charId,
        name: charName,
        games: count,
        crashes: 0,
        errors: [],
        skillActivations: skillActivations[charId],  /* 引用 */
        expectedSkills,
    };

    for (let i = 1; i <= count; i++) {
        stats.totalGames++;
        try {
            console.log('  [#' + String(i).padStart(2) + '] ' + charName + ' 开始...');
            runOneGame(charId, i);
            /* 每局后强制 GC，避免累积内存 */
            if (global.gc) global.gc();
        } catch (e) {
            result.crashes++;
            stats.totalCrashes++;
            result.errors.push({
                game: i,
                message: e.message,
                stack: e.stack ? e.stack.split('\n').slice(0, 5).join('\n  ') : '',
            });
            process.stderr.write('  [CRASH] ' + charName + ' #' + i + ': ' + e.message + '\n');
        }
    }

    return result;
}

/* ================================================================
 * 串行模式
 * ================================================================ */
function runSerial(testList, count) {
    console.log('  待测角色: ' + testList.length);
    console.log('  每角色半庄: ' + count);
    console.log('  总半庄: ' + (testList.length * count) + '\n');

    let startTime = Date.now();

    for (let i = 0; i < testList.length; i++) {
        let c = testList[i];
        let progress = '[' + (i + 1) + '/' + testList.length + ']';
        process.stdout.write('  ' + progress + ' ' + c.name + ' ... ');
        let result = runCharGroup(c.id, c.name, count);
        if (result.crashes > 0) {
            process.stdout.write('CRASH x' + result.crashes + '\n');
        } else {
            process.stdout.write('OK\n');
        }
        stats.results.push(result);
    }

    printReport(startTime);
}

/* ================================================================
 * 并行模式（多 worker）
 * ================================================================ */
function runParallel(testList, count) {
    const { fork } = require('child_process');

    /* 按 worker 数分配角色 */
    let workerCount = CONFIG.workers;
    let chunks = [];
    for (let i = 0; i < workerCount; i++) chunks.push([]);
    for (let i = 0; i < testList.length; i++) {
        chunks[i % workerCount].push(testList[i]);
    }

    console.log('  并行进程: ' + workerCount);
    console.log('  每角色半庄: ' + count);
    console.log('  总半庄: ' + (testList.length * count) + '\n');

    let startTime = Date.now();
    let completed = 0;

    let promises = chunks.map((chars, idx) => {
        return new Promise((resolve) => {
            let charIds = chars.map(c => c.id).join(',');
            let worker = fork(__filename, [
                '--chars=' + charIds,
                '--games=' + count,
                '--out=' + CONFIG.outDir,
                '--worker-id=' + idx,
            ], { silent: true });

            let stdout = '';
            let stderr = '';
            worker.stdout.on('data', d => stdout += d);
            worker.stderr.on('data', d => stderr += d);

            worker.on('close', (code) => {
                completed++;
                if (stderr) process.stderr.write('  [worker ' + idx + '] ' + stderr.trim() + '\n');
                try {
                    let result = JSON.parse(stdout.trim());
                    resolve({ ok: true, result, workerId: idx });
                } catch(e) {
                    resolve({ ok: false, error: stdout.trim() || 'exit code ' + code, workerId: idx });
                }
            });
        });
    });

    Promise.all(promises).then(results => {
        for (let r of results) {
            if (!r.ok) {
                console.error('  [worker ' + r.workerId + ' 失败: ' + r.error + ']');
                continue;
            }
            stats.totalGames += r.result.totalGames;
            stats.totalCrashes += r.result.totalCrashes;
            for (let cr of r.result.results) {
                stats.results.push(cr);
            }
        }
        printReport(startTime);
    });

    process.stdout.write('');
}

/* ================================================================
 * 报告
 * ================================================================ */
function printReport(startTime) {
    let elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  批量角色测试报告                      ║');
    console.log('╚══════════════════════════════════════╝');

    console.log('\n--- 基本统计 ---');
    console.log('  总角色:   ' + stats.results.length);
    console.log('  总半庄:   ' + stats.totalGames);
    console.log('  崩溃角色: ' + stats.results.filter(r => r.crashes > 0).length);
    console.log('  总崩溃:   ' + stats.totalCrashes);
    console.log('  耗时:     ' + elapsed + 's');

    /* ---- 技能发动统计 ---- */
    console.log('\n--- 技能发动统计 ---');
    for (let r of stats.results) {
        let activations = r.skillActivations || {};
        let expected = r.expectedSkills || [];
        let totalActs = Object.values(activations).reduce((a, b) => a + b, 0);

        let statusIcon = r.crashes > 0 ? '💥' : (totalActs > 0 ? '✓' : '⚠');
        console.log('  ' + statusIcon + ' [' + r.id + '] ' + r.name
            + (r.crashes > 0 ? ' (崩溃' + r.crashes + ')' : ''));

        if (expected.length === 0) {
            console.log('      (无预定义技能)');
            continue;
        }

        for (let i = 0; i < expected.length; i++) {
            let desc = expected[i];
            let count = activations[desc] || 0;
            let marker = count > 0 ? '  ' + count + '次' : '  ⚠ 未触发';
            console.log('    技能' + (i + 1) + ': ' + marker);
        }
    }

    /* ---- 未触发技能汇总 ---- */
    let neverTriggered = [];
    for (let r of stats.results) {
        let activations = r.skillActivations || {};
        let expected = r.expectedSkills || [];
        for (let desc of expected) {
            if (!activations[desc]) {
                neverTriggered.push({ charId: r.id, name: r.name, skill: desc });
            }
        }
    }
    if (neverTriggered.length > 0) {
        console.log('\n--- ⚠ 未触发技能（可能 Bug） ---');
        for (let item of neverTriggered) {
            console.log('  [' + item.charId + '] ' + item.name);
            console.log('    ' + item.skill.slice(0, 60) + (item.skill.length > 60 ? '...' : ''));
        }
    }

    if (stats.totalCrashes === 0 && neverTriggered.length === 0) {
        console.log('\n  ✅ 全部角色通过测试，无崩溃，所有技能均触发');
        return;
    }

    /* 按崩溃数排序的错误角色 */
    let crashChars = stats.results.filter(r => r.crashes > 0);
    crashChars.sort((a, b) => b.crashes - a.crashes);

    if (crashChars.length > 0) {
        console.log('\n--- 错误角色列表 ---');
        for (let r of crashChars) {
            console.log('  [' + r.id + '] ' + r.name + '  崩溃 ' + r.crashes + '/' + r.games + ' 次');
            for (let e of r.errors) {
                console.log('    #' + e.game + ': ' + e.message);
                if (CONFIG.debug && e.stack) {
                    console.log('      ' + e.stack.split('\n').join('\n      '));
                }
            }
        }

        /* 按错误消息分组 */
        console.log('\n--- 错误消息分组 ---');
        let errorGroups = {};
        for (let r of crashChars) {
            for (let e of r.errors) {
                let key = e.message.slice(0, 80);
                if (!errorGroups[key]) errorGroups[key] = [];
                errorGroups[key].push(r.id);
            }
        }
        let sortedGroups = Object.entries(errorGroups).sort((a, b) => b[1].length - a[1].length);
        for (let [msg, chars] of sortedGroups) {
            console.log('  影响 ' + chars.length + ' 个角色: ' + msg);
            console.log('    ' + chars.join(', '));
        }
    }

    console.log('\n--- 牌谱目录 ---');
    console.log('  ' + CONFIG.outDir);

    if (crashChars.length > 0) process.exitCode = 1;
}

/* ================================================================
 * Worker 模式入口（子进程调用）
 * ================================================================ */
function runAsWorker() {
    let charIds = args.chars.split(',').map(s => s.trim()).filter(Boolean);
    let count = parseInt(args.games) || 1;

    let rstats = {
        workerId: parseInt(args.workerId) || 0,
        totalGames: 0,
        totalCrashes: 0,
        results: [],
    };

    for (let charId of charIds) {
        let c = characters.find(c => c.id === charId);
        let name = c ? c.name : charId;
        let expectedSkills = getExpectedSkills(charId);
        if (!skillActivations[charId]) {
            skillActivations[charId] = {};
        }
        let result = {
            id: charId, name, games: count, crashes: 0, errors: [],
            skillActivations: skillActivations[charId],
            expectedSkills,
        };

        for (let i = 1; i <= count; i++) {
            rstats.totalGames++;
            try {
                runOneGame(charId, i);
            } catch (e) {
                rstats.totalCrashes++;
                result.crashes++;
                result.errors.push({
                    game: i,
                    message: e.message,
                    stack: e.stack ? e.stack.split('\n').slice(0, 5).join('\n  ') : '',
                });
            }
        }
        rstats.results.push(result);
    }

    process.stdout.write(JSON.stringify(rstats) + '\n');
}

/* ================================================================
 * 主入口
 * ================================================================ */

/* 判断是 worker 子进程还是主进程 */
let isWorker = args.workerId !== undefined;

if (isWorker) {
    runAsWorker();
    process.exit(0);
}

/* ---- 主进程 ---- */
let testList = buildTestList();

if (testList.length === 0) {
    console.log('未找到待测角色。请检查 --chars 参数。');
    console.log('可用角色示例:');
    for (let c of characters.slice(0, 5)) {
        console.log('  ' + c.id + ' (' + c.name + ')');
    }
    console.log('  ... 共 ' + characters.length + ' 个角色');
    process.exit(1);
}

console.log('╔══════════════════════════════════════╗');
console.log('║  全角色批量 AI 对局测试               ║');
console.log('╚══════════════════════════════════════╝');
console.log('  总角色数: ' + characters.length);
console.log('  已实现: ' + IMPLEMENTED_IDS.size);
console.log('  排除角色: [' + [...EXCLUDE_IDS].join(', ') + ']');

let count = CONFIG.gamesPerChar;

if (CONFIG.workers > 1) {
    runParallel(testList, count);
} else {
    runSerial(testList, count);
}
