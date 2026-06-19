/*
 *  lobby - 超能力麻将联机大厅
 *
 *  基于 kobalab/majiang-server (https://github.com/kobalab/majiang-server)
 *  扩展支持超能力技能规则
 */
"use strict";
const { version } = require('../../../package.json');
const Game = require('./game');
const { spawn } = require('child_process');
const path = require('path');

function get_user(sock) {
    let session_id = sock.request.sessionID;
    let user       = sock.request.user;
    if (! user) return;
    user.uid = user.uid ?? session_id;
    return user;
}

function exptime(sock) {
    if (sock.request.user.uid.match(/@/)) return;
    return sock.request.session.cookie.expires;
}

const style
    = '<style>\n'
    + 'html { font-size: 14px; }\n'
    + 'body { -webkit-text-size-adjust: 100%; }\n'
    + 'ul { padding-left: 20px; }\n'
    + 'li.user { display: inline-block; width: 10em; white-space: nowrap;'
        + ' overflow: hidden; text-overflow: ellipsis; }\n'
    + 'img { width: 2em; vertical-align: middle; border-radius: 50%; }\n'
    + '.offline { opacity: 0.5; }\n'
    + '.version { text-align: right; margin-top: -3em; }\n'
    + 'pre { font-size: 100%; }\n'
    + '</style>\n';

function print_user(USER) {
    return function(uid) {
        let icon  = USER[uid].user.icon || '../img/icon.png';
        let name  = USER[uid].user.name;
        let title = USER[uid].user.icon ? uid : '';
        return (USER[uid].sock ? '<span>' : '<span class="offline">')
            + `<img src="${icon}" title="${title}"> ${name}</span>`;
    }
}

function print_room(USER, ROOM) {
    function jushu(model) {
        return ['東','南','西','北'][model.zhuangfeng]
             + ['一','二','三','四'][model.jushu] + '局';
    }
    const user = print_user(USER);
    return function(room_no) {
        if (room_no) {
            return `ルーム: ${room_no}`
                    + (ROOM[room_no].game ?
                            `【${jushu(ROOM[room_no].game._model)}】` : '')
                + '\n<ul>'
                + ROOM[room_no].uids
                    .map(uid => `<li class="user">${user(uid)}</li>`)
                    .join('\n')
                + '</ul>\n';
        }
        else {
            return '(接続中)\n<ul>'
                + Object.keys(USER).filter(uid => ! USER[uid].room_no)
                    .map(uid => `<li class="user">${user(uid)}</li>`)
                    .join('\n')
                + '</ul>\n';
        }
    }
}

class Lobby {
    constructor(io, port) {
        this.USER = {};
        this.ROOM = {};
        this._start_date = new Date();
        this._port = port || 4615;
        io.on('connection', (sock)=> this.connect(sock));
    }

    connect(sock) {
        let user = get_user(sock);
        sock.emit('HELLO', user);
        if (! user) {
            sock.disconnect(true);
            return;
        }
        if (! this.USER[user.uid]) {
            this.USER[user.uid] = { user: user, sock: sock };
        }
        else if (this.USER[user.uid].sock) {
            let oldSock = this.USER[user.uid].sock;
            if (oldSock.connected) {
                /* 重连竞态：旧 socket 的心跳超时尚未触发（pingTimeout=15s），
                 * 但客户端已经发起重连。此时应接受新连接并断开旧 socket，
                 * 因为旧 socket 的传输层实际上已经死了，继续等待 ping 超时
                 * 只会浪费宝贵的重连窗口。 */
                console.log(`[重连] ${user.name} 使用新 socket 重连，断开旧 socket`);
                oldSock.removeAllListeners();
                oldSock.disconnect(true);
            }
            /* 替换为新 socket */
            this.USER[user.uid].sock = sock;
        }
        else {
            this.USER[user.uid].sock = sock;
        }
        /* 重连到已有房间 */
        {
            let room_no = this.USER[user.uid].room_no;
            if (room_no && this.ROOM[room_no] && this.ROOM[room_no].game) {
                this.ROOM[room_no].game.connect(sock);
            }
            else if (room_no && this.ROOM[room_no]) {
                delete this.ROOM[room_no].exptime;
                this.send_room_info(room_no);
            }
        }
        sock.on('disconnect', (reason)=> this.disconnect(sock, reason));
        sock.on('ROOM', (room_no, uid)=> this.room(sock, room_no, uid));
        sock.on('START', (room_no, rule, timer)=>
                                this.start(sock, room_no, rule, timer));
        sock.on('BOT', (room_no)=> this.spawnBot(sock, room_no));
        sock.on('LEAVE_GAME', ()=> this.leave_game(sock));
        this.status_log();
    }

