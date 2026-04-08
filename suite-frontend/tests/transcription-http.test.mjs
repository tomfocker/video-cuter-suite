import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './module-loader.mjs';

function createLocalStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        }
    };
}

test('suite frontend prefers same-origin ASR endpoint from runtime config', () => {
    const localStorage = createLocalStorage();
    const { AppState } = loadModule(
        path.resolve('js/state.js'),
        {
            localStorage,
            window: {
                __CUT_CONFIG__: {
                    serverApiUrl: '/api/asr'
                }
            }
        },
        ['AppState']
    );

    assert.equal(AppState.serverApiUrl, '/api/asr');
});

test('suite frontend renders ASR, subtitle, and selection controls', () => {
    const html = fs.readFileSync(path.resolve('index.html'), 'utf8');

    assert.match(html, /id="transcribeBtn"/);
    assert.match(html, /id="transcriptionPanel"/);
    assert.match(html, /id="serverSettingsModal"/);
    assert.match(html, /id="downloadSrtBtn"/);
    assert.match(html, /id="llmSettingsModal"/);
    assert.match(html, /语音转文字/);
    assert.match(html, /确认添加选区/);
});

test('suite frontend ships ASR-specific modules', () => {
    assert.equal(fs.existsSync(path.resolve('js/websocket.js')), true);
    assert.equal(fs.existsSync(path.resolve('js/transcription.js')), true);
    assert.equal(fs.existsSync(path.resolve('js/llm.js')), true);
});

test('normalizeTranscriptionResult adapts backend verbose_json payload for suite frontend', () => {
    const { normalizeTranscriptionResult } = loadModule(
        path.resolve('js/websocket.js'),
        {
            AppState: {},
            renderTranscriptionText() {},
            escapeHTML(value) {
                return value;
            },
            document: { getElementById() { return null; } },
            window: {},
            console,
            setTimeout,
            clearTimeout,
            Blob,
            FormData,
            fetch() {
                throw new Error('not implemented');
            }
        },
        ['normalizeTranscriptionResult']
    );

    const result = normalizeTranscriptionResult({
        text: '你好，世界今天测试字幕下载功能。',
        segments: [
            { id: 0, start: 0, end: 0.1, text: '你' },
            { id: 1, start: 0.06, end: 0.21, text: '好' }
        ],
        subtitle_segments: [
            { id: 0, start: 0, end: 0.285, text: '你好' },
            { id: 1, start: 0.36, end: 3.67, text: '世界今天测试字幕下载功能' }
        ],
        srt: '1\n00:00:00,000 --> 00:00:00,285\n你好\n'
    });

    assert.equal(result.text, '你好，世界今天测试字幕下载功能。');
    assert.equal(result.segments.length, 2);
    assert.equal(result.subtitleSegments.length, 2);
    assert.equal(result.displayChunks.length, 2);
    assert.deepEqual(result.displayChunks[0].timestamp, [0, 0.285]);
    assert.equal(result.displayChunks[1].text, '世界今天测试字幕下载功能');
    assert.equal(result.srt.includes('00:00:00,285'), true);
});

test('resolveSrtContent prefers backend srt before local fallback generation', () => {
    const { resolveSrtContent } = loadModule(
        path.resolve('js/utils.js'),
        {
            Blob,
            URL,
            document: {
                createElement() {
                    return {
                        click() {},
                        remove() {}
                    };
                },
                body: {
                    appendChild() {},
                    removeChild() {}
                }
            }
        },
        ['resolveSrtContent']
    );

    const backendSrt = '1\n00:00:00,000 --> 00:00:01,000\n你好\n';
    assert.equal(
        resolveSrtContent({
            srt: backendSrt,
            displayChunks: [
                { text: '不该走到这里', timestamp: [0, 1] }
            ]
        }),
        backendSrt
    );
});

test('mergeSelections combines adjacent text selections into one clip region', () => {
    const { mergeSelections } = loadModule(
        path.resolve('js/transcription.js'),
        {
            AppState: {},
            highlightRegionAtTime() {},
            clearHighlightRegion() {},
            addRegionAtTime() {},
            setWaveformCallbacks() {},
            renderAllSegments() {},
            clearAllSegments() {},
            escapeHTML(value) {
                return value;
            },
            document: { getElementById() { return null; }, querySelectorAll() { return []; } },
            window: {},
            console,
            setTimeout
        },
        ['mergeSelections']
    );

    const merged = mergeSelections([
        { start: 0.1, end: 0.5, startIdx: 0, endIdx: 1, text: '你好' },
        { start: 0.5, end: 0.9, startIdx: 2, endIdx: 3, text: '世界' },
        { start: 1.2, end: 1.8, startIdx: 5, endIdx: 6, text: '测试' }
    ]);

    assert.equal(merged.length, 2);
    assert.deepEqual(merged[0], {
        start: 0.1,
        end: 0.9,
        startIdx: 0,
        endIdx: 3,
        text: '你好世界'
    });
    assert.deepEqual(merged[1], {
        start: 1.2,
        end: 1.8,
        startIdx: 5,
        endIdx: 6,
        text: '测试'
    });
});
