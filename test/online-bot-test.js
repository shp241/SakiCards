/**
 * 超能力麻将 - 4台机器人联机功能测试
 *
 * 启动本地服务器，通过 Socket.IO 创建 4 个 AI 机器人客户端，
 * 测试完整的联机流程：登录 → 创建房间 → 加入房间 → 开始对局 →
 * AI 决策 → 技能触发 → 对局结束。
 *
 * 用法：
 *   node test/online-bot-test.js --games=1                  # 1 半庄（静默测试）
 *   node test/online-bot-test.js --games=1 --seed=12345     # 指定种子
 *   node test/online-bot-test.js --debug --games=1          # debug 模式（输出详细日志到文件）
 *   node test/online-bot-test.js --debug --seed=12345       # 用种子重现问题
 *   node test/online-bot-test.js --port=8888 --games=2      # 指定服务器端口
 */

'use strict';

const Module = require('module');
const path = require('path');
const fs = require('fs');
const http = require('http');
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

/* ================================================================
 * 可复现随机数（mulberry32 PRNG）
 * ================================================================ */
const seedArg = process.argv.find(a => a.startsWith('--seed='));
const RAW_RANDOM = Math.random;
let RND_SEED = seedArg ? parseInt(seedArg.split('=')[1], 10) : (Date.now() ^ (Math.random() * 0x7FFFFFFF | 0));
let rng_state = RND_SEED;

