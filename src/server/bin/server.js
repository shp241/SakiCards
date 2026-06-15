#!/usr/bin/env node
/*
 *  majiang-server - 超能力麻将联机服务器
 *
 *  基于 kobalab/majiang-server (https://github.com/kobalab/majiang-server)
 *  扩展支持超能力技能系统、角色语音、BGM
 */
"use strict";
const fs    = require('fs');
const path  = require('path');

const yargs = require('yargs');
const argv = yargs
    .usage('Usage: $0 [ options... ]')
    .option('port',     { alias: 'p', default: 4615 })
    .option('baseurl',  { alias: 'b', default: '/server'})
    .option('callback', { alias: 'c', default: '/' })
    .option('docroot',  { alias: 'd' })
    .option('oauth',    { alias: 'o' })
    .option('store',    { alias: 's' })
    .option('status',   { alias: 'S', boolean: true })
    .argv;
const port = argv.port;
const base = ('' + argv.baseurl)
                    .replace(/^(?!\/.*)/, '/$&')
                    .replace(/\/$/,'');
const back = argv.callback;
const auth = argv.oauth && path.resolve(argv.oauth);
const docs = argv.docroot && path.resolve(argv.docroot);
const stat = argv.status;

const express  = require('express');
const store    = ! argv.store ? null
               : new (require('session-file-store')(
                            require('express-session')))(
                            { path:  path.resolve(argv.store),
                              logFn: ()=>{} });
const session  = require('express-session')({
                            name:   'MAJIANG',
                            secret: 'keyboard cat',
                            resave: false,
                            saveUninitialized: false,
                            store:  store,
                            rolling: true,
                            cookie: {
                                maxAge:  1000*60*60*24*14,
                                httpOnly: true,
                                sameSite: 'lax'
                            } });
const passport = require('../lib/passport')(auth);

const app  = express();

app.use(session);
app.use(passport.initialize());
app.use(passport.session());

const http = require('http').createServer(app);
const io   = require('socket.io')(http, {
    path: `${base}/socket.io/`,
    cors: { origin: '*' },
    pingInterval: 25000,     /* 25 秒一次心跳，避免后台标签页被浏览器限频时误判 */
    pingTimeout:  60000,     /* 60 秒无 pong 才视为断开，容忍浏览器后台限频 */
    connectTimeout: 10000
});

/* Socket.IO 共享 Express session 中间件 — 否则 sock.request 拿不到 session */
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(session));
io.use(wrap(passport.initialize()));
io.use(wrap(passport.session()));

const lobby = require('../lib/lobby')(io, port);
app.use(express.urlencoded({ limit: '4mb', extended: false }));
app.post(`${base}/auth/`, (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.redirect(302, back);
        req.logIn(user, (err) => {
            if (err) return next(err);
            /* 重定向回来源页面（而非固定 /），方便联机测试 */
            let redirect = (req.get('Referer') || '').replace(/\?.*/, '') || back;
            return res.redirect(302, redirect);
        });
    })(req, res, next);
});
if (auth && fs.existsSync(path.join(auth, 'hatena.json'))) {
    app.post(`${base}/auth/hatena`, passport.authenticate('hatena',
                                            { scope: ['read_public'] }));
    app.get(`${base}/auth/hatena`, passport.authenticate('hatena',
                                            { successRedirect: back }));
}
if (auth && fs.existsSync(path.join(auth, 'google.json'))) {
    app.post(`${base}/auth/google`, passport.authenticate('google',
                                            { scope: ['profile'] }));
    app.get(`${base}/auth/google`,  (req, res, next)=>{
        if (req.query.error) res.redirect(302, back);
        else                 next();
    },
                                    passport.authenticate('google',
                                            { successRedirect: back }));
}
app.post(`${base}/logout`, (req, res)=>{
    req.session.destroy();
    res.clearCookie('MAJIANG');
    res.redirect(302, back);
});
if (stat) {
    app.get(`${base}/status`, (req, res)=>
        res.send(lobby.status(req.query.refresh, req.query.all,
                           req.query.debug)));
}
if (docs) app.use(express.static(docs));
app.use((req, res)=>res.status(404).send('<h1>Not Found</h1>'));

http.listen(port, ()=>{
    console.log(`超能力麻将服务器启动: http://127.0.0.1:${port}${base}/`);
}).on('error', (e)=>{
    console.log('' + e);
    process.exit(-1);
});
