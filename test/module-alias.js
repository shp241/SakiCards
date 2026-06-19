/**
 * Node.js --require 预加载脚本
 *
 * 将 @kobalab/majiang-core 和 @kobalab/majiang-ai
 * 重定向到本地 src/core 和 src/ai，确保子进程中的
 * 服务端代码与客户端测试代码使用同一份核心/ AI 源码。
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
    if (aliases[request]) {
        return aliases[request];
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
};