function seededRandom() {
    rng_state |= 0;
    rng_state = rng_state + 0x6D2B79F5 | 0;
    let t = Math.imul(rng_state ^ rng_state >>> 15, 1 | rng_state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
Math.random = seededRandom;

const io = require('socket.io-client');
const AI = require('@kobalab/majiang-ai');
const Majiang = require('@kobalab/majiang-core');
const { spawn } = require('child_process');

/** 基础 Majiang 规则（包含赤牌、食替等核心字段） */
const BASE_RULE = Majiang.rule();

/* ================================================================
 * 命令行参数
 * ================================================================ */
const args = {};
process.argv.slice(2).forEach(arg => {
    let m = arg.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
    else if (arg === '--debug') args.debug = true;
});

const CONFIG = {
    games: parseInt(args.games) || 1,
    debug: !!args.debug,
    seed: RND_SEED,
    port: parseInt(args.port) || 0,  // 0 = 自动分配端口
    charId: args.chars || null,
    timeout: parseInt(args.timeout) || 600,
    serverStartTimeout: parseInt(args.serverTimeout) || 15,
    outDir: args.out || path.join(__dirname, 'online-paipu'),
    logDir: path.join(__dirname, 'logs'),
};

/* ================================================================
 * 工具函数
 * ================================================================ */
function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function printAiTimings(bots) {
    for (let bi = 0; bi < bots.length; bi++) {
        let t = bots[bi].getAiTimings();
        if (!t || t.timings.length === 0) continue;
        let avgMs = t.total / t.timings.length;
        let maxMs = Math.max(...t.timings.map(x => x.ms));
        /* 按类型分组 */
        let byType = {};
        for (let e of t.timings) {
            if (!byType[e.type]) byType[e.type] = { count: 0, total: 0, max: 0 };
            byType[e.type].count++;
            byType[e.type].total += e.ms;
            if (e.ms > byType[e.type].max) byType[e.type].max = e.ms;
        }
        let typeStr = Object.entries(byType)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 4)
            .map(([type, s]) => type + '(' + s.count + '次,avg=' + (s.total/s.count).toFixed(0)
                + 'ms,max=' + s.max.toFixed(0) + 'ms)')
            .join(' ');
        process.stdout.write('  机器人' + (bi+1) + ' AI评估: ' + t.timings.length
            + '次 总' + t.total.toFixed(0) + 'ms 均' + avgMs.toFixed(0)
            + 'ms 最长' + maxMs.toFixed(0) + 'ms\n');
        if (typeStr) process.stdout.write('    ' + typeStr + '\n');
    }
}

function formatTime(date) {
    return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function log(level, msg) {
    let prefix = '[' + formatTime(new Date()) + ']';
    if (level === 'DEBUG' && !CONFIG.debug) return;
    process.stdout.write(prefix + ' [' + level + '] ' + msg + '\n');
}

/* ================================================================
 * 统计
 * ================================================================ */
const stats = {
    totalGames: 0,
    completed: 0,
    crashed: 0,
    errors: [],
    results: [],
};

/* ================================================================
 * 牌谱保存
 * ================================================================ */
let paipuSeq = 0;
function savePaipu(paipu, gameIdx, error) {
    if (!fs.existsSync(CONFIG.outDir)) {
        fs.mkdirSync(CONFIG.outDir, { recursive: true });
    }
    paipuSeq++;
    let prefix = error ? 'crash_' : '';
    let seqStr = String(paipuSeq).padStart(4, '0');
    let fname = prefix + seqStr + '_online_g' + gameIdx + '.json';
    let filepath = path.join(CONFIG.outDir, fname);
    let data = Object.assign({}, paipu, {
        _test_game: gameIdx,
        _timestamp: new Date().toISOString(),
        _seed: CONFIG.seed,
    });
    if (error) {
        data._error = {
            message: error.message,
            stack: error.stack ? error.stack.split('\n').slice(0, 15).join('\n') : '',
        };
    }
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    return filepath;
}

/* ================================================================
 * Bot 客户端
 * ================================================================ */
function createBotClient(botIndex, serverUrl, logPath, onCharChosen, onRoundEnd) {
    return new Promise((resolve, reject) => {
        let botName = '机器人' + (botIndex + 1);
        let agent = 'majiang-bot-test/1.0';
        let cookie = null;
        let sock = null;
        let player = new AI();
        let roomNo = null;
        let gameEnded = false;
        let endPaipu = null;
        let skillLogs = [];
        let error = null;
        let gameTimeout = null;
        let characterChosen = [];
        let aiTimings = [];
        let totalAiTime = 0;

        /* Debug 模式：写入独立日志文件 */
        let logStream = null;
        if (CONFIG.debug && logPath) {
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            logStream = fs.createWriteStream(logPath, { flags: 'a' });
        }
        function botLog(msg) {
            if (logStream) logStream.write('[' + formatTime(new Date()) + '] ' + msg + '\n');
        }
        function closeLog() {
            if (logStream) { try { logStream.end(); } catch (_) {} }
        }

        async function login() {
            try {
                let res = await fetch(serverUrl + '/auth/', {
                    method: 'POST',
                    headers: { 'User-Agent': agent },
                    body: new URLSearchParams({ name: botName, passwd: '*' }),
                    redirect: 'manual',
                });
                for (let c of (res.headers.get('Set-Cookie') || '').split(/,\s*/)) {
                    if (!c.match(/^MAJIANG=/)) continue;
                    cookie = c.replace(/^MAJIANG=/, '').replace(/; .*$/, '');
                    break;
                }
                if (!cookie) {
                    reject(new Error(botName + ' 登录失败：未获取到 cookie'));
                    return;
                }
                connect();
            } catch (e) {
                reject(new Error(botName + ' 登录异常: ' + e.message));
            }
        }

        function connect() {
            let urlObj = new URL(serverUrl);
            let server = urlObj.origin;
            let socketPath = urlObj.pathname.replace(/\/$/, '') + '/socket.io/';

            sock = io(server, {
                path: socketPath,
                extraHeaders: {
                    'User-Agent': agent,
                    Cookie: 'MAJIANG=' + cookie,
                },
                transports: ['websocket', 'polling'],
                reconnection: false,
                timeout: 10000,
            });

            sock.on('connect_error', (err) => {
                reject(new Error(botName + ' 连接失败: ' + err.message));
            });

            sock.on('HELLO', (user) => {
                if (!user) {
                    reject(new Error(botName + ' 认证失败'));
                    return;
                }
                resolve({
                    name: botName,
                    sock,
                    player,
                    createRoom() { sock.emit('ROOM', ''); },
                    joinRoom(rn) { sock.emit('ROOM', rn); },
                    startGame(rule) {
                        if (!roomNo) return;
                        let ruleObj = Object.assign({}, BASE_RULE, rule || {});
                        sock.emit('START', roomNo, ruleObj);
                    },
                    getRoomNo() { return roomNo; },
                    isGameEnded() { return gameEnded; },
                    getPaipu() { return endPaipu; },
                    getSkillLogs() { return skillLogs; },
                    getError() { return error; },
                    getCharacterChosen() { return characterChosen; },
                    getAiTimings() { return { timings: aiTimings, total: totalAiTime }; },
                    disconnect() {
                        if (gameTimeout) clearTimeout(gameTimeout);
                        closeLog();
                        if (sock) {
                            sock.removeAllListeners();
                            sock.close();
                        }
                    },
                });
            });

            sock.on('ROOM', (info) => {
                roomNo = info.room_no;
                botLog('ROOM: ' + roomNo);
            });

            sock.on('START', () => {
                botLog('START 对局开始');
            });

            /* GAME 消息处理 */
            sock.on('GAME', (msg) => {
                /* 角色选择 */
                if (msg.character_select) {
                    let options = msg.character_select.options || [];
                    let choice;
                    if (CONFIG.charId) {
                        choice = options.findIndex(o =>
                            (typeof o === 'string' ? o : o.id) === CONFIG.charId);
                        if (choice < 0) choice = 0;
                    } else if (options.length > 0) {
                        choice = Math.floor(Math.random() * options.length);
                    } else {
                        choice = 0;
                    }
                    let chosenObj = options[choice] || {};
                    let charId = typeof chosenObj === 'string' ? chosenObj : chosenObj.id || '?';
                    let charName = typeof chosenObj === 'object' ? chosenObj.name : charId;
                    let roundNum = characterChosen.length + 1;
                    characterChosen.push({ id: charId, name: charName, choice, round: roundNum });
                    botLog('[CHAR] ' + botName + ' 第' + roundNum + '局选择: ' + charId);
                    if (onCharChosen) onCharChosen(botIndex, roundNum, charId, charName);
                    sock.emit('CHARACTER', choice);
                    return;
                }

                /* 技能提示 */
                if (msg.skill_prompt) {
                    sock.emit('SKILL_REPLY_' + msg.skill_prompt.promptId, {
                        choice: 0,
                    });
                    return;
                }

                /* 对局结果：和了 / 流局（仅 bot 0 输出） */
                if ((msg.hule || msg.pingju) && onRoundEnd) {
                    if (botIndex === 0) {
                        if (msg.hule) {
                            let h = msg.hule;
                            onRoundEnd('和了', {
                                seat: h.l,
                                fanshu: h.fanshu,
                                fu: h.fu,
                                defen: h.defen,
                                fenpei: h.fenpei,
                                hupai: h.hupai,
                            });
                        } else {
                            let p = msg.pingju;
                            onRoundEnd('流局', {
                                name: p.name,
                                fenpei: p.fenpei,
                            });
                        }
                    }
                    /* 局结果消息不需要 action 处理，直接 ACK */
                    if (msg.seq) { sock.emit('GAME', { seq: msg.seq }); return; }
                }

                /* 角色确认 */
                if (msg.character_confirmed) return;

                /* 手牌同步（技能修改手牌后服务端推送） */
                if (msg.hand_sync) {
                    let hs = msg.hand_sync;
                    botLog('[TRACE] ' + botName + ' recv hand_sync seat=' + hs.seat
                        + ' handBefore=' + String(player.shoupai || '?'));
                    let model_shoupai = player._model && player._model.shoupai
                        ? player._model.shoupai[hs.seat] : null;
                    if (model_shoupai && hs.bingpai) {
                        let bp = hs.bingpai;
                        for (let s of ['m','p','s','z']) {
                            let arr = bp[s];
                            if (arr) {
                                for (let n = 0; n < arr.length; n++) {
                                    model_shoupai._bingpai[s][n] = arr[n];
                                }
                            }
                        }
                        model_shoupai._bingpai._ = bp._;
                        model_shoupai._zimo = hs.zimo || null;
                    }
                    return;
                }

                /* 动作日志收集 */
                if (msg.action_log_entries) {
                    for (let entry of msg.action_log_entries) {
                        if (entry.text && entry.text.includes('发动了技能')) {
                            skillLogs.push({ seat: entry.seat, text: entry.text });
                        }
                    }
                }

                /* seq 消息：追踪 + 回复 */
                let mtype = Object.keys(msg).find(k =>
                    k !== 'seq' && k !== 'wall_snapshot' && k !== 'action_log_entries');

                if (msg.seq) {
                    /* Trace 日志（debug 模式） */
                    if (mtype === 'dapai' || mtype === 'zimo' || mtype === 'fulou') {
                        let extra = mtype === 'dapai' ? 'l=' + msg[mtype].l + ' p=' + msg[mtype].p
                            : mtype === 'zimo' ? 'l=' + msg[mtype].l
                            : 'l=' + msg[mtype].l + ' m=' + msg[mtype].m;
                        let handStr = (player._menfeng != null && player._model && player._model.shoupai)
                            ? String(player.shoupai) : '?';
                        botLog('[TRACE] ' + botName + ' recv ' + mtype + ' ' + extra
                            + ' seq=' + msg.seq + ' handBefore=' + handStr);
                    } else {
                        let handStr = (player._menfeng != null && player._model && player._model.shoupai)
                            ? String(player.shoupai) : '?';
                        botLog('[TRACE] ' + botName + ' recv ' + (mtype || '?')
                            + ' seq=' + msg.seq + ' keys=' + Object.keys(msg).join(',')
                            + ' hand=' + handStr);
                    }

                    /* 手牌已被 hand_sync 同步时，自己的牌可能已被移除，直接用 model 层更新 */
                    let ownAction = null;
                    if (msg.dapai && msg.dapai.l === player._menfeng) {
                        let p = msg.dapai.p;
                        let suit = p[0], n = p[1];
                        let inHand = player.shoupai && player.shoupai._bingpai
                            && player.shoupai._bingpai[suit]
                            && player.shoupai._bingpai[suit][n] > 0;
                        if (! inHand) ownAction = 'dapai';
                    } else if (msg.fulou && msg.fulou.l === player._menfeng) {
                        let m = msg.fulou.m;
                        let parts = m.replace(/^(chi|pon|minkan|kakan|ankan):/, '').split('|');
                        let needCards = {};
                        for (let pi = 0; pi < parts.length; pi++) {
                            let clean = parts[pi].replace(/[+=]$/, '');
                            if (parts[pi] !== clean) continue;
                            needCards[clean] = (needCards[clean] || 0) + 1;
                        }
                        let shoupai = player.shoupai;
                        let missing = false;
                        for (let card in needCards) {
                            let s = card[0], n = +card[1] || 5;
                            if (!shoupai || !shoupai._bingpai || !shoupai._bingpai[s]
                                || shoupai._bingpai[s][n] < needCards[card]) {
                                missing = true;
                                break;
                            }
                        }
                        if (missing) ownAction = 'fulou';
                    }

                    if (ownAction) {
                        /* hand_sync 已移除对应牌，只更新 model 层状态 */
                        if (ownAction === 'dapai') {
                            let d = msg.dapai;
                            player._model.lunban = d.l;
                            player._model.he[d.l].dapai(d.p, d.hidden);
                        } else if (ownAction === 'fulou') {
                            let f = msg.fulou;
                            player._model.he[player._model.lunban].fulou(f.m);
                            player._model.lunban = f.l;
                        }
                        sock.emit('GAME', { seq: msg.seq });
                        process.stderr.write('[BOT] ' + botName + ' ownAction reply seq=' + msg.seq + '\n');
                    } else {
                        let t0 = process.hrtime.bigint();
                        try {
                            player.action(msg, (reply = {}) => {
                                let dt = Number(process.hrtime.bigint() - t0) / 1e6;
                                aiTimings.push({ type: mtype || '?', ms: dt });
                                totalAiTime += dt;
                                reply.seq = msg.seq;
                                botLog('[TRACE] ' + botName + ' reply seq=' + msg.seq
                                    + ' keys=' + Object.keys(reply).join(',')
                                    + ' ai=' + dt.toFixed(1) + 'ms');
                                sock.emit('GAME', reply);
                            });
                        } catch(e) {
                            process.stderr.write('[BOT] ' + botName + ' action ERROR: ' + (e?.message || e) + ' seq=' + msg.seq + '\n');
                            sock.emit('GAME', { seq: msg.seq });
                        }
                    }
                } else {
                    let t0 = process.hrtime.bigint();
                    player.action(msg);
                    let dt = Number(process.hrtime.bigint() - t0) / 1e6;
                    aiTimings.push({ type: mtype || '?', ms: dt });
                    totalAiTime += dt;
                }
            });

            sock.on('END', (paipu) => {
                botLog('END 对局结束');
                gameEnded = true;
                endPaipu = paipu;
                if (gameTimeout) clearTimeout(gameTimeout);
            });

            sock.on('ERROR', (msg) => {
                error = new Error(botName + ' 服务端错误: ' + msg);
            });

            sock.on('disconnect', (reason) => {
                botLog('断开连接: ' + reason);
            });

            /* 超时 */
            gameTimeout = setTimeout(() => {
                if (!gameEnded) {
                    error = new Error(botName + ' 对局超时 (' + CONFIG.timeout + 's)');
                    gameEnded = true;
                }
            }, CONFIG.timeout * 1000);
        }

        login();
    });
}

/* ================================================================
 * 运行单局联机对局
 * ================================================================ */
async function runOnlineGame(gameIdx, serverUrl) {
    stats.totalGames++;
    /* 每局独立种子 = 基础种子 + 局序号 */
    let seed = (CONFIG.seed + gameIdx) | 0;
    rng_state = seed;
    Math.random = seededRandom;

    /* 静默模式抑制 AI 内部日志 */
    let _originalLog = console.log;
    if (!CONFIG.debug) {
        console.log = () => {};
    }

    process.stdout.write('\n--- 第 ' + gameIdx + ' 局  种子=' + seed + ' ---\n');

    /* 角色选择输出缓冲 */
    let roundChar = {};

    function onCharChosen(botIdx, roundNum, charId, charName) {
        if (!roundChar[roundNum]) roundChar[roundNum] = {};
        roundChar[roundNum][botIdx] = charName;
        if (Object.keys(roundChar[roundNum]).length === 4) {
            process.stdout.write('  第' + roundNum + '局角色选择:\n');
            for (let bi = 0; bi < 4; bi++) {
                process.stdout.write('    机器人' + (bi + 1) + ' → ' + (roundChar[roundNum][bi] || '?') + '\n');
            }
        }
    }

    /* 局结果实时输出 */
    let totalPoints = null;

    function onRoundEnd(type, data) {
        if (type === '和了') {
            let seat = data.seat;
            let hupaiNames = (data.hupai || []).map(h => h.name).filter(Boolean).join('、');
            let extra = '';
            if (hupaiNames) extra = '  役种: ' + hupaiNames;
            if (data.fanshu != null) extra += '  ' + data.fanshu + '翻';
            if (data.fu != null) extra += data.fu + '符';
            if (data.defen != null) extra += '  ' + data.defen + '点';
            process.stdout.write('  🀄 和了! 机器人' + (seat + 1) + extra + '\n');
        } else {
            process.stdout.write('  🀄 流局 (' + (data.name || '不明') + ')\n');
        }
        if (data.fenpei && data.fenpei.length === 4) {
            process.stdout.write('    点数: '
                + data.fenpei.map((p, i) => '机器人' + (i + 1) + '=' + p).join('  ') + '\n');
            totalPoints = data.fenpei;
        }
    }

    let bots;
    try {
        let logDir = path.join(CONFIG.logDir, 'g' + gameIdx);
        bots = await Promise.all([
            createBotClient(0, serverUrl, CONFIG.debug ? path.join(logDir, 'bot-1.log') : null, onCharChosen, onRoundEnd),
            createBotClient(1, serverUrl, CONFIG.debug ? path.join(logDir, 'bot-2.log') : null, onCharChosen, onRoundEnd),
            createBotClient(2, serverUrl, CONFIG.debug ? path.join(logDir, 'bot-3.log') : null, onCharChosen, onRoundEnd),
            createBotClient(3, serverUrl, CONFIG.debug ? path.join(logDir, 'bot-4.log') : null, onCharChosen, onRoundEnd),
        ]);
    } catch (e) {
        console.log = _originalLog;
        process.stdout.write('  ❌ Bot 创建失败: ' + e.message + '\n');
        stats.crashed++;
        stats.errors.push({ game: gameIdx, message: e.message });
        return;
    }

    try {
        await sleep(500);

        /* 创建房间 */
        bots[0].createRoom();
        await new Promise((resolve, reject) => {
            let waited = 0;
            let check = setInterval(() => {
                waited += 200;
                if (bots[0].getRoomNo()) { clearInterval(check); resolve(); }
                else if (waited > 10000) { clearInterval(check); reject(new Error('创建房间超时')); }
            }, 200);
        });

        let roomNo = bots[0].getRoomNo();
        log('DEBUG', '房间号: ' + roomNo);

        /* 加入房间 */
        bots[1].joinRoom(roomNo);
        bots[2].joinRoom(roomNo);
        bots[3].joinRoom(roomNo);
        await sleep(1000);

        /* 开始对局（单局战） */
        bots[0].startGame({
            '場数': 0,
            '延長戦方式': 0,
            '技能模式': '开启',
            '角色分配方式': 'draw4',
        });

        /* 等待对局结束 */
        await new Promise((resolve, reject) => {
            let check = setInterval(() => {
                let allEnded = bots.every(b => b.isGameEnded());
                let anyError = bots.find(b => b.getError());
                if (anyError) {
                    clearInterval(check);
                    reject(anyError.getError());
                    return;
                }
                if (allEnded) {
                    clearInterval(check);
                    resolve();
                }
            }, 500);
        });

        /* 收集结果 */
        let paipu = bots[0].getPaipu();
        let allSkillLogs = [];
        let characters = [];
        for (let b of bots) {
            allSkillLogs = allSkillLogs.concat(b.getSkillLogs());
            let c = b.getCharacterChosen();
            characters.push({
                name: b.name,
                rounds: Array.isArray(c) ? c.map(r => ({
                    charId: r.name || r.id,
                    round: r.round,
                })) : [(c ? (c.name || c.id) : '未选择')],
            });
        }

        /* 技能发动统计 */
        if (allSkillLogs.length > 0) {
            let skillCounts = {};
            for (let log of allSkillLogs) {
                let m = log.text.match(/发动了技能「(.+?)」/);
                if (m) skillCounts[m[1]] = (skillCounts[m[1]] || 0) + 1;
            }
            let list = Object.entries(skillCounts).map(([k, v]) => v + 'x ' + k).join(', ');
            process.stdout.write('  技能发动: ' + list + '\n');
        }

        /* AI 评估耗时统计 */
        printAiTimings(bots);

        if (paipu) savePaipu(paipu, gameIdx, null);

        stats.completed++;
        stats.results.push({ gameIdx, paipu, skillLogs: allSkillLogs, characters, error: null });

    } catch (e) {
        process.stdout.write('  ❌ 第 ' + gameIdx + ' 局异常: ' + e.message + '\n');
        process.stdout.write('    重现命令: node test/online-bot-test.js --debug --seed='
            + seed + ' --games=1\n');
        printAiTimings(bots);
        stats.crashed++;
        stats.errors.push({ game: gameIdx, message: e.message, seed });
        stats.results.push({ gameIdx, paipu: null, skillLogs: [], error: e.message });
    } finally {
        console.log = _originalLog;
        for (let b of bots) {
            try { b.disconnect(); } catch (_) {}
        }
    }
}

/* ================================================================
 * 启动服务器
 * ================================================================ */
function startServer(port) {
    return new Promise((resolve, reject) => {
        let serverScript = path.join(ROOT, 'src', 'server', 'bin', 'server.js');
        let moduleAlias = path.join(__dirname, 'module-alias.js');

        let serverArgs = [
            '--require', moduleAlias,
            serverScript,
            '--port=' + port,
            '--status',
        ];
        /* 传递种子给服务端 */
        if (CONFIG.seed != null) {
            serverArgs.push('--seed=' + CONFIG.seed);
        }

        let serverLogStream = null;
        if (CONFIG.debug) {
            fs.mkdirSync(CONFIG.logDir, { recursive: true });
            serverLogStream = fs.createWriteStream(
                path.join(CONFIG.logDir, 'server.log'), { flags: 'a' });
        }

        let child = spawn('node', serverArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: ROOT,
        });

        let started = false;
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => {
            stdout += d.toString();
            if (serverLogStream) serverLogStream.write(d);
            if (CONFIG.debug) process.stdout.write(d);
            if (!started && stdout.includes('服务器启动')) {
                started = true;
                resolve({
                    child, port,
                    url: 'http://127.0.0.1:' + port + '/server',
                    kill() { try { child.kill('SIGTERM'); } catch (_) {} },
                });
            }
        });

        child.stderr.on('data', (d) => {
            stderr += d.toString();
            if (serverLogStream) serverLogStream.write(d);
            if (CONFIG.debug) process.stderr.write(d);
        });

        child.on('error', (e) => {
            reject(new Error('服务器启动失败: ' + e.message));
        });

        child.on('close', (code) => {
            if (!started) {
                reject(new Error('服务器意外退出, code=' + code + ' stderr=' + stderr.slice(-200)));
            }
        });

        setTimeout(() => {
            if (!started) {
                child.kill();
                reject(new Error('服务器启动超时 (' + CONFIG.serverStartTimeout + 's)'));
            }
        }, CONFIG.serverStartTimeout * 1000);
    });
}

