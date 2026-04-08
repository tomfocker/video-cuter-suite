import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadModule } from './module-loader.mjs';

function createClassList() {
    const classes = new Set();
    return {
        add(...names) {
            names.forEach((name) => classes.add(name));
        },
        remove(...names) {
            names.forEach((name) => classes.delete(name));
        },
        contains(name) {
            return classes.has(name);
        }
    };
}

function createDocument() {
    const elements = new Map();

    return {
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, {
                    id,
                    innerHTML: '',
                    textContent: '',
                    scrollTop: 0,
                    scrollHeight: 0,
                    disabled: false,
                    classList: createClassList()
                });
            }
            return elements.get(id);
        }
    };
}

function createFfmpegRecorder(options = {}) {
    const execCalls = [];
    const writeCalls = [];
    let execIndex = 0;

    return {
        execCalls,
        writeCalls,
        api: {
            async createDir() {},
            async mount() {},
            async unmount() {},
            async deleteDir() {},
            async deleteFile() {},
            async writeFile(path, data) {
                writeCalls.push({
                    path,
                    data: typeof data === 'string' ? data : String(data)
                });
            },
            async readFile() {
                return new Uint8Array([1, 2, 3]);
            },
            async exec(args) {
                execCalls.push([...args]);
                if (typeof options.execResult === 'function') {
                    return options.execResult(args, execIndex++);
                }
                if (Array.isArray(options.execResults)) {
                    return options.execResults[execIndex++] ?? 0;
                }
                execIndex++;
                return 0;
            }
        }
    };
}

function createTestConsole() {
    return {
        ...console,
        error() {}
    };
}

test('merge export uses stream-copy extraction and concat copy', async () => {
    const document = createDocument();
    const ffmpeg = createFfmpegRecorder();
    const downloads = [];
    const appState = {
        ffmpeg: ffmpeg.api,
        videoFiles: [],
        currentVideoIndex: 0
    };

    const { executeSmartVideoExport } = loadModule(
        path.resolve('js/export.js'),
        {
            AppState: appState,
            downloadBlob(blob, filename) {
                downloads.push({ blob, filename });
            },
            audioBufferToWav() {},
            saveCurrentSegments() {},
            addRegionAtTime() {},
            switchToVideo() {},
            document,
            window: {},
            console: createTestConsole(),
            setTimeout
        },
        ['executeSmartVideoExport']
    );

    const sourceA = { name: 'a.mp4' };
    const sourceB = { name: 'b.mp4' };
    await executeSmartVideoExport(
        [
            { start: 1, end: 3, videoFile: sourceA },
            { start: 4, end: 7, videoFile: sourceB }
        ],
        [],
        true
    );

    assert.equal(downloads.length, 1);
    assert.equal(ffmpeg.execCalls.length, 3);

    const [firstExtract, secondExtract, finalMerge] = ffmpeg.execCalls;
    assert.ok(firstExtract.includes('-c:a'));
    assert.ok(firstExtract.includes('copy'));
    assert.equal(firstExtract[firstExtract.indexOf('-c:v') + 1], 'copy');
    assert.equal(secondExtract[secondExtract.indexOf('-c:v') + 1], 'copy');
    assert.ok(finalMerge.includes('-f'));
    assert.ok(finalMerge.includes('concat.ffconcat'));
    assert.equal(finalMerge[finalMerge.indexOf('-c') + 1], 'copy');
    assert.equal(ffmpeg.writeCalls[0]?.path, 'concat.ffconcat');
    assert.match(ffmpeg.writeCalls[0]?.data ?? '', /ffconcat version 1\.0/);
    assert.match(ffmpeg.writeCalls[0]?.data ?? '', /file 'temp_merge_0\.mp4'/);
    assert.match(ffmpeg.writeCalls[0]?.data ?? '', /duration 2\b/);
    assert.match(ffmpeg.writeCalls[0]?.data ?? '', /file 'temp_merge_1\.mp4'/);
    assert.match(ffmpeg.writeCalls[0]?.data ?? '', /duration 3\b/);
});

test('merge export fails fast when stream-copy concat fails', async () => {
    const document = createDocument();
    const ffmpeg = createFfmpegRecorder({ execResults: [0, 0, 1] });
    const downloads = [];
    const appState = {
        ffmpeg: ffmpeg.api,
        videoFiles: [],
        currentVideoIndex: 0
    };

    const { executeSmartVideoExport } = loadModule(
        path.resolve('js/export.js'),
        {
            AppState: appState,
            downloadBlob(blob, filename) {
                downloads.push({ blob, filename });
            },
            audioBufferToWav() {},
            saveCurrentSegments() {},
            addRegionAtTime() {},
            switchToVideo() {},
            document,
            window: {},
            console: createTestConsole(),
            setTimeout
        },
        ['executeSmartVideoExport']
    );

    const sourceFile = { name: 'demo.mp4' };
    await executeSmartVideoExport(
        [
            { start: 1.25, end: 3.5, videoFile: sourceFile },
            { start: 5, end: 8.75, videoFile: sourceFile }
        ],
        [],
        true
    );

    assert.equal(ffmpeg.execCalls.length, 3);
    assert.equal(downloads.length, 0);
    assert.equal(document.getElementById('tty').innerHTML.includes('视频合并失败'), true);
    assert.equal(ffmpeg.execCalls.some((command) => command.includes('-filter_complex')), false);
});

test('merge export does not probe duration or re-encode after successful concat copy', async () => {
    const document = createDocument();
    const ffmpeg = createFfmpegRecorder({ execResults: [0, 0, 0] });
    const downloads = [];
    const appState = {
        ffmpeg: ffmpeg.api,
        videoFiles: [],
        currentVideoIndex: 0
    };

    const { executeSmartVideoExport } = loadModule(
        path.resolve('js/export.js'),
        {
            AppState: appState,
            downloadBlob(blob, filename) {
                downloads.push({ blob, filename });
            },
            audioBufferToWav() {},
            saveCurrentSegments() {},
            addRegionAtTime() {},
            switchToVideo() {},
            document,
            window: {
                __probeVideoDuration: async () => {
                    throw new Error('duration probe should not be called');
                }
            },
            console: createTestConsole(),
            setTimeout
        },
        ['executeSmartVideoExport']
    );

    const sourceFile = { name: 'demo.mp4' };
    await executeSmartVideoExport(
        [
            { start: 1, end: 3, videoFile: sourceFile },
            { start: 4, end: 6, videoFile: sourceFile }
        ],
        [],
        true
    );

    assert.equal(ffmpeg.execCalls.length, 3);
    assert.equal(downloads.length, 1);
    assert.equal(ffmpeg.execCalls.some((command) => command.includes('-filter_complex')), false);
});
