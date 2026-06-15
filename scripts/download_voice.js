/**
 * 雀魂角色语音下载脚本
 *
 * 用法：
 *   node scripts/download_voice.js <角色目录名> [输出目录]
 *
 * 示例：
 *   node scripts/download_voice.js gongyongxiao
 *   node scripts/download_voice.js gongyongxiao ./resources/voice/gongyongxiao
 *   node scripts/download_voice.js yuanhecunhua ./resources/voice/yuanhecunhua
 *
 * 角色目录名对照（从 WIKI 页面可查到）：
 *   宫永咲   - gongyongxiao
 *   原村和   - yuanhecunhua
 *   天江衣   - tianjiangyi
 *   ... 等
 */

'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/* ================================================================
 *  配置
 * ================================================================ */

const BASE_URL = 'https://game.maj-soul.com/1/v0.10.1.w/audio/sound/';

/** 操作语音 */
const ACTIONS = [
    'act_rich',     // 立直
    'act_drich',    // 两立直
    'act_chi',      // 吃
    'act_pon',      // 碰
    'act_kan',      // 槓
    'act_babei',    // 拔北
    'act_ron',      // 荣
    'act_tumo',     // 自摸
];

/** 局中特殊语音 */
const INGAME = [
    'ingame_lianda',    // 连续打出多张相同牌
    'ingame_baopai',    // 打出宝牌
    'ingame_remain10',  // 余牌少于10
    'ingame_yiman',     // 役满听牌
    'ingame_beiman',    // 倍满/三倍满听牌
];

/** 大厅/羁绊语音 */
const LOBBY = [
    'lobby_selfintro',       // 获得语音
    'lobby_playerlogin',     // 登录语音普通
    'lobby_playerlogin_max', // 登录语音满羁绊
    'lobby_normal1',         // 大厅交互语音1
    'lobby_normal2',         // 大厅交互语音2
    'lobby_normal3',         // 大厅交互语音3
    'lobby_normal4',         // 大厅交互语音4
    'lobby_normal5',         // 大厅交互语音5
    'lobby_normalmax1',      // 大厅交互语音6 (满羁绊)
    'lobby_normalmax2',      // 大厅交互语音7 (满羁绊)
    'lobby_normalmax3',      // 大厅交互语音8 (满羁绊)
    'lobby_gift',            // 送礼物语音普通
    'lobby_gift_favor',      // 送礼物语音喜好
    'lobby_levelup1',        // 好感度升级语音1
    'lobby_levelup2',        // 好感度升级语音2
    'lobby_levelup3',        // 好感度升级语音3
    'lobby_levelmax',        // 好感度升级语音4
    'lobby_manjiban',        // 好感度升级语音5
    'lobby_qiyue',           // 契约语音
];

/** 隐藏/节日语音 */
const EXTRA = [
    'extra/lobby_newyear',   // 新年
    'extra/lobby_valentine', // 情人节
];

/** 役种语音（结算时播报） */
const FAN = [
    'fan_qianggang',              // 抢杠
    'fan_lingshang',              // 岭上开花
    'fan_haidi',                  // 海底摸月
    'fan_hedi',                   // 河底捞鱼
    'fan_dong',                   // 东
    'fan_nan',                    // 南
    'fan_xi',                     // 西
    'fan_bei',                    // 北
    'fan_zhong',                  // 中
    'fan_bai',                    // 白
    'fan_fa',                     // 发
    'fan_doubledong',             // 连东
    'fan_doublenan',              // 连南
    'fan_doublexi',               // 连西
    'fan_doublebei',              // 连北
    'fan_duanyao',                // 断幺
    'fan_yibeikou',               // 一杯口
    'fan_pinghu',                 // 平和
    'fan_hunquandaiyaojiu',       // 混全带幺九
    'fan_yiqitongguan',           // 一气通贯
    'fan_sansetongshun',          // 三色同顺
    'fan_sansetongke',            // 三色同刻
    'fan_sangangzi',              // 三杠子
    'fan_duiduihu',               // 对对和
    'fan_sananke',                // 三暗刻
    'fan_xiaosanyuan',            // 小三元
    'fan_hunlaotou',              // 混老头
    'fan_qiduizi',                // 七对子
    'fan_chunquandaiyaojiu',      // 纯全带幺九
    'fan_hunyise',                // 混一色
    'fan_erbeikou',               // 二杯口
    'fan_qingyise',               // 清一色
    'fan_liqi',                   // 立直
    'fan_dliqi',                  // 两立直
    'fan_zimo',                   // 自摸
    'fan_yifa',                   // 一发
    'fan_dora1',                  // 宝牌
    'fan_dora2',                  // 宝牌2
    'fan_dora3',                  // 宝牌3
    'fan_dora4',                  // 宝牌4
    'fan_dora5',                  // 宝牌5
    'fan_dora6',                  // 宝牌6
    'fan_dora7',                  // 宝牌7
    'fan_dora8',                  // 宝牌8
    'fan_dora9',                  // 宝牌9
    'fan_dora10',                 // 宝牌10
    'fan_dora11',                 // 宝牌11
    'fan_dora12',                 // 宝牌12
    'fan_dora13',                 // 宝牌一大堆
    'fan_tianhu',                 // 天和
    'fan_dihu',                   // 地和
    'fan_dasanyuan',              // 大三元
    'fan_sianke',                 // 四暗刻
    'fan_siankedanqi',            // 四暗刻单骑
    'fan_ziyise',                 // 字一色
    'fan_lvyise',                 // 绿一色
    'fan_qinglaotou',             // 清老头
    'fan_guoshiwushuang',         // 国士无双
    'fan_guoshishisanmian',       // 国士无双13面听
    'fan_dasixi',                 // 大四喜
    'fan_xiaosixi',               // 小四喜
    'fan_sigangzi',               // 四杠子
    'fan_jiulianbaodeng',         // 九莲宝灯
    'fan_chunzhengjiulianbaodeng',// 纯正九莲宝灯
    'fan_liujumanguan',           // 流局满贯
];

