/**
 * 技能隔离测试工具
 * 
 * 从牌谱中提取场况，对单个角色的技能进行独立测试。
 * 支持修改场况参数（手牌、牌河、向听数等）来测试边界情况。
 * 
 * 三种运行模式：
 *   1. 从牌谱模式：加载牌谱，还原到指定位置，测试技能
 *   2. 手动模式：手动构造测试场况
 *   3. 批量模式：自动生成多种场况批量测试某技能
 * 
 * 用法：
 *   # 从牌谱构建场况并测试技能决策
 *   node test/skill-tester.js --paipu=test/paipu/game_xxx.json --round=3 --step=15 --player=0 --skill=0
 *   
 *   # 手动构建场况
 *   node test/skill-tester.js --manual --char=Aislinn --skill=1
 *   
 *   # 批量测试某技能在不同场况下的表现
 *   node test/skill-tester.js --batch --char=Koromo --skill=2
 *   
 *   # 列出牌谱中可测试的技能点
 *   node test/skill-tester.js --paipu=test/paipu/game_xxx.json --list-skills
 */

'use strict';

const path = require('path');
const fs = require('fs');

/* 模块别名 */
const Module = require('module');
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
const { buildScenario } = require('./game-restorer');

/* ===== 命令行参数 ===== */
const args = {};
process.argv.slice(2).forEach(arg => {
    let m = arg.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
    else if (arg.match(/^--(manual|batch|verbose|list-skills|list-chars)$/))
        args[arg.slice(2)] = true;
});

console.log('╔══════════════════════════════════════╗');
console.log('║  技能隔离测试工具                      ║');
console.log('╚══════════════════════════════════════╝');

/* --list-chars: 列出所有可用角色和技能 */
if (args['list-chars']) {
    console.log('\n--- 已实现技能的角色 ---');
    let implemented = [
        { id: 'Aislinn_Wishart', name: '爱丝琳·威夏尔特', skills: ['额外巡', '从牌河摸牌并暗切'] },
        { id: 'Amae_Koromo', name: '天江衣', skills: ['海底/河底视为和牌', '移动海底牌到王牌', '修改N上限', '展示牌山末尾牌并交换'] },
    ];
    for (let c of implemented) {
        console.log('\n  ' + c.name + ' (' + c.id + ')');
        for (let i = 0; i < c.skills.length; i++) {
            console.log('    [' + i + '] ' + c.skills[i]);
        }
    }
    console.log('\n  其他 ' + (characters.length - implemented.length) + ' 名角色的技能仅文本描述，无执行代码');
    process.exit(0);
}

if (args.manual) {
    testManual(args);
} else if (args.batch) {
    testBatch(args);
} else if (args.paipu) {
    testFromPaipu(args);
} else {
    console.log('\n用法:');
    console.log('  从牌谱:  node test/skill-tester.js --paipu=<json> --round=N --step=N --player=N --skill=N [--verbose]');
    console.log('  手动:    node test/skill-tester.js --manual --char=Aislinn|Koromo --skill=N [--hand=...]');
    console.log('  批量:    node test/skill-tester.js --batch --char=Koromo|Aislinn --skill=N');
    console.log('  列角色:  node test/skill-tester.js --list-chars');
    console.log('  列技能:  node test/skill-tester.js --paipu=<json> --list-skills');
    process.exit(0);
}

/* ================================================================
 * 从牌谱测试
 * ================================================================ */