async function waitForServer(url, timeoutMs = 15000) {
    let startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try { await fetch(url + '/status'); return true; }
        catch (e) { await sleep(500); }
    }
    return false;
}

/* ================================================================
 * 报告
 * ================================================================ */
function printReport(startTime) {
    let elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  联机机器人测试报告                    ║');
    console.log('╚══════════════════════════════════════╝');

    console.log('\n--- 基本统计 ---');
    console.log('  总局数:   ' + stats.totalGames);
    console.log('  完成:     ' + stats.completed);
    console.log('  崩溃:     ' + stats.crashed);
    console.log('  耗时:     ' + elapsed + 's');
    if (CONFIG.seed != null) {
        console.log('  种子:     ' + CONFIG.seed);
    }

    /* 技能统计 */
    let totalSkillActivations = 0;
    let skillCounts = {};
    for (let r of stats.results) {
        for (let log of r.skillLogs) {
            totalSkillActivations++;
            let m = log.text.match(/发动了技能「(.+?)」/);
            if (m) skillCounts[m[1]] = (skillCounts[m[1]] || 0) + 1;
        }
    }
    if (totalSkillActivations > 0) {
        console.log('\n--- 技能发动统计 (' + totalSkillActivations + ' 次) ---');
        let sorted = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]);
        for (let [skill, count] of sorted) {
            console.log('  ' + count + 'x  ' + skill);
        }
    }

    /* 错误汇总 */
    if (stats.errors.length > 0) {
        console.log('\n--- 错误汇总 (' + stats.errors.length + ') ---');
        for (let e of stats.errors) {
            console.log('  [' + (e.game || '?') + '] ' + e.message);
            if (e.seed != null) {
                console.log('    重现: node test/online-bot-test.js --debug --seed=' + e.seed + ' --games=1');
            }
        }
    }

    if (stats.crashed === 0 && stats.completed === stats.totalGames) {
        console.log('\n  ✅ 全部单局通过测试');
    } else {
        console.log('\n  ❌ 存在未完成的单局');
    }

    console.log('\n--- 牌谱目录 ---');
    console.log('  ' + CONFIG.outDir);
}

