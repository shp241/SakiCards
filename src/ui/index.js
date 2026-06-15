/*!
 *  @kobalab/majiang-ui v1.6.0
 *
 *  Copyright(C) 2021 Satoshi Kobayashi
 *  Released under the MIT license
 *  https://github.com/kobalab/majiang-ui/blob/master/LICENSE
 */

"use strict";

module.exports = {
    pai:         require('./pai'),
    audio:       require('./audio'),
    Shoupai:     require('./shoupai'),
    He:          require('./he'),
    Shan:        require('./shan'),
    Board:       require('./board'),
    HuleDialog:  require('./dialog'),
    Player:      require('./player'),
    GameCtl:     require('./gamectl'),
    PaipuFile:   require('./file'),
    Paipu:       require('./paipu'),
    Analyzer:    require('./analyzer'),
    PaipuStat:   require('./stat'),
    PaipuEditor: require('./editor'),
    ShanViewer:  require('./shan_viewer'),
    InfoPanel:   require('./info_panel'),
    CharacterSelector: require('./character_selector'),
    SkillPrompt:     require('./skill_prompt'),
    Toast:          require('./toast'),
    VoicePlayer:    require('./voice_player'),
    BgmPlayer:      require('./bgm_player'),
    Util:        Object.assign(require('./fadein'),
                               require('./selector'),
                               require('./scale'),
                               { flipInput: require('./flip') })
}