function testFromPaipu(args) {
    let paipuPath = args.paipu;
    let round = parseInt(args.round) || 1;
    let step = parseInt(args.step) || 0;
    let playerIdx = parseInt(args.player) || 0;
    let skillIdx = parseInt(args.skill) || 0;
    let verbose = !!args.verbose;

    /* --list-skills: 列出牌谱中每个玩家的技能触发点 */
    if (args['list-skills']) {
        _listSkillsInPaipu(paipuPath);
        return;
    }

    console.log('\n--- 从牌谱构建场况 ---');
    console.log('牌谱: ' + path.basename(paipuPath));
    console.log('目标: 局' + round + ' 步' + step + ' 玩家' + playerIdx + ' 技能' + skillIdx);

    let scenario = buildScenario(paipuPath, {
        round, step,
        debug: verbose,
    });

    console.log('\n--- 场况信息 ---');
    console.log('局' + scenario.context.round + ' 步' + scenario.context.step);
    console.log('当前玩家: ' + scenario.lunban);
    console.log('剩余牌数: ' + scenario.paishu);
    console.log('得分: ' + scenario.defen.join(', '));

    /* 显示所有玩家场况 */
    let model = scenario.game._model;
    for (let l = 0; l < 4; l++) {
        let shoupai = model.shoupai[l];
        let charId = scenario.game._skillManager.getCharacterId(l);
        let charName = charId || '-';
        let isTarget = l === playerIdx;
        console.log('  P' + l + ' [' + (isTarget ? '★测试目标' : padRight(model.player[l], 8)) + '] '
            + '角色=' + padRight(charName, 20)
            + ' 手牌=' + (shoupai ? String(shoupai) : '?')
            + ' 向听=' + (shoupai ? Majiang.Util.xiangting(shoupai) : '?'));
    }

    /* 显示牌河 */
    console.log('\n--- 牌河 ---');
    for (let l = 0; l < 4; l++) {
        let he = model.he[l];
        let heStr = he && he._pai ? he._pai.join(' ') : '无';
        console.log('  P' + l + ' [' + heStr + '] (' + (he ? he._pai.length : 0) + '张)');
    }

    /* 获取技能信息 */
    let skills = scenario.game._skillManager.getCharacterSkills(playerIdx);
    let charData = scenario.getCharacter(playerIdx);
    let charName = charData ? charData.name : ('玩家' + playerIdx);

    if (!skills || !skills[skillIdx]) {
        console.log('\n❌ 玩家' + playerIdx + ' 无技能' + skillIdx);
        console.log('  可用技能索引: 0-' + ((skills ? skills.length : 0) - 1));
        if (skills) {
            for (let i = 0; i < skills.length; i++) {
                console.log('    [' + i + '] ' + (skills[i].name || skills[i].description || '技能' + i));
            }
        }
        return;
    }

    /* 测试技能 */
    let skill = skills[skillIdx];
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║  测试: ' + charName + ' 技能[' + skillIdx + ']');
    console.log('║  ' + (skill.name || skill.description || '无描述'));
    console.log('╚══════════════════════════════════════╝');

    _printSkillInfo(skill);

    /* ==== AI 决策测试 ==== */
    if (skill.aiDecision) {
        console.log('\n--- AI 决策测试 ---');
        let decision = scenario.testSkillDecision(playerIdx, skillIdx, {
            player: scenario.lunban,
            dapai: '',
        });
        console.log('决策结果: ' + JSON.stringify(decision, null, 2));

        if (verbose) {
            /* 显示 AI 上下文 */
            let context = _buildAiContext(scenario.game, playerIdx);
            console.log('\n--- AI 决策上下文 ---');
            console.log('  向听数:   ' + context.xiangting);
            console.log('  牌河长度: ' + context.heLen);
            console.log('  副露玩家数:' + context.fulouCount);
            console.log('  手牌:      ' + String(context.shoupai));
            console.log('  可打牌:    ' + (context.getDapaiFn
                ? JSON.stringify(context.getDapaiFn(context.shoupai)) : 'N/A'));
        }
    } else {
        console.log('\n--- AI 决策测试 ---');
        console.log('  该技能无 AI 决策函数，无法测试 AI 选择');
    }

    /* ==== 执行效果测试 ==== */
    if (skill.effect && skill.effect.execute) {
        console.log('\n--- 执行效果测试 ---');
        try {
            let execResult = skill.effect.execute({
                game: scenario.game,
                player: scenario.lunban,
                playerIdx,
                model: scenario.model,
            });
            console.log('执行结果: ' + JSON.stringify(execResult, null, 2));
        } catch (e) {
            console.log('执行失败: ' + e.message);
            if (verbose) console.log(e.stack);
        }
    }

    /* ==== 修改场况测试 ==== */
    if (verbose && scenario.shoupai[playerIdx]) {
        console.log('\n--- 修改场况测试 ---');
        _testScenarioVariations(scenario, playerIdx, skillIdx, skill);
    }
}

