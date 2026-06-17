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
const { SkillManager } = require('../src/skill/index');
const characters = require('../src/skill/characters_skills');
const { SKILL_EXECUTE_MAP } = require('../src/skill/skill-registry');

try {
    let players = [new AI(), new AI(), new AI(), new AI()];
    let rule = Majiang.rule();
    let game = new Majiang.Game(players, () => {}, rule);
    game._sync = true;
    game.speed = 0;
    game.wait = 0;

    let sm = new SkillManager({ characters, rule });
    for (let i = 0; i < 4; i++) {
        sm._activeCharacters[i] = 'Aislinn_Wishart';
        sm._activatePassiveSkills(i, 'Aislinn_Wishart');
    }
    game.skillManager = sm;

    // Intercept _add_action_log to catch skill activation logs
    let origLog = game._add_action_log.bind(game);
    game._add_action_log = function(text, seat) {
        if (text.indexOf('发动了技能') >= 0) {
            process.stdout.write('[SKILL_LOG] seat=' + seat + ' text=' + text + '\n');
        }
        return origLog(text, seat);
    };

    // Debug: intercept trigger
    let origTrigger = sm.trigger.bind(sm);
    let dispTimes = 0;
    sm.trigger = function(timing, context) {
        let result = origTrigger(timing, context);
        if (timing === 'after_discard') {
            dispTimes++;
            process.stdout.write('[after_discard #' + dispTimes + '] actions=' + 
                (result.actions ? result.actions.length : 0) + 
                ' player=' + context.player + '\n');
            if (result.actions && result.actions.length > 0) {
                for (let a of result.actions) {
                    process.stdout.write('  -> action: seat=' + a.seat + ' skillIdx=' + (a.skill.skillIndex || '?') + 
                        ' charId=' + (a.skill.characterId || '?') + '\n');
                }
            }
        }
        return result;
    };

    // Intercept _executeOptionalSkill
    let origExec = game._executeOptionalSkill.bind(game);
    game._executeOptionalSkill = function(action, baseCtx, onComplete, opts) {
        process.stdout.write('[executeOptionalSkill] seat=' + action.seat + 
            ' desc=' + (action.message || '').substring(0,40) + 
            ' hasAiDecision=' + !!(action.skill && action.skill.aiDecision) + '\n');
        return origExec(action, baseCtx, onComplete, opts);
    };

    process.stdout.write('Starting game...\n');
    game.do_sync();
    process.stdout.write('Game ended. after_discard triggers: ' + dispTimes + '\n');
} catch (e) {
    process.stdout.write('ERROR: ' + e.message + '\n' + e.stack.substring(0, 500) + '\n');
}
