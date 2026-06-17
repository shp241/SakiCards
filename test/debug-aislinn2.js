/**
 * Debug Aislinn_Wishart - trace _executeOptionalSkill + aiDecision
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
const { TimingPoints } = require('../src/skill/triggers');

const charId = 'Aislinn_Wishart';

// Hook _executeOptionalSkill
const origExecOpt = Majiang.Game.prototype._executeOptionalSkill;
Majiang.Game.prototype._executeOptionalSkill = function(action, baseContext, onComplete, options) {
    let skill = action.skill;
    if (skill && skill.id === 'Aislinn_Wishart_skill_0') {
        let isAI = this._canAutoDecideSkill(this._ctx.playerIndex(action.seat));
        console.log('[EXEC] _executeOptionalSkill: skill=' + skill.id +
            ' seat=' + action.seat +
            ' isAI=' + isAI +
            ' hasAiDecision=' + !!skill.aiDecision);
    }
    return origExecOpt.call(this, action, baseContext, onComplete, options);
};

// Run
let rule = Majiang.rule();
let players = [new AI(), new AI(), new AI(), new AI()];
let game = new Majiang.Game(players, () => {}, rule);
game._sync = true;
game.speed = 0;
game.wait = 0;

let sm = new SkillManager({ characters, rule });
for (let i = 0; i < 4; i++) {
    sm._activeCharacters[i] = charId;
    sm._activatePassiveSkills(i, charId);
}
game.skillManager = sm;

// Also hook aiDecision
const originalAi = game._skillManager._registry.getCharacter(charId).skills[0].aiDecision;
if (originalAi) {
    let callCount = 0;
    game._skillManager._registry.getCharacter(charId).skills[0].aiDecision = function(ctx) {
        callCount++;
        let result = originalAi.call(this, ctx);
        if (callCount <= 10) {
            console.log('[AI] aiDecision called #' + callCount + ': result=' + result +
                ' paiCount=' + (ctx.model ? (ctx.model.he[ctx.seat] ? '?' : 'no he') : 'no model') +
                ' seat=' + ctx.seat);
        }
        return result;
    };
}

console.log('Starting game...');
let result;
try {
    result = game.do_sync();
} catch(e) {
    console.error('Error:', e.message);
}
console.log('Done');