/* ================================================================
 * 手动构建场况
 * ================================================================ */

function testManual(args) {
    let charId = args.char === 'Koromo' ? 'Amae_Koromo'
        : args.char === 'Aislinn' ? 'Aislinn_Wishart'
        : args.char;
    let skillIdx = parseInt(args.skill) || 0;
    let verbose = !!args.verbose;

    let charData = characters.find(c => c.id === charId);
    if (!charData) {
        console.error('未找到角色: ' + args.char);
        console.error('可用角色: Aislinn, Koromo');
        process.exit(1);
    }

    console.log('\n--- 手动场况: ' + charData.name + ' 技能' + skillIdx + ' ---');

    /* 创建最小对局 */
    let rule = Majiang.rule();
    let players = [new AI(), new AI(), new AI(), new AI()];
    let game = new Majiang.Game(players, () => {}, rule);
    game._sync = true;
    game.speed = 0;
    game.wait = 0;

    let sm = new SkillManager({ characters, rule });
    game.skillManager = sm;

    /* 分配角色（只有指定玩家有角色） */
    let playerIdx = 0;
    sm._activeCharacters[playerIdx] = charId;
    sm._activatePassiveSkills(playerIdx, charId);

    /* 初始化和牌 */
    game.kaiju(0);
    let model = game._model;

    /* 构建测试场况 */
    model.shan = new Majiang.Shan(rule);
    let testHands = [
        'm123789p123s11z77',  // 听牌-双碰（测试目标）
        'm123456789p123z1',   // 差一张
        'm123p456s789z1234',   // 听牌
        'm123p456s789z1234',   // 听牌
    ];

    if (args.hand) {
        /* 允许通过 --hand 指定手牌 */
        testHands[playerIdx] = args.hand;
    }

    for (let l = 0; l < 4; l++) {
        model.shoupai[l] = new Majiang.Shoupai();
        model.he[l] = new Majiang.He();
        model.player_id[l] = (model.qijia + model.jushu + l) % 4;
    }

    /* 发牌 */
    for (let l = 0; l < 4; l++) {
        model.shoupai[l].fromString(testHands[l]);
    }
    model.lunban = playerIdx;

    /* 模拟配牌同步 */
    game._paipu.log.push([]);
    game._paipu.action_log.push([]);
    game._diyizimo = true;
    game._lizhi = [0, 0, 0, 0];
    game._n_gang = [0, 0, 0, 0];
    game._neng_rong = [1, 1, 1, 1];

    let qipai = {
        zhuangfeng: 0, jushu: 0, changbang: 0, lizhibang: 0,
        defen: [25000, 25000, 25000, 25000],
        baopai: 'm1',
        shoupai: testHands,
    };
    for (let l = 0; l < 4; l++) {
        game._players[model.player_id[l]].action({
            qipai: Object.assign({}, qipai, { id: model.player_id[l], rule: game._rule }),
        }, () => {});
    }

    /* 显示场况 */
    console.log('\n场况:');
    for (let l = 0; l < 4; l++) {
        let sp = model.shoupai[l];
        let isTarget = l === playerIdx;
        console.log('  P' + l + ' [' + (isTarget ? '★测试目标' : '') +
            '] 手牌=' + String(sp) + ' 向听=' + Majiang.Util.xiangting(sp));
    }

    /* 测试技能 */
    let skills = sm.getCharacterSkills(playerIdx);
    let skill = skills[skillIdx];
    console.log('\n--- 测试技能 [' + skillIdx + '] ---');
    _printSkillInfo(skill);

    /* AI 决策测试 */
    if (skill.aiDecision) {
        let playerObj = game._players[playerIdx];
        let context = _buildAiContext(game, playerIdx);

        console.log('\n--- AI 决策测试 ---');
        console.log('输入: xiangting=' + context.xiangting
            + ' heLen=' + context.heLen
            + ' fulouCount=' + context.fulouCount);
        let result = skill.aiDecision(context);
        console.log('结果: ' + JSON.stringify(result, null, 2));
    } else {
        console.log('\n该技能无 AI 决策函数');
    }

    /* 执行效果测试 */
    if (skill.effect && skill.effect.execute) {
        console.log('\n--- 执行效果测试 ---');
        try {
            let result = skill.effect.execute({
                game,
                player: model.lunban,
                playerIdx,
                model,
            });
            console.log('结果: ' + JSON.stringify(result, null, 2));
        } catch (e) {
            console.log('失败: ' + e.message);
            if (verbose) console.log(e.stack);
        }
    }
}

