/**
 * 游戏状态还原器
 * 
 * 从增强型牌谱（含初始牌山）还原游戏到指定步骤，支持从任意位置续跑。
 * 
 * 核心功能：
 *   - restoreGame()      还原到指定步骤，返回可续跑的 game 对象
 *   - buildScenario()    构建场况快照，用于技能隔离测试
 *   - continueFromState()从已还原的游戏状态跨局续跑
 * 
 * 用法：
 *   let { game, step } = restoreGame(paipuData, { stopAtStep: N });
 *   let result = continueFromState(game, { debug: true });
 * 
 *   let scenario = buildScenario(paipuData, { round: 3, step: 15 });
 *   scenario.testSkillDecision(0, 0);
 */

'use strict';

const Module = require('module');
const path = require('path');
const fs = require('fs');
const originalResolveFilename = Module._resolveFilename;
const ROOT = path.resolve(__dirname, '..');

/* 模块别名 */
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
const { createShanFromData } = require('./shan-serialize');

/**
 * 从增强型牌谱加载并还原游戏
 *
 * @param {Object|string} paipuData - 牌谱对象或 JSON 文件路径
 * @param {Object} opts
 * @param {number} [opts.stopAtStep] - 还原到的全局 step 编号（从 0 开始，跨局计数）
 * @param {number} [opts.stopAtRound] - 还原到第几局（1-based）
 * @param {number} [opts.stopAtRoundStep] - 还原到某局的第几步（0-based）
 * @param {boolean} [opts.debug] - 调试模式
 * @returns {{ game: Game, step: number, round: number, roundStep: number, paipu: Object }}
 */
function restoreGame(paipuData, opts = {}) {
    opts = Object.assign({ stopAtStep: -1, stopAtRound: -1, stopAtRoundStep: -1 }, opts);

    let paipu = typeof paipuData === 'string'
        ? JSON.parse(fs.readFileSync(paipuData, 'utf-8'))
        : paipuData;

    if (opts.debug) {
        console.log('[restorer] 牌谱加载完成');
        console.log('  总局数:', paipu.log.length);
        console.log('  有墙数据:', !!paipu.wall);
        if (paipu._error) {
            console.log('  记录错误:', paipu._error.message);
        }
    }

    let { targetRound, targetRoundStep } = _resolveTarget(paipu, opts);

    if (opts.debug) {
        console.log('  目标: 局' + (targetRound + 1) + ' 第' + targetRoundStep + '步');
    }

    /* 创建 AI 玩家 */
    let players = [];
    for (let i = 0; i < 4; i++) {
        players[i] = new AI();
    }

    /* 创建对局 */
    let rule = Majiang.rule();
    let game = new Majiang.Game(players, () => {}, rule);
    game._sync = true;
    game.speed = 0;
    game.wait = 0;

    /* 设置技能管理器 */
    let sm = new SkillManager({ characters, rule });
    game.skillManager = sm;

    /* 分配角色 */
    if (paipu.character) {
        for (let i = 0; i < 4; i++) {
            let charData = paipu.character[i];
            let charId = typeof charData === 'string' ? charData : (charData && charData.id);
            if (charId) {
                sm._activeCharacters[i] = charId;
                sm._activatePassiveSkills(i, charId);
            }
        }
    }

    /* 手动执行 kaiju */
    game.kaiju(paipu.qijia);

    let globalStep = 0;

    for (let r = 0; r <= targetRound; r++) {
        let roundLog = paipu.log[r];
        if (!roundLog || roundLog.length === 0) continue;

        /* 注入初始牌山 */
        if (paipu.wall) {
            _injectWall(game, paipu.wall);
        }

        /* 初始化局内状态 */
        _initRoundState(game);

        let maxStep = (r === targetRound) ? targetRoundStep : (roundLog.length - 1);

        /* 第一项必须是 qipai */
        let qipaiEntry = roundLog[0];
        if (qipaiEntry.qipai) {
            if (opts.debug) console.log('[restorer] ' + (r+1) + '局: 步骤0 qipai');
            _applyQipai(game, qipaiEntry.qipai, paipu);
            globalStep++;
            if (r === targetRound && targetRoundStep === 0) break;
        }

        /* 还原后续操作 */
        for (let s = 1; s <= maxStep; s++) {
            let entry = roundLog[s];
            let opType = _getOpType(entry);
            if (!opType) continue;

            try {
                _applyOp(game, entry, opType);
            } catch (e) {
                throw new Error(
                    '还原第'+(r+1)+'局第'+s+'步('+opType+')时出错: ' + e.message + '\n' +
                    '  entry=' + JSON.stringify(entry)
                );
            }

            globalStep++;
            if (r === targetRound && s === targetRoundStep) {
                /* 到达目标步骤，检查是否是局终 */
                if (opType === 'hule' || opType === 'pingju') {
                    game._no_game = false;  /* 允许续跑下一局 */
                }
                break;
            }
        }
    }

    if (opts.debug) {
        let m = game._model;
        console.log('[restorer] 还原完成 局'+(targetRound+1)+'步'+targetRoundStep+
            ' lunban=' + m.lunban + ' paishu=' + (m.shan ? m.shan.paishu : '?'));
    }

    return {
        game, step: globalStep,
        round: targetRound, roundStep: targetRoundStep,
        paipu,
    };
}

