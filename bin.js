#!/usr/bin/env node
require('ts-node').register({
    p: __dirname + '/ts-config.json',
    fast: true
});
require('./index.ts');