import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('gateway caddyfile proxies asr routes through an env-configured upstream', () => {
    const caddyfile = fs.readFileSync(path.resolve('Caddyfile'), 'utf8');

    assert.match(caddyfile, /reverse_proxy \{\$CUT_SUITE_ASR_UPSTREAM:asr:8000\}/);
    assert.doesNotMatch(caddyfile, /reverse_proxy asr:8000/);
});

test('production compose passes the configurable asr upstream into gateway', () => {
    const compose = fs.readFileSync(path.resolve('docker-compose.yml'), 'utf8');

    assert.match(compose, /CUT_SUITE_ASR_UPSTREAM: \$\{CUT_SUITE_ASR_UPSTREAM:-asr:8000\}/);
});

test('env example documents the configurable suite asr upstream', () => {
    const envExample = fs.readFileSync(path.resolve('.env.example'), 'utf8');

    assert.match(envExample, /CUT_SUITE_ASR_UPSTREAM=asr:8000/);
});