/**
 * 从已还原的游戏状态跨局续跑
 * 
 * 模拟 do_sync 的循环，但从当前状态开始而非 kaiju。
 * 支持跨局续跑：当前局结束后自动进入下一局。
 *
 * @param {Game} game - 已还原的 game 对象
 * @param {Object} opts
 * @param {boolean} [opts.debug] - 调试模式，输出每步状态
 * @param {boolean} [opts.verbose] - 详细模式
 * @returns {Object} { success: boolean, error: Error|null, roundsCompleted: number }
 */
function continueFromState(game, opts = {}) {
    opts = Object.assign({ debug: false, verbose: false }, opts);

    if (opts.debug) {
        console.log('[continueFromState] 开始续跑 '
            + 'status=' + game._status
            + ' no_game=' + game._no_game
            + ' lunban=' + game._model.lunban);
    }

    let roundsCompleted = 0;
    let totalSteps = 0;

    try {
        /* 如果当前局未结束，继续执行当前局 */
        while (!game._no_game) {
            /* 从当前状态推进 */
            let status = game._status;

            if (opts.debug) {
                console.log('  [续跑] status=' + status
                    + ' lunban=' + game._model.lunban
                    + ' paishu=' + (game._model.shan ? game._model.shan.paishu : '?'));
            }

            /* 如果状态是 qipai 或 dapai（正常流程），下一个状态由 zimo() 推进 */
            if (status === 'qipai') {
                game.zimo();
                totalSteps++;
                if (opts.debug) {
                    console.log('  [续跑] zimo 后 status=' + game._status
                        + ' lunban=' + game._model.lunban);
                }
            }

            /* 使用 do_sync 风格的循环继续 */
            for (let safety = 0; safety < 20000; safety++) {
                if      (game._status === 'zimo')     game.reply_zimo();
                else if (game._status === 'dapai')    game.reply_dapai();
                else if (game._status === 'fulou')    game.reply_fulou();
                else if (game._status === 'gang')     game.reply_gang();
                else if (game._status === 'gangzimo') game.reply_zimo();
                else if (game._status === 'hule')     game.reply_hule();
                else if (game._status === 'pingju')   game.reply_pingju();
                else                                  break;

                totalSteps++;
                if (totalSteps % 100 === 0 && opts.debug) {
                    console.log('  [续跑] 已执行 ' + totalSteps + ' 步');
                }
            }

            /* 检查局是否结束 */
            if (game._no_game) {
                roundsCompleted++;
                if (opts.debug) {
                    console.log('  [续跑] 局结束 roundsCompleted=' + roundsCompleted
                        + ' defen=[' + (game._model.defen || []).join(',') + ']');
                }

                /* 尝试进入下一局 */
                if (game._status === 'hule' || game._status === 'pingju') {
                    /* 调用 last() 来处理局间逻辑 */
                    try {
                        if (typeof game.last === 'function') {
                            game.last();
                            if (opts.debug) {
                                console.log('  [续跑] last() 后 status=' + game._status
                                    + ' no_game=' + game._no_game);
                            }
                        }
                    } catch (e) {
                        /* last() 可能在某些状态下失败，忽略 */
                        if (opts.debug) {
                            console.log('  [续跑] last() 完成或跳过');
                        }
                    }
                }

                /* 如果 after last() 后仍然是 no_game 但 jieju 未触发，游戏可能结束 */
                if (game._status !== 'jieju' && game._no_game) {
                    /* 需要手动推进到下一局 */
                    if (opts.debug) {
                        console.log('  [续跑] 需要手动推进下一局');
                    }
                    /* 重置 no_game 推进到 next */
                    game._no_game = false;
                    // 检查是否已经 jieju
                    if (game._status === 'jieju' || game._model.jieju) {
                        if (opts.debug) console.log('  [续跑] 半庄结束 (jieju)');
                        break;
                    }
                    // 没有更多的局了
                    if (game._paipu.log.length >= game._max_jushu + 1) {
                        if (opts.debug) console.log('  [续跑] 所有局已完成');
                        game._no_game = true;
                        break;
                    }
                }
            }

            /* 半庄结束 */
            if (game._status === 'jieju') {
                if (opts.debug) console.log('  [续跑] 半庄结束 (jieju)');
                break;
            }
        }

        if (opts.debug) {
            console.log('[continueFromState] 续跑完成 '
                + 'roundsCompleted=' + roundsCompleted
                + ' totalSteps=' + totalSteps);
        }

        return { success: true, error: null, roundsCompleted, totalSteps };

    } catch (e) {
        if (opts.debug) {
            console.error('[continueFromState] 续跑崩溃: ' + e.message);
            console.error('  status=' + game._status
                + ' no_game=' + game._no_game
                + ' lunban=' + (game._model ? game._model.lunban : '?'));
        }
        return { success: false, error: e, roundsCompleted, totalSteps };
    }
}

