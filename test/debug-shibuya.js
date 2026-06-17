/**
 * Debug Shibuya_Takami skill triggering
 */
'use strict';

const Module = require('module');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;

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
const tileUtils = require('../src/effect/tile-utils');
const { TimingPoints } = require('../src/skill/triggers');

let players = [new AI(), new AI(), new AI(), new AI()];
let rule = Majiang.rule();
let game = new Majiang.Game(players, () => {}, rule);
game._sync = true;
game.speed = 0;
game.wait = 0;

let sm = new SkillManager({ characters, rule });
for (let i = 0; i < 4; i++) {
    sm._activeCharacters[i] = 'Shibuya_Takami';
    sm._activatePassiveSkills(i, 'Shibuya_Takami');
}
game.skillManager = sm;

// Inject debug logging into the BEFORE_DRAW skill trace
let origTrigger = sm.trigger.bind(sm);
let traceCount = 0;
let skillMatchCount = 0;

// Also trace _handleBeforeDrawSkillAction
let origHandleBeforeDraw = game._handleBeforeDrawSkillAction.bind(game);
game._handleBeforeDrawSkillAction = function(action, lunban) {
    let seat = action.seat;
    let model = game._model;
    let he = model.he[seat];
    let paiCount = he ? tileUtils.countHePai(he) : 0;
    let firstTile = '?';
    if (he && paiCount > 0) {
        let count = tileUtils.countHePai(he);
        let rowStart = Math.floor((count - 1) / 6) * 6;
        firstTile = `rowStart=${rowStart}`;
        for (let i = rowStart; i < Math.min(he._pai.length, rowStart + 6); i++) {
            let t = he._pai[i];
            if (!t.match(/[\+\=\-]$/)) {
                firstTile = t.replace(/[_\*]$/, '');
                break;
            }
        }
    }
    console.error(`[BEFORE_DRAW_ACTION] lunban=${lunban} seat=${seat} paiCount=${paiCount} firstTile=${firstTile}`);
    return origHandleBeforeDraw(action, lunban);
};

// Also trace the condition evaluation
let shibuyaSkill = null;
for (let s of sm._registry.getAllCharacters()) {
    if (s.id === 'Shibuya_Takami_skill_0') shibuyaSkill = s;
    for (let sub of s.skills) {
        if (sub.id === 'Shibuya_Takami_skill_0') shibuyaSkill = sub;
    }
}

sm.trigger = function(timing, context) {
    let result = origTrigger(timing, context);
    if (timing === 'before_draw' && traceCount < 40) {
        let seat = context.seat !== undefined ? context.seat : '?';
        let player = context.player !== undefined ? context.player : '?';
        let isExtra = context.isExtraTurn ? 'EXTRA' : 'NORM';
        console.error(`[TRACE] before_draw player=${player} seat=${seat} isExtra=${isExtra} actions=${result.actions.length}`);
        if (result.actions.length > 0) {
            for (let a of result.actions) {
                console.error(`  ACTION: skill=${a.skill.id} seat=${a.seat}`);
            }
            skillMatchCount++;
        }
        traceCount++;
    }
    return result;
};

try {
    game.do_sync();
} catch(e) {
    console.error('CRASH:', e.message);
}
console.error('Done. traces:', traceCount, 'skillMatches:', skillMatchCount);
