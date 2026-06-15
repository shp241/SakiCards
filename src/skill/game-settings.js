/**
 * 超能力麻将 - 游戏模式设置
 * 扩展 rule.js 的超能力相关配置项
 */
'use strict';

const { AssignmentMode } = require('./skill-types');

/* ========== 超能力扩展设置项定义 ========== */

const SkillRuleDefaults = {

    /* --- 点数 --- */
    /** 初始点数 */
    '配給原点': 30000,

    /* --- 技能模式 --- */
    /** 技能模式：'开启'(全技能) | '关闭'(标准日麻) | '仅被动'(只保留被动技能) */
    '技能模式': '开启',

    /* --- 角色分配 --- */
    /** 角色分配方式 */
    '角色分配方式': AssignmentMode.DRAW_4,
    /** 角色池限制 */
    '角色池限制':   '全部可用',      // '全部可用' | '仅基本角色' | '仅联动角色'

    /* --- 角色冷却 --- */
    /** 半庄间角色是否进入冷却（不可重复使用） */
    '角色冷却あり': true,

    /* --- 罚则 --- */
    /** 是否启用诈立/诈和罚则 */
    '追加罰則あり': false,

    /* --- 牌河操作 --- */
    /** 牌河操作（取牌/交换/塞牌）是否影响四风连打判定 */
    '牌河操作あり': true,

    /* --- 听牌残枚 --- */
    /** 听牌残枚计算方式 */
    '聴牌残枚計算': '雀魂方式',    // '雀魂方式' | '純粋残枚'

    /* --- 局中流局 --- */
    /** 四风连打是否启用 */
    '四風連打あり': true,
    /** 九种九牌是否启用 */
    '九種九牌あり': true,
    /** 四家立直是否流局 */
    '四家立直あり': true,
    /** 四杠散了是否流局 */
    '四槓散了あり': true,

    /* --- 人数 --- */
    /** 对局人数（3或4） */
    'プレイヤー数': 4,

    /* --- 语音 --- */
    /** 语音角色（角色目录名，空字符串表示不启用） */
    '音声キャラ': 'yiji',

    /* --- BGM --- */
    /** BGM 曲目（文件名，空字符串表示不启用） */
    'BGM': '竹取之语.mp3',
};

/**
 * 设置项元数据（用于 UI 设置面板）
 * 每项定义：key, label, type, options, default
 */
const SettingMeta = [
    {
        group: '基本ルール',
        items: [
            {
                key: '配給原点', label: '初始点数', type: 'number',
                options: [20000, 25000, 30000], default: 30000,
            },
            {
                key: 'プレイヤー数', label: '对局人数', type: 'select',
                options: [3, 4], default: 4,
            },
            {
                key: '場数', label: '场数', type: 'select',
                options: [
                    { value: 0, label: '一局战' },
                    { value: 1, label: '东风战' },
                    { value: 2, label: '东南战' },
                    { value: 4, label: '一庄战' },
                ], default: 2,
            },
            {
                key: 'トビ終了あり', label: '飞人结束', type: 'boolean',
                default: true,
            },
        ],
    },
    {
        group: '超能力設定',
        items: [
            {
                key: '技能模式', label: '技能模式', type: 'select',
                options: ['开启', '关闭', '仅被动'], default: '开启',
            },
            {
                key: '角色分配方式', label: '角色分配', type: 'select',
                options: [
                    { value: AssignmentMode.DRAW_4, label: '抽4选1' },
                    { value: AssignmentMode.DRAW_2, label: '抽2选1' },
                    { value: AssignmentMode.DRAFT,   label: '轮抽' },
                    { value: AssignmentMode.RANDOM,  label: '随机分配' },
                    { value: AssignmentMode.FREE,    label: '自由选择' },
                ], default: AssignmentMode.DRAW_4,
            },
            {
                key: '角色池限制', label: '角色池', type: 'select',
                options: ['全部可用', '仅基本角色', '仅联动角色'],
                default: '全部可用',
            },
            {
                key: '角色冷却あり', label: '半庄角色冷却', type: 'boolean',
                default: true,
            },
            {
                key: '追加罰則あり', label: '启用罚则', type: 'boolean',
                default: false,
            },
        ],
    },
    {
        group: '擴張ルール',
        items: [
            {
                key: '牌河操作あり', label: '牌河操作影响流局', type: 'boolean',
                default: true,
            },
            {
                key: '四風連打あり', label: '四风连打', type: 'boolean',
                default: true,
            },
            {
                key: '九種九牌あり', label: '九种九牌', type: 'boolean',
                default: true,
            },
            {
                key: '四家立直あり', label: '四家立直流局', type: 'boolean',
                default: true,
            },
            {
                key: '四槓散了あり', label: '四杠散了', type: 'boolean',
                default: true,
            },
        ],
    },
    {
        group: '音声設定',
        items: [
            {
                key: '音声キャラ', label: '语音角色', type: 'select',
                options: [
                    { value: 'none',          label: '不启用语音' },
                    { value: 'gongyongxiao',  label: '宫永咲' },
                    { value: 'yiji',          label: '一姬' },
                    { value: 'tianjiangyi',   label: '天江衣' },
                    { value: 'yuancunhe',     label: '原村和' },
                    { value: 'gongyongzhao',  label: '宫永照' },
                ], default: 'yiji',
            },
            {
                key: 'BGM', label: '背景音乐', type: 'select',
                options: [
                    { value: '',             label: '不启用' },
                    { value: '曲水流觞.mp3',  label: '曲水流觞' },
                    { value: '竹取之语.mp3',  label: '竹取之语' },
                ], default: '竹取之语.mp3',
            },
        ],
    },
];

/**
 * 合并为完整 rule 对象
 * @param {Object} userSettings - 用户选择的设置
 * @param {Object} baseRule - 基础 rule 对象（来自 rule.js）
 * @returns {Object} 完整 rule
 */
function mergeRule(userSettings = {}, baseRule = {}) {
    let rule = Object.assign({}, SkillRuleDefaults, baseRule, userSettings);

    /* 非超能力模式下关闭超能力专属规则 */
    if (rule['技能模式'] === '关闭') {
        rule['追加罰則あり'] = false;
        rule['牌河操作あり'] = false;
    }

    return rule;
}

module.exports = {
    SkillRuleDefaults,
    SettingMeta,
    mergeRule,
};