/**
 * 从牌谱构建场况快照（用于技能单独测试）
 *
 * @param {Object|string} paipuData
 * @param {Object} opts
 * @param {number} opts.round - 局号（1-based）
 * @param {number} opts.step - 步骤号（0-based）
 * @returns {Object} 场况快照
 */
function buildScenario(paipuData, opts = {}) {
    let result = restoreGame(paipuData, {
        stopAtRound: opts.round,
        stopAtRoundStep: opts.step,
        debug: opts.debug,
    });

    let model = result.game._model;
    return {
        game: result.game,
        model,
        shoupai: model.shoupai.map(s => s ? s.clone() : null),
        he: model.he.map(h => h ? { _pai: h._pai.slice() } : null),
        shan: model.shan,
        lunban: model.lunban,
        defen: model.defen.slice(),
        paishu: model.shan ? model.shan.paishu : 0,
        paipu: result.paipu,
        context: { round: result.round, step: result.roundStep },

        /** 对指定玩家测试指定技能 AI 决策 */
        testSkillDecision(playerIdx, skillIndex, extraContext = {}) {
            let skills = result.game._skillManager.getCharacterSkills(playerIdx);
            let skill = skills ? skills[skillIndex] : null;
            if (!skill) return null;
            let playerObj = result.game._players[playerIdx];
            if (playerObj && typeof playerObj.decideSkillAction === 'function') {
                return playerObj.decideSkillAction(
                    { playerIdx, skill, type: 'prompt' },
                    extraContext
                );
            }
            return null;
        },

        /** 在快照上自定义摸牌并测试 */
        zimoAndTest(playerIdx, pai) {
            let sp = this.shoupai[playerIdx].clone();
            sp.zimo(pai);
            return sp;
        },

        /** 获取角色信息 */
        getCharacter(playerIdx) {
            return result.game._skillManager
                ? result.game._skillManager.getCharacter(playerIdx)
                : null;
        },

        /** 获取玩家手牌 */
        getShoupai(playerIdx) {
            return model.shoupai[playerIdx]
                ? model.shoupai[playerIdx].clone()
                : null;
        },

        /** 获取牌河 */
        getHe(playerIdx) {
            let he = model.he[playerIdx];
            return he ? he._pai.slice() : [];
        },
    };
}

