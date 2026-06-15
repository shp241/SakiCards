#!/usr/bin/env node
/*
 *  majiang-bot - 超能力麻将 AI Bot
 *
 *  基于 kobalab/majiang-server (https://github.com/kobalab/majiang-server)
 */
"use strict";
const { version } = require('../../../package.json');
const agent = 'majiang-bot/' + version.replace(/^(\d+\.\d+).*$/,'$1');
const io = require('socket.io-client');
const Player = require('../../ai');
const player = new Player();
let cookie;

function login(url, name, room) {
    fetch(url + '/auth/', {
        method:   'POST',
        headers:  { 'User-Agent': agent },
        body:     new URLSearchParams({ name: name, passwd: '*'}),
        redirect: 'manual'
    }).then(res=>{
        for (let c of (res.headers.get('Set-Cookie')||'').split(/,\s*/)) {
            if (! c.match(/^MAJIANG=/)) continue;
            cookie = c.replace(/^MAJIANG=/,'').replace(/; .*$/,'');
            init(url, room);
            break;
        }
        if (! cookie) console.log('ログインエラー:', url);
    }).catch(err=>{
        console.log('接続エラー:', url);
    });
}

function logout() {
    fetch(url + '/logout', {
        method:   'POST',
        headers:  { 'User-Agent': agent,
                    'Cookie':     `MAJIANG=${cookie}`},
    }).then(res=>{
        process.exit();
    });
}

function error(msg) {
    console.log('ERROR:', msg);
    logout();
}

function init(url, room) {
    const server = url.replace(/^(https?:\/\/[^\/]*)\/.*$/,'$1');
    const path   = url.replace(/^https?:\/\/[^\/]*/,'').replace(/\/$/,'');
    const sock = io(server, {
                        path: `${path}/socket.io/`,
                        extraHeaders: {
                            'User-Agent': agent,
                            Cookie: `MAJIANG=${cookie}`,
                        }
                    });
    if (argv.verbose) sock.onAny(console.log);
    sock.on('ERROR', error);
    sock.on('END',   logout);
    sock.on('ROOM',  ()=>{ sock.on('HELLO', logout)});
    sock.on('GAME',  (msg)=>{
        /* 角色选择消息 */
        if (msg.character_select) {
            /* AI 随机选择角色 */
            let options = msg.character_select.options || [];
            let choice = options.length > 0 ? Math.floor(Math.random() * options.length) : 0;
            sock.emit('CHARACTER', choice);
            return;
        }
        /* 技能提示消息：全部服务端 AI 自动决策，bot 只需确认回执 */
        if (msg.skill_prompt) {
            sock.emit('SKILL_REPLY', { promptId: msg.skill_prompt.promptId, choice: 0 });
            return;
        }
        if (msg.seq) {
            player.action(msg, (reply = {})=>{
                reply.seq = msg.seq;
                sock.emit('GAME', reply);
            });
        }
        else {
            player.action(msg);
        }
    });

    /* 处理角色确认消息 */
    sock.on('CHARACTER_CONFIRMED', (data)=>{
        /* Bot 不需要额外处理 */
    });

    process.on('SIGTERM', logout);
    process.on('SIGINT',  logout);
    sock.emit('ROOM', room);
}

const argv = require('yargs')
    .usage('Usage: $0 [ server-url ]')
    .option('name',     { alias: 'n', default: '*ボット*'})
    .option('room',     { alias: 'r', type: 'string', demandOption: true })
    .option('verbose',  { alias: 'v', boolean: true })
    .argv;

const url = (argv._[0] || 'http://127.0.0.1:4615/server').replace(/\/$/,'');
const room = argv.room || '-';
login(url, argv.name, room);