    disconnect(sock, reason) {
        let user = get_user(sock);
        /* 防止旧 socket 的延迟断线覆盖新连接 */
        if (this.USER[user.uid]?.sock !== sock) return;
        let room_no = this.USER[user.uid]?.room_no;
        let in_game = room_no && this.ROOM[room_no]?.game;
        console.log(`[断线] ${new Date().toLocaleString()} | ` +
                    `${user?.name || '?'} (${user?.uid || '?'})` +
                    (room_no ? ` 房间:${room_no}` : '') +
                    (in_game ? ' [対局中]' : '') +
                    ` 原因:${reason}`);
        delete this.USER[user.uid].sock;
        if (room_no) {
            if (this.ROOM[room_no].game) {
                this.ROOM[room_no].game.disconnect(sock, reason);
            }
            else {
                if (this.ROOM[room_no].uids[0] == user.uid) {
                    this.ROOM[room_no].exptime = exptime(sock);
                }
                else {
                    this.ROOM[room_no].uids = this.ROOM[room_no].uids
                                            .filter(uid => uid != user.uid);
                    delete this.USER[user.uid];
                }
                this.send_room_info(room_no);
            }
        }
        else {
            delete this.USER[user.uid];
        }
        this.status_log();
    }

    room(sock, room_no, uid) {
        if (! room_no)  this.create_room(sock);
        else if (! uid) this.enter_room(sock, room_no);
        else            this.leave_room(sock, room_no, uid);
    }

    create_room(sock) {
        let user = get_user(sock);
        if (this.USER[user.uid].room_no) return;
        this.cleanup_room();
        let room_no;
        const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ', NUM = 10000;
        do {
            let n = (Math.random() * CODE.length * NUM) | 0;
            room_no = CODE[(n / NUM) | 0] + ('' + NUM + (n % NUM)).slice(-4);
        } while(this.ROOM[room_no]);
        this.ROOM[room_no] = { uids: [ user.uid ] };
        this.USER[user.uid].room_no = room_no;
        this.send_room_info(room_no);
        this.status_log();
    }

    enter_room(sock, room_no) {
        let user = get_user(sock);
        if (this.USER[user.uid].room_no) return;
        if (! this.ROOM[room_no]) {
            sock.emit('ERROR', `ルーム ${room_no} は存在しません`);
        }
        else if (this.ROOM[room_no].game) {
            sock.emit('ERROR', '既に対局中です');
        }
        else if (this.ROOM[room_no].uids.length >= 4) {
            sock.emit('ERROR', '満室です');
        }
        else {
            this.ROOM[room_no].uids.push(user.uid);
            this.USER[user.uid].room_no = room_no;
            this.send_room_info(room_no);
            this.status_log();
        }
    }

    leave_room(sock, room_no, uid) {
        let user = get_user(sock);
        if (! this.USER[uid] || ! this.ROOM[room_no]) return;
        if (this.USER[uid].room_no != room_no) return;
        if (this.ROOM[room_no].game) return;
        if (uid == user.uid && this.ROOM[room_no].uids[0] == user.uid) {
            for (let uid of this.ROOM[room_no].uids) {
                delete this.USER[uid].room_no;
                this.USER[uid].sock.emit('HELLO', this.USER[uid].user);
            }
            delete this.ROOM[room_no];
        }
        else if (uid == user.uid || this.ROOM[room_no].uids[0] == user.uid) {
            this.ROOM[room_no].uids
                    = this.ROOM[room_no].uids.filter(u => u != uid);
            delete this.USER[uid].room_no;
            this.USER[uid].sock.emit('HELLO', this.USER[uid].user);
            this.send_room_info(room_no);
        }
        this.status_log();
    }

