import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('gateway caddyfile proxies asr routes through an env-configured upstream', () => {
    const caddyfile = fs.readFileSync(path.resolve('Caddyfile'), 'utf8');

    assert.match(caddyfile, /reverse_proxy \{\$CUT_SUITE_ASR_UPSTREAM:funasr-server:8000\}/);
    assert.doesNotMatch(caddyfile, /reverse_proxy asr:8000/);
});

test('gateway caddyfile proxies frontend routes through an env-configured upstream', () => {
    const caddyfile = fs.readFileSync(path.resolve('Caddyfile'), 'utf8');

    assert.match(caddyfile, /reverse_proxy \{\$CUT_SUITE_FRONTEND_UPSTREAM:video-cuter-full:8000\}/);
    assert.doesNotMatch(caddyfile, /reverse_proxy frontend:8000/);
});

test('production compose passes the configurable asr upstream into gateway', () => {
    const compose = fs.readFileSync(path.resolve('docker-compose.yml'), 'utf8');

    assert.match(compose, /^services:\n  funasr-server:/m);
    assert.match(compose, /^  video-cuter-full:/m);
    assert.match(compose, /^  video-cuter-suite-gateway:/m);
    assert.match(compose, /CUT_SUITE_ASR_UPSTREAM: \$\{CUT_SUITE_ASR_UPSTREAM:-funasr-server:8000\}/);
    assert.match(compose, /CUT_SUITE_FRONTEND_UPSTREAM: \$\{CUT_SUITE_FRONTEND_UPSTREAM:-video-cuter-full:8000\}/);
    assert.match(compose, /CW_AUTO_DOWNLOAD_MODEL: "0"/);
});

test('env example documents the configurable suite asr upstream', () => {
    const envExample = fs.readFileSync(path.resolve('.env.example'), 'utf8');

    assert.match(envExample, /CUT_SUITE_ASR_UPSTREAM=funasr-server:8000/);
    assert.match(envExample, /CUT_SUITE_FRONTEND_UPSTREAM=video-cuter-full:8000/);
});

test('compose override files keep using the explicit service names', () => {
    const devCompose = fs.readFileSync(path.resolve('docker-compose.dev.yml'), 'utf8');
    const localModelCompose = fs.readFileSync(path.resolve('docker-compose.local-model.yml'), 'utf8');

    assert.match(devCompose, /^services:\n  funasr-server:/m);
    assert.match(devCompose, /^  video-cuter-full:/m);
    assert.match(devCompose, /^  video-cuter-suite-gateway:/m);
    assert.match(localModelCompose, /^services:\n  funasr-server:/m);
});