/* ================================================================
 * 批量测试
 * ================================================================ */

function testBatch(args) {
    let charId = args.char === 'Koromo' ? 'Amae_Koromo'
        : args.char === 'Aislinn' ? 'Aislinn_Wishart'
        : args.char;
    let skillIdx = parseInt(args.skill) || 0;
    let verbose = !!args.verbose;

    let charData = characters.find(c => c.id === charId);
    if (!charData) {
        console.error('未找到角色: ' + args.char);
        process.exit(1);
    }

    console.log('\n--- 批量测试: ' + charData.name + ' 技能' + skillIdx + ' ---');

    /* 构造多种场况 */
    let scenarios = _generateBatchScenarios(charData, skillIdx);
    console.log('测试场况数: ' + scenarios.length);

    let results = { total: 0, success: 0, failures: 0, decisions: [] };

    for (let sc of scenarios) {
        results.total++;
        try {
            let rule = Majiang.rule();
            let players = [new AI(), new AI(), new AI(), new AI()];
            let game = new Majiang.Game(players, () => {}, rule);
            game._sync = true;

            let sm = new SkillManager({ characters, rule });
            game.skillManager = sm;
            sm._activeCharacters[0] = charId;
            sm._activatePassiveSkills(0, charId);

            game.kaiju(0);
            let model = game._model;

            model.shan = new Majiang.Shan(rule);
            for (let l = 0; l < 4; l++) {
                model.shoupai[l] = new Majiang.Shoupai();
                model.he[l] = new Majiang.He();
            }
            model.shoupai[0].fromString(sc.hand);
            for (let l = 1; l < 4; l++) {
                model.shoupai[l].fromString(sc.otherHands[l - 1]);
            }
            model.lunban = 0;

            /* 同步 */
            let qipai = {
                zhuangfeng: 0, jushu: 0, changbang: 0, lizhibang: 0,
                defen: [25000, 25000, 25000, 25000], baopai: 'm1',
                shoupai: [sc.hand, ...sc.otherHands],
            };
            for (let l = 0; l < 4; l++) {
                model.player_id[l] = (model.qijia + model.jushu + l) % 4;
                players[model.player_id[l]].action({
                    qipai: Object.assign({}, qipai, { id: model.player_id[l] }),
                }, () => {});
            }

            let skills = sm.getCharacterSkills(0);
            let skill = skills[skillIdx];

            if (skill && skill.aiDecision) {
                let context = _buildAiContext(game, 0, {
                    xiangting: sc.xiangting,
                    heLen: sc.heLen,
                    fulouCount: sc.fulouCount,
                });

                let decision = skill.aiDecision(context);
                results.success++;
                results.decisions.push({
                    name: sc.name,
                    xiangting: sc.xiangting,
                    hand: sc.hand,
                    activate: decision.activate,
                    choice: decision.choice || null,
                });
                if (verbose) {
                    console.log('  ' + padRight(sc.name, 20)
                        + ' activate=' + decision.activate
                        + ' choice=' + JSON.stringify(decision.choice));
                }
            } else {
                results.success++;
                results.decisions.push({
                    name: sc.name,
                    xiangting: sc.xiangting,
                    hand: sc.hand,
                    activate: null,
                    choice: null,
                });
            }
        } catch (e) {
            results.failures++;
            console.error('  ' + sc.name + ' 失败: ' + e.message);
            if (verbose) console.error(e.stack);
        }
    }

    console.log('\n--- 批量测试结果 ---');
    console.log('总场况: ' + results.total + ', 成功: ' + results.success + ', 失败: ' + results.failures);
    if (results.decisions.length > 0) {
        /* 按 activate 分组统计 */
        let activated = results.decisions.filter(d => d.activate === true).length;
        let rejected = results.decisions.filter(d => d.activate === false).length;
        console.log('发动: ' + activated + ', 不发动: ' + rejected);

        if (verbose) {
            console.log('\n详细信息:');
            console.table(results.decisions);
        }
    }
}

