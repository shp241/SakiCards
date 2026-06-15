/**
 * simulate.js 并行工作进程
 * 用法：node test/simulate-worker.js --chars=Aislinn --games=5 --id=0
 * 输出单行 JSON 结果到 stdout
 */
'use strict';

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
const fs = require('fs');
const characters = require('../src/skill/characters_skills');
const { SkillManager } = require('../src/skill/index');
const { serializeShan } = require('./shan-serialize');

/* ================================================================
 * 参数
 * ================================================================ */
const args = {};
process.argv.slice(2).forEach(arg => {
    let m = arg.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
});

const CONFIG = {
    charMode: args.chars || 'Aislinn',
    gamesPerWorker: parseInt(args.games) || 10,
    workerId: parseInt(args.id) || 0,
    outDir: args.out || path.join(__dirname, 'paipu'),
};

if (!fs.existsSync(CONFIG.outDir)) {
    fs.mkdirSync(CONFIG.outDir, { recursive: true });
}

function charNameById(id) {
    let c = characters.find(c => c.id === id);
    return c ? c.name : id || 'none';
}

/* ================================================================
 * 统计
 * ================================================================ */
const stats = {
    workerId: CONFIG.workerId,
    totalGames: 0,
    totalRounds: 0,
    crashes: 0,
    errors: [],
    koromo: {
        skill1Activated: 0, skill2Activated: 0, skill4Activated: 0,
        skill4Swapped: 0, skill4NoSwap: 0,
    },
    aislinn: {
        skill0Activated: 0, skill1Activated: 0, skill1Rejected: 0,
    },
};

/* 全局步骤计数 */
let globalStepCounter = 0;

/* ================================================================
 * runOneGame（精简版，去除日志钩子）
 * ================================================================ */
function runOneGame(charAssignments, testLabel) {
    let game = null;
    globalStepCounter = 0;

    try {
        let players = [];
        for (let i = 0; i < 4; i++) players[i] = new AI();

        let rule = Majiang.rule();
        game = new Majiang.Game(players, () => {}, rule);
        game._sync = true;
        game.speed = 0;
        game.wait = 0;

        let sm = new SkillManager({ characters, rule });
        game.skillManager = sm;

        for (let i = 0; i < 4; i++) {
            if (charAssignments[i]) {
                sm._activeCharacters[i] = charAssignments[i];
                sm._activatePassiveSkills(i, charAssignments[i]);
            }
        }

        /* ---- 技能统计钩子 ---- */
        let origAddActionLog = game._add_action_log.bind(game);
        game._add_action_log = function(text, seat) {
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
            return origAddActionLog(text, seat);
        };

        /* ---- 标准模式静默 ---- */
        let origConsoleLog = console.log;
        console.log = () => {};

        let result;
        try {
            result = game.do_sync();
        } finally {
            console.log = origConsoleLog;
        }

        let paipu = result._paipu || game._paipu;
        stats.totalRounds += (paipu && paipu.log ? paipu.log.length : 0);

        /* 保存牌谱 */
        let charKey = charAssignments.filter(Boolean).map(c => c.split('_')[0]).join('_') || 'mix';
        let seq = String(stats.totalGames + 1).padStart(4, '0');
        let paipuFile = path.join(CONFIG.outDir, seq + '_' + charKey + '_' + CONFIG.workerId + '.json');
        if (paipu) {
            paipu._characters = charAssignments.map((c, i) => ({ seat: i, character: c }));
            paipu._wall = serializeShan(game._model.shan);
            fs.writeFileSync(paipuFile, JSON.stringify(paipu, null, 2), 'utf-8');
        }

    } catch(e) {
        stats.crashes++;
        let errMsg = (e && e.message) ? String(e.message) : String(e);
        stats.errors.push(errMsg);

        if (game) {
            let paipu = game._paipu;
            if (paipu) {
                paipu._error = { message: errMsg, stack: e && e.stack };
            }
            let charKey = charAssignments.filter(Boolean).map(c => c.split('_')[0]).join('_') || 'mix';
            let crashFile = 'crash_' + String(stats.totalGames + 1).padStart(4, '0') + '_' + charKey + '_' + CONFIG.workerId + '.json';
            let crashPath = path.join(CONFIG.outDir, crashFile);
            if (paipu) {
                paipu._characters = charAssignments.map((c, i) => ({ seat: i, character: c }));
            }
            try {
                fs.writeFileSync(crashPath, JSON.stringify(paipu || {}, null, 2), 'utf-8');
            } catch(_) {}
        }
    }

    stats.totalGames++;
}

/* ================================================================
 * 运行
 * ================================================================ */
let count = CONFIG.gamesPerWorker;
let charsId = CONFIG.charMode;

// 确定组名和分配函数
let groups = [];
if (charsId === 'Koromo' || charsId === 'both') {
    groups.push({ label: '全员天江衣', fn: () => ['Amae_Koromo', 'Amae_Koromo', 'Amae_Koromo', 'Amae_Koromo'] });
}
if (charsId === 'Aislinn' || charsId === 'both') {
    groups.push({ label: '全员爱丝琳', fn: () => ['Aislinn_Wishart', 'Aislinn_Wishart', 'Aislinn_Wishart', 'Aislinn_Wishart'] });
}
if (charsId === 'both') {
    groups.push({ label: '混合阵容', fn: () => ['Amae_Koromo', 'Aislinn_Wishart', 'Amae_Koromo', 'Aislinn_Wishart'] });
}

let startTime = Date.now();

for (let g of groups) {
    for (let i = 0; i < count; i++) {
        runOneGame(g.fn(), g.label + '#' + (i + 1));
    }
}

stats.elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

/* 输出结果 */
process.stdout.write(JSON.stringify(stats) + '\n');