    leave_game(sock) {
        let user = get_user(sock);
        if (!user) return;
        let room_no = this.USER[user.uid] && this.USER[user.uid].room_no;
        if (!room_no || !this.ROOM[room_no]) return;
        if (!this.ROOM[room_no].game) return;

        /* 先保存剩余玩家列表，因为 game.stop() 可能回调删除房间 */
        let remaining_uids = this.ROOM[room_no].uids
                                .filter(u => u != user.uid);

        /* 从房间中移除该玩家 */
        this.ROOM[room_no].uids = remaining_uids;
        delete this.USER[user.uid].room_no;

        /* 从对局中移除玩家（主动离开无需宽限期，只剩机器人则立即终止） */
        this.ROOM[room_no].game.disconnect(sock, 'leave_game');

        /* 通知离开者回到大厅 */
        sock.emit('HELLO', this.USER[user.uid].user);
        /* 如果对局未终止，通知房间内剩余玩家 */
        if (this.ROOM[room_no]) {
            this.send_room_info(room_no);
        }

        this.status_log();
    }

    send_room_info(room_no) {
        for (let uid of this.ROOM[room_no].uids) {
            let sock = this.USER[uid].sock;
            if (! sock) continue;
            sock.emit('ROOM', {
                room_no: room_no,
                user:    this.ROOM[room_no].uids.map(uid =>
                            Object.assign({}, this.USER[uid].user,
                                        { offline: ! this.USER[uid].sock }))
            });
        }
    }

    cleanup_room() {
        for (let room_no of Object.keys(this.ROOM)) {
            let exptime = this.ROOM[room_no].exptime;
            if (exptime && exptime < new Date()) {
                for (let uid of this.ROOM[room_no].uids) {
                    delete this.USER[uid].room_no;
                    if (! this.USER[uid].sock) delete this.USER[uid];
                }
                delete this.ROOM[room_no];
            }
        }
    }

    get_socks(room_no) {
        let uids = [];
        for (let i = 0; i < 4; i++) {
            uids[i] = this.ROOM[room_no].uids[i];
        }
        let socks = [];
        while (socks.length < 4) {
            let uid = uids.splice(Math.random()*uids.length, 1)[0];
            socks.push(uid ? this.USER[uid].sock : null);
        }
        return socks;
    }

    start(sock, room_no, rule, timer) {
        let user = get_user(sock);
        if (! this.ROOM[room_no]) return;
        if (user.uid != this.ROOM[room_no].uids[0]) return;
        if (this.ROOM[room_no].game) return;

        /* 合并技能规则默认值 */
        const { mergeRule } = require('../../skill/game-settings');
        rule = mergeRule(rule || {});

        const callback = (paipu)=>{
            for (let uid of this.ROOM[room_no].uids) {
                if (! this.USER[uid].sock) delete this.USER[uid];
                else                       delete this.USER[uid].room_no;
            }
            delete this.ROOM[room_no];
            this.status_log();
        };

        let socks = this.get_socks(room_no);
        this.ROOM[room_no].game = new Game(socks, callback,
                                            rule, null, timer);
        this.ROOM[room_no].game.speed = 2;

        /* 超能力模式：处理角色选择前后顺序 */
        if (rule['技能模式'] !== '关闭') {
            this.ROOM[room_no].game.kaiju();
            /* 角色选择会暂停在 kaiju 之后，等待客户端选择 */
            let needSelect = this.ROOM[room_no].game._startCharacterSelect();
            if (! needSelect) {
                /* 无需选择（RANDOM 模式）：直接继续 */
                this.ROOM[room_no].game.delay(()=>{
                    this.ROOM[room_no].game.qipai();
                }, 0);
            }
            /* 否则角色选择完成后由 _finalizeCharacterSelect 继续 qipai */

            /* 注册每局角色重选回调（后续每局 qipai 后、zimo 前触发） */
            this.ROOM[room_no].game.onHandStart(() => {
                let game = this.ROOM[room_no].game;
                if (!game) return;
                let needSelect = game.startPerRoundCharacterSelect();
                if (! needSelect) {
                    /* RANDOM 模式：已自动分配，继续游戏 */
                    game.resumeFromCharacterSelect();
                }
                /* 否则角色选择完成后由 _finalizeCharacterSelect 调用 resumeFromCharacterSelect */
            });
        }
        else {
            /* 标准模式：直接开始 */
            this.ROOM[room_no].game.kaiju();
        }

        this.status_log();
    }