/* ================================================================
 * 辅助函数
 * ================================================================ */

function padRight(s, len) {
    s = String(s);
    return s + ' '.repeat(Math.max(0, len - s.length));
}

function _printSkillInfo(skill) {
    if (skill.name) console.log('名称: ' + skill.name);
    if (skill.description) console.log('描述: ' + skill.description);
    if (skill.type) console.log('类型: ' + skill.type);
    if (skill.timing) console.log('时机: ' + skill.timing);
    if (skill.limit) console.log('限制: ' + skill.limit);
    if (skill.priority != null) console.log('优先级: ' + skill.priority);
    console.log('有AI决策: ' + (!!skill.aiDecision));
    console.log('有效果执行: ' + !!(skill.effect && skill.effect.execute));
}

function _buildAiContext(game, playerIdx, overrides = {}) {
    let model = game._model;
    let player = game._players[playerIdx];

    let context = {
        player: model.lunban,
        xiangting: Majiang.Util.xiangting(model.shoupai[playerIdx]),
        heLen: player && player._countHeLen ? player._countHeLen(player._menfeng) : 0,
        fulouCount: player && player._countFulouPlayers ? player._countFulouPlayers() : 0,
        shoupai: model.shoupai[playerIdx].clone(),
        xiangtingFn: (s) => Majiang.Util.xiangting(s),
        weixianFn: null,
        paijiaFn: null,
        getDapaiFn: null,
        dapai: '',
    };

    /* 如果玩家有 suanpai，获取 AI 数据 */
    if (player && player._suanpai) {
        let seat = player._menfeng;
        context.weixianFn = (p) => player._suanpai.suan_weixian(p, seat);
        context.paijiaFn = (p) => player._suanpai.paijia(p);
    }

    /* 获取可打牌列表 */
    if (player && typeof player.get_dapai === 'function') {
        context.getDapaiFn = (s) => player.get_dapai(s);
    }

    /* 覆盖 */
    Object.assign(context, overrides);

    return context;
}

function _testScenarioVariations(scenario, playerIdx, skillIdx, skill) {
    if (!skill.aiDecision) return;

    let baseHand = scenario.shoupai[playerIdx];
    if (!baseHand) return;

    console.log('测试不同向听数的决策...');

    /* 构造不同向听数的手牌变体 */
    let variations = [
        { name: '当前手牌', hand: String(baseHand) },
    ];

    for (let v of variations) {
        let context = _buildAiContext(scenario.game, playerIdx);
        let shoupai = new Majiang.Shoupai();
        try {
            shoupai.fromString(v.hand);
            context.shoupai = shoupai;
            context.xiangting = Majiang.Util.xiangting(shoupai);

            let decision = skill.aiDecision(context);
            console.log('  ' + padRight(v.name, 15)
                + ' 向听=' + context.xiangting
                + ' 手牌=' + v.hand
                + ' -> activate=' + decision.activate);
        } catch (e) {
            console.log('  ' + padRight(v.name, 15) + ' 错误: ' + e.message);
        }
    }
}

