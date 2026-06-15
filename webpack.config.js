const path = require('path');
const version = require('./package.json').version;

const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
    entry:  {
        majiang:   './src/js/majiang.js',
        index:     './src/js/index.js',
        autoplay:  './src/js/autoplay.js',
        netplay:   './src/js/netplay.js',
        rule:      './src/js/rule.js',
        paipu:     './src/js/paipu.js',
        paili:     './src/js/paili.js',
        hule:      './src/js/hule.js',
        drill:     './src/js/drill.js',
        dapai:     './src/js/dapai.js',
        paiga:     './src/js/paiga.js',
    },
    output: {
        path:     __dirname + '/dist/js/',
        filename: `[name]-${version}.js`
    },
    optimization: {
        minimizer: [ new TerserPlugin({extractComments: false}) ],
    },
    resolve: {
        alias: {
            '@kobalab/majiang-core':    path.resolve(__dirname, 'src/core/index.js'),
            '@kobalab/majiang-ai':      path.resolve(__dirname, 'src/ai/index.js'),
            '@kobalab/majiang-ui':      path.resolve(__dirname, 'src/ui/index.js'),
            '@kobalab/tenhou-url-log':  path.resolve(__dirname, 'src/tenhou-log/index.js'),
        }
    },
};