/**
 * 计算全局步数
 */
function countGlobalSteps(paipu) {
    let steps = 0;
    for (let roundLog of paipu.log) steps += roundLog.length;
    return steps;
}

/* ===== 内部辅助 ===== */

function _resolveTarget(paipu, opts) {
    if (opts.stopAtRound > 0) {
        return {
            targetRound: opts.stopAtRound - 1,
            targetRoundStep: opts.stopAtRoundStep,
        };
    }
    if (opts.stopAtStep >= 0) {
        let steps = 0;
        for (let r = 0; r < paipu.log.length; r++) {
            let len = paipu.log[r].length;
            if (steps + len > opts.stopAtStep) {
                return { targetRound: r, targetRoundStep: opts.stopAtStep - steps };
            }
            steps += len;
        }
    }
    let lastR = paipu.log.length - 1;
    return { targetRound: lastR, targetRoundStep: paipu.log[lastR].length - 1 };
}

function _injectWall(game, wallData) {
    game._model.shan = createShanFromData(game._rule, wallData);
}

function _initRoundState(game) {
    /* 重置每局的状态变量 */
    game._diyizimo = true;
    game._fengpai = game._rule['途中流局あり'];
    game._isExtraTurnDiscard = false;
    game._skillExtraUsedRows = {};
    game._koromoHuleSelectionDone = false;
    game._koromoSkill4Used = undefined;
    game._dapai = null;
    game._dapaiHidden = false;
    game._gang = null;
    game._extra_turn = null;
    game._lizhi = [0, 0, 0, 0];
    game._yifa = [0, 0, 0, 0];
    game._n_gang = [0, 0, 0, 0];
    game._neng_rong = [1, 1, 1, 1];
    game._hule = [];
    game._hule_option = null;
    game._no_game = false;
    game._lianzhuang = false;
    game._fenpei = null;
}

function _applyQipai(game, qipai, paipu) {
    let model = game._model;

    model.zhuangfeng = qipai.zhuangfeng;
    model.jushu = qipai.jushu;
    model.changbang = qipai.changbang;
    model.lizhibang = qipai.lizhibang;

    if (!model.defen || model.defen.length < 4) {
        model.defen = qipai.defen ? qipai.defen.slice() : [25000,25000,25000,25000];
    }

    if (!model.shan) {
        model.shan = new Majiang.Shan(game._rule);
    }

    for (let l = 0; l < 4; l++) {
        model.shoupai[l] = new Majiang.Shoupai();
        model.he[l] = new Majiang.He();
        model.seatToPlIdx[l] = (model.qijia + model.jushu + l) % 4;
    }

    if (qipai.shoupai) {
        for (let l = 0; l < 4; l++) {
            model.shoupai[l].fromString(qipai.shoupai[l]);
        }
    }

    if (qipai.baopai && model.shan._baopai && model.shan._baopai.length === 0) {
        model.shan._baopai = [qipai.baopai];
    }

    /* 初始化 Game 内部局状态 */
    _initRoundState(game);

    game._changbang = model.changbang;

    game._paipu.defen = model.defen.concat();
    game._paipu.log.push([]);
    game._paipu.action_log.push([]);
    game._paipu.log[game._paipu.log.length - 1].push({ qipai: qipai });

    /* 同步玩家 */
    let qipaiMsg = [];
    for (let l = 0; l < 4; l++) {
        qipaiMsg[l] = {
            qipai: {
                zhuangfeng: model.zhuangfeng,
                jushu: model.jushu,
                changbang: model.changbang,
                lizhibang: model.lizhibang,
                defen: qipai.defen,
                baopai: qipai.baopai,
                shoupai: qipai.shoupai,
                id: model.seatToPlIdx[l],
                rule: game._rule,
            }
        };
    }
    _syncPlayers(game, 'qipai', qipaiMsg);

    model.lunban = -1;
}