/** 局终语音 */
const GAMEEND = [
    'gameend_leijiyiman',    // 累计役满
    'gameend_manguan',       // 满贯
    'gameend_tiaoman',       // 跳满
    'gameend_beiman',        // 倍满
    'gameend_sanbeiman',     // 三倍满
    'gameend_yiman1',        // 役满
    'gameend_yiman2',        // 两倍役满
    'gameend_yiman3',        // 三倍役满
    'gameend_yiman4',        // 四倍役满
    'gameend_yiman5',        // 五倍役满
    'gameend_yiman6',        // 六倍役满
    'gameend_tingpai',       // 听牌
    'gameend_noting',        // 未听牌
    'gameend_sifenglianda',  // 四风连打
    'gameend_sigangliuju',   // 四杠流局
    'gameend_jiuzhongjiupai',// 九种九牌
];

/** 其他 */
const OTHER = [
    'game_top',             // 终局一位语音
];

/** 古役语音 */
const SC_FAN = [
    'extra/scfan_lingshangfangchong', // 岭上放铳
    'extra/scfan_gen',                // 根
    'extra/scfan_daiyaojiu',          // 带幺九
    'extra/scfan_jingoudiao',         // 金钩钓
    'extra/scfan_qingdui',            // 清对
    'extra/scfan_jiangdui',           // 将对
    'extra/scfan_longqidui',          // 龙七对
    'extra/scfan_qingqidui',          // 清七对
    'extra/scfan_qingyaojiu',         // 清幺九
    'extra/scfan_qingjindoudiao',     // 清金钩钓
    'extra/scfan_qinglongqidui',      // 清龙七对
    'extra/scfan_shibaluohan',        // 十八罗汉
    'extra/scfan_qingshibaluohan',    // 清十八罗汉
];

/** 所有语音文件列表（仅对局和结算相关） */
const ALL_FILES = [
    ...ACTIONS,
    ...INGAME,
    ...FAN,
    ...GAMEEND,
    ...OTHER,
];

/* ================================================================
 *  下载逻辑
 * ================================================================ */

function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;

        mod.get(url, (response) => {
            /* 处理重定向 */
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFile(response.headers.location, filePath).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${url}`));
                return;
            }

            const file = fs.createWriteStream(filePath);
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
            file.on('error', (err) => {
                fs.unlink(filePath, () => {});
                reject(err);
            });
        }).on('error', reject);
    });
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error('用法: node scripts/download_voice.js <角色目录名> [输出目录]');
        console.error('示例: node scripts/download_voice.js gongyongxiao');
        console.error('      node scripts/download_voice.js gongyongxiao ./resources/voice/gongyongxiao');
        process.exit(1);
    }

    const character = args[0];
    const outDir = args[1] || path.join('resources', 'voice', character);

    console.log(`角色: ${character}`);
    console.log(`输出: ${path.resolve(outDir)}`);
    console.log(`文件数: ${ALL_FILES.length}`);
    console.log('');

    let success = 0;
    let failed = 0;
    const failures = [];

    for (let i = 0; i < ALL_FILES.length; i++) {
        const file = ALL_FILES[i];
        const url = BASE_URL + character + '/' + file + '.mp3';
        const filePath = path.join(outDir, file + '.mp3');
        const display = `[${String(i + 1).padStart(3, '0')}/${ALL_FILES.length}]`;

        try {
            process.stdout.write(`${display} 下载中: ${file}.mp3 ...`);
            await downloadFile(url, filePath);
            process.stdout.write(' 完成\n');
            success++;
        } catch (err) {
            process.stdout.write(` 失败 (${err.message})\n`);
            failed++;
            failures.push(file);
        }
    }

    console.log('');
    console.log('='.repeat(50));
    console.log(`下载完成: ${success} 成功, ${failed} 失败`);
    if (failures.length > 0) {
        console.log('失败的文件:');
        failures.forEach(f => console.log(`  - ${f}.mp3`));
    }
}

main().catch(err => {
    console.error('脚本错误:', err);
    process.exit(1);
});