    /**
     * 房主添加 AI 机器人
     */
    spawnBot(sock, room_no) {
        let user = get_user(sock);
        if (! user) return;
        if (! this.ROOM[room_no]) return;
        /* 只有房主才能添加机器人 */
        if (user.uid != this.ROOM[room_no].uids[0]) return;
        if (this.ROOM[room_no].game) return;
        /* 房间已满 */
        if (this.ROOM[room_no].uids.length >= 4) return;

        /* 生成机器人名称 */
        let botIndex = 1;
        let existingNames = this.ROOM[room_no].uids
            .map(uid => this.USER[uid]?.user?.name || '');
        while (existingNames.some(n => n === `机器人${botIndex}`)) {
            botIndex++;
        }
        let botName = `机器人${botIndex}`;

        /* 启动机器人进程 */
        let botScript = path.join(__dirname, '..', 'bin', 'client.js');
        let serverUrl = `http://127.0.0.1:${this._port}/server`;
        let child = spawn('node', [botScript, '-r', room_no, '-n', botName, serverUrl], {
            stdio: 'ignore',
            detached: false,
        });

        child.on('error', (err) => {
            console.log(`机器人 ${botName} 启动失败:`, err.message);
        });

        /* 延迟更新房间信息，等机器人完成登录和入室 */
        setTimeout(() => {
            if (this.ROOM[room_no] && !this.ROOM[room_no].game) {
                this.send_room_info(room_no);
                this.status_log();
            }
        }, 1500);
    }

    short_status() {
        let conn, room, game;
        try {
            conn = Object.keys(this.USER)
                            .filter(uid => this.USER[uid].sock).length;
            room = 0, game = 0;
            for (let room_no of Object.keys(this.ROOM)) {
                if (this.ROOM[room_no].game)
                    game += this.ROOM[room_no].uids
                                .filter(uid => this.USER[uid].sock).length;
                else
                    room += this.ROOM[room_no].uids
                                .filter(uid => this.USER[uid].sock).length;
            }
        }
        catch(e) {
            console.error(e.stack);
            console.error(this.dump());
        }
        return `接続: ${conn} / 待機: ${room} / 対局: ${game}`;
    }

    status_log() {
        console.log('**', this.short_status());
    }

    status(refresh, all, debug) {
        function datestr(date) {
            return date.toLocaleString('sv');
        }
        function timestr(time) {
            let day  = (time / (24*60*60*1000))|0;
            time = new Date(time).toLocaleTimeString('sv', { timeZone: 'UTC'});
            return day == 0 ? `${time}`
                 : day <  7 ? `${day}日 ${time}`
                 :            `${day}日`;
        }
        const title = 'majiang-server status';
        const room = print_room(this.USER, this.ROOM);
        let html = `<title>${title}</title>\n`
                 + '<meta name="viewport" content="width=device-width,'
                    + ' initial-scale=1">\n'
                 + style;
        if (refresh)
            html += `<meta http-equiv="refresh" content="${refresh}">\n`;
        html += `<h1>${title}</h1>\n`;
        html += `<div class="version">ver.${version}</div>\n`;
        let now = new Date();
        html += `<p>現在: ${datestr(now)} / `
                + `起動: ${datestr(this._start_date)} / `
                + `稼働: ${timestr(now - this._start_date)}</p>\n`;
        if (debug != null) return html + `<pre>${this.dump()}</pre>`;
        html += `<ul><li>${this.short_status()}</li></ul>\n`;
        html += '<ul>\n';
        for (let room_no of Object.keys(this.ROOM)
                                    .filter(r => this.ROOM[r].game))
        {
            html += `<li>${room(room_no)}</li>\n`;
        }
        for (let room_no of Object.keys(this.ROOM)
                                    .filter(r => ! this.ROOM[r].game))
        {
            if (all != null || this.ROOM[room_no].uids
                                .filter(uid => this.USER[uid].sock).length)
            {
                html += `<li>${room(room_no)}</li>\n`;
            }
        }
        html += `<li>${room()}</li>\n`;
        html += '</ul>\n';
        return html;
    }

    dump() {
        let dump = '== ROOM ==\n';
        for (let room_no of Object.keys(this.ROOM)) {
            dump += (this.ROOM[room_no].game ? ' * ' : ' - ') + room_no
                  + ` [ ${this.ROOM[room_no].uids.map(uid=>uid.slice(-12))
                            .join(', ')} ] `
                  + (this.ROOM[room_no].exptime
                        ? this.ROOM[room_no].exptime.toLocaleString('sv')
                        : '')
                  + '\n';
        }
        dump += '-- USER --\n';
        for (let uid of Object.keys(this.USER)) {
            dump += (this.USER[uid].sock ? ' * ' : ' - ') + uid.slice(-12)
                  + ` ${this.USER[uid].user.name}`
                  + ` ${this.USER[uid].room_no || ''}\n`;
        }
        return dump;
    }
}

module.exports = (io, port)=> new Lobby(io, port);