function _listSkillsInPaipu(paipuPath) {
    let paipu = typeof paipuPath === 'string'
        ? JSON.parse(fs.readFileSync(paipuPath, 'utf-8'))
        : paipuPath;

    console.log('\n--- 牌谱技能触发点 ---');
    console.log('牌谱: ' + path.basename(paipuPath));

    if (!paipu.character) {
        console.log('  (牌谱无角色记录)');
        return;
    }

    /* 显示角色分配 */
    console.log('\n角色分配:');
    for (let i = 0; i < 4; i++) {
        let charData = paipu.character[i];
        if (charData) {
            let charId = typeof charData === 'string' ? charData : charData.id;
            let charObj = characters.find(c => c.id === charId);
            let charName = charObj ? charObj.name : charId;
            console.log('  P' + i + ': ' + charName + ' (' + charId + ')');
        }
    }

    /* 搜索 action_log 中的技能触发记录 */
    console.log('\n各局首步可测试技能 (qipai后):');
    for (let r = 0; r < paipu.log.length; r++) {
        if (paipu.log[r].length > 0) {
            let firstEntry = paipu.log[r][0];
            if (firstEntry.qipai) {
                for (let p = 0; p < 4; p++) {
                    let charData = paipu.character[p];
                    if (charData) {
                        let charId = typeof charData === 'string' ? charData : charData.id;
                        let charObj = characters.find(c => c.id === charId);
                        let charName = charObj ? charObj.name : charId;
                        console.log('  局' + (r+1) + ' P' + p + ' ' + charName
                            + ' (--round=' + (r+1) + ' --step=0 --player=' + p + ')');
                    }
                }
            }
        }
    }
}

/* ===== 批量测试场况生成 ===== */
function _generateBatchScenarios(charData, skillIdx) {
    let scenarios = [];

    if (charData.id === 'Aislinn_Wishart' && skillIdx === 0) {
        /* 爱丝琳技能0：额外巡决策 */
        for (let xt of [0, 1, 2, 3]) {
            for (let pos of [0, 1, 2, 3, 4, 5]) {
                scenarios.push({
                    name: '向听' + xt + '_位' + pos,
                    hand: 'm123789p123s11z7',
                    otherHands: ['m123p456s789z12', 'm123p456s789z12', 'm123p456s789z12'],
                    xiangting: xt,
                    heLen: pos,
                    fulouCount: 0,
                });
            }
        }
    }

    if (charData.id === 'Aislinn_Wishart' && skillIdx === 1) {
        /* 爱丝琳技能1：从牌河摸牌 */
        for (let xt of [0, 1, 2]) {
            scenarios.push({
                name: '向听' + xt,
                hand: 'm123789p123s11z7',
                otherHands: ['m123p456s789z12', 'm123p456s789z12', 'm123p456s789z12'],
                xiangting: xt,
                heLen: 3,
                fulouCount: 0,
            });
        }
    }

    if (charData.id === 'Amae_Koromo' && skillIdx === 1) {
        /* 天江衣技能2：移海底牌（实际是 skill index 1 = 技能②） */
        for (let n of [1, 2]) {
            for (let xt of [0, 1]) {
                scenarios.push({
                    name: '移' + n + '张_向听' + xt,
                    hand: 'm123789p123s11z7',
                    otherHands: ['m123p456s789z12', 'm123p456s789z12', 'm123p456s789z12'],
                    xiangting: xt,
                    heLen: 0,
                    fulouCount: 0,
                });
            }
        }
    }

    if (scenarios.length === 0) {
        /* 默认场景 */
        for (let xt of [0, 1, 2, 3]) {
            scenarios.push({
                name: '默认_向听' + xt,
                hand: 'm123789p123s11z7',
                otherHands: ['m123p456s789z12', 'm123p456s789z12', 'm123p456s789z12'],
                xiangting: xt,
                heLen: 3,
                fulouCount: 0,
            });
        }
    }

    return scenarios;
}