function _getOpType(entry) {
    if (!entry || typeof entry !== 'object') return null;
    let keys = Object.keys(entry);
    return keys.length > 0 ? keys[0] : null;
}

function _applyOp(game, entry, opType) {
    let model = game._model;
    let data = entry[opType];
    let msgs;

    switch (opType) {
    case 'zimo':
        model.shan.zimo();
        model.lunban = data.l;
        model.shoupai[data.l].zimo(data.p);
        game._paipu.log[game._paipu.log.length - 1].push(entry);

        msgs = [];
        for (let l = 0; l < 4; l++) {
            msgs[l] = { zimo: { l: data.l, p: (l === data.l) ? data.p : '' } };
        }
        _syncPlayers(game, 'zimo', msgs);
        break;

    case 'dapai':
        model.lunban = data.l;
        model.shoupai[data.l].dapai(data.p);
        model.he[data.l].dapai(data.p, data.hidden || false);
        game._dapai = data.p;
        game._dapaiHidden = data.hidden || false;
        game._diyizimo = false;
        game._paipu.log[game._paipu.log.length - 1].push(entry);

        msgs = [];
        for (let l = 0; l < 4; l++) {
            msgs[l] = { dapai: { l: data.l, p: data.p, hidden: data.hidden || false } };
        }
        _syncPlayers(game, 'dapai', msgs);
        break;

    case 'fulou':
        model.lunban = data.l;
        model.shoupai[data.l].fulou(data.m);
        model.he[data.l].fulou(data.m);
        game._diyizimo = false;
        game._paipu.log[game._paipu.log.length - 1].push(entry);

        msgs = [];
        for (let l = 0; l < 4; l++) {
            msgs[l] = { fulou: { l: data.l, m: data.m } };
        }
        _syncPlayers(game, 'fulou', msgs);
        break;

    case 'gang':
        model.lunban = data.l;
        model.shoupai[data.l].gang(data.m);
        game._diyizimo = false;
        game._paipu.log[game._paipu.log.length - 1].push(entry);

        msgs = [];
        for (let l = 0; l < 4; l++) {
            msgs[l] = { gang: { l: data.l, m: data.m } };
        }
        _syncPlayers(game, 'gang', msgs);
        break;

    case 'gangzimo':
        model.shan.gangzimo();
        model.lunban = data.l;
        model.shoupai[data.l].zimo(data.p);
        game._paipu.log[game._paipu.log.length - 1].push(entry);

        msgs = [];
        for (let l = 0; l < 4; l++) {
            msgs[l] = { gangzimo: { l: data.l, p: (l === data.l) ? data.p : '' } };
        }
        _syncPlayers(game, 'zimo', msgs);
        break;

    case 'kaigang':
        model.shan.kaigang();
        game._paipu.log[game._paipu.log.length - 1].push(entry);
        break;

    case 'hule':
        if (data.shoupai) {
            for (let l = 0; l < 4; l++) {
                if (data.shoupai[l]) model.shoupai[l].fromString(data.shoupai[l]);
            }
        }
        if (data.defen) {
            for (let l = 0; l < 4; l++) {
                model.defen[l] = (model.defen[l] || 0) + (data.defen[l] || 0);
            }
        }
        game._paipu.log[game._paipu.log.length - 1].push(entry);
        game._no_game = true;
        break;

    case 'pingju':
        if (data.shoupai) {
            for (let l = 0; l < 4; l++) {
                if (data.shoupai[l]) model.shoupai[l].fromString(data.shoupai[l]);
            }
        }
        if (data.fenpei) {
            for (let l = 0; l < 4; l++) {
                model.defen[l] = (model.defen[l] || 0) + (data.fenpei[l] || 0);
            }
        }
        game._paipu.log[game._paipu.log.length - 1].push(entry);
        game._no_game = true;
        break;
    }
}

function _syncPlayers(game, type, msgs) {
    for (let l = 0; l < 4; l++) {
        let id = game._model.seatToPlIdx[l];
        game._players[id].action(msgs[l], () => {});
    }
    game._status = type;
}

module.exports = { restoreGame, buildScenario, continueFromState, countGlobalSteps };