/* ================================================================
 * 主入口
 * ================================================================ */
async function main() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║  超能力麻将 联机机器人测试             ║');
    console.log('╚══════════════════════════════════════╝');
    console.log('  局数:     ' + CONFIG.games);
    console.log('  模式:     单局战（場数=0）');
    console.log('  角色模式:  draw4（4选1随机）');
    console.log('  种子:     ' + CONFIG.seed);
    console.log('  超时:     ' + CONFIG.timeout + 's');
    if (CONFIG.debug) console.log('  模式:     DEBUG');
    console.log('');

    let port = CONFIG.port;
    if (!port) {
        port = await getFreePort();
    }

    let server;
    try {
        server = await startServer(port);
        let ready = await waitForServer(server.url);
        if (!ready) {
            process.stdout.write('❌ 服务器未就绪\n');
            server.kill();
            process.exit(1);
        }
    } catch (e) {
        process.stdout.write('❌ 无法启动服务器: ' + e.message + '\n');
        process.exit(1);
    }

    let startTime = Date.now();
    for (let i = 1; i <= CONFIG.games; i++) {
        await runOnlineGame(i, server.url);
        await sleep(1000);
    }

    printReport(startTime);

    server.kill();

    process.exitCode = stats.crashed > 0 ? 1 : 0;
    setTimeout(() => process.exit(process.exitCode), 2000);
}

main().catch(e => {
    console.error('测试异常:', e);
    process.exit(1);
});