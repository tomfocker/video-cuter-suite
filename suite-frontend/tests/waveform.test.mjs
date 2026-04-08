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

function createElement() {
    return {
        innerHTML: '',
        textContent: '',
        disabled: false,
        classList: createClassList()
    };
}

function createDocument() {
    const elements = new Map();

    return {
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, createElement());
            }
            return elements.get(id);
        }
    };
}

function createWaveformModule(overrides = {}, exports = ['renderAllSegments']) {
    return loadModule(
        path.resolve('js/waveform.js'),
        {
            AppState: {},
            MIN_ZOOM: 0.5,
            MAX_ZOOM: 20,
            escapeHTML(value) {
                return value;
            },
            formatTime(value) {
                return `t:${value.toFixed(3)}`;
            },
            document: createDocument(),
            window: {},
            lucide: { createIcons() {} },
            console,
            setTimeout,
            ...overrides
        },
        exports
    );
}

test('segment list renders compact summary cards with all actions', () => {
    const document = createDocument();
    const appState = {
        currentVideoIndex: 0,
        videoFiles: [
            {
                name: 'first.mp4',
                file: { name: 'first.mp4' },
                objectURL: 'blob:first',
                segments: [{ id: 'seg-1', start: 3, end: 5.5 }]
            }
        ],
        allSegments: [],
        wsRegions: {
            getRegions() {
                return [
                    {
                        id: 'seg-1',
                        start: 3,
                        end: 5.5,
                        options: { color: 'rgba(99, 102, 241, 0.4)' }
                    }
                ];
            }
        }
    };

    const { renderAllSegments } = createWaveformModule(
        {
            AppState: appState,
            document
        },
        ['renderAllSegments']
    );

    renderAllSegments();

    const html = document.getElementById('segmentsListContainer').innerHTML;
    assert.match(html, /clip-summary/);
    assert.match(html, /预览/);
    assert.match(html, /暂停/);
    assert.match(html, /音频/);
    assert.match(html, /视频/);
    assert.match(html, /删除/);
    assert.doesNotMatch(html, /导出时长/);
});

test('snapRegionBounds moves a resized left edge to the previous segment end', () => {
    const { snapRegionBounds } = createWaveformModule({}, ['snapRegionBounds']);

    const result = snapRegionBounds(
        { start: 4, end: 7 },
        [
            { id: 'prev', start: 1, end: 5 },
            { id: 'next', start: 8, end: 10 }
        ],
        { mode: 'resize-start', minDuration: 0.1 }
    );

    assert.equal(result.start, 5);
    assert.equal(result.end, 7);
});

test('snapRegionBounds preserves duration when moving into the next segment', () => {
    const { snapRegionBounds } = createWaveformModule({}, ['snapRegionBounds']);

    const result = snapRegionBounds(
        { start: 4.8, end: 6.8 },
        [
            { id: 'prev', start: 1, end: 4 },
            { id: 'next', start: 6, end: 10 }
        ],
        { mode: 'move', minDuration: 0.1, originalDuration: 2, originalStart: 2, originalEnd: 4 }
    );

    assert.equal(result.end, 6);
    assert.equal(result.start, 4);
});

test('snapRegionBounds preserves duration when moving into the previous segment', () => {
    const { snapRegionBounds } = createWaveformModule({}, ['snapRegionBounds']);

    const result = snapRegionBounds(
        { start: 2.8, end: 4.8 },
        [
            { id: 'prev', start: 1, end: 3 }
        ],
        {
            mode: 'move',
            minDuration: 0.1,
            originalDuration: 2,
            originalStart: 4,
            originalEnd: 6
        }
    );

    assert.equal(result.start, 3);
    assert.equal(result.end, 5);
});

test('saveCurrentSegments keeps overlapping regions instead of collapsing one away', () => {
    const appState = {
        currentVideoIndex: 0,
        videoFiles: [{ segments: [] }],
        wsRegions: {
            getRegions() {
                return [
                    { id: 'seg-1', start: 1, end: 4, options: { color: 'a' } },
                    { id: 'seg-2', start: 3.5, end: 6, options: { color: 'b' } }
                ];
            }
        }
    };

    const { saveCurrentSegments } = createWaveformModule(
        {
            AppState: appState
        },
        ['saveCurrentSegments']
    );

    saveCurrentSegments();

    assert.equal(appState.videoFiles[0].segments.length, 2);
    assert.deepEqual(
        appState.videoFiles[0].segments.map((segment) => segment.id),
        ['seg-1', 'seg-2']
    );
});

test('resolveRegionUpdateBounds falls back to move logic when resize inference would still overlap', () => {
    const { resolveRegionUpdateBounds } = createWaveformModule({}, ['resolveRegionUpdateBounds']);

    const result = resolveRegionUpdateBounds(
        { start: 4.2, end: 6.2 },
        [
            { id: 'next', start: 5, end: 8 }
        ],
        {
            mode: 'resize-start',
            minDuration: 0.1,
            originalDuration: 2,
            originalStart: 1,
            originalEnd: 3
        }
    );

    assert.equal(result.start, 3);
    assert.equal(result.end, 5);
});

test('commitResolvedBounds applies corrected bounds immediately', () => {
    const { commitResolvedBounds } = createWaveformModule({}, ['commitResolvedBounds']);
    const applied = [];
    const region = {
        start: 4.2,
        end: 6.2,
        setOptions(bounds) {
            applied.push(bounds);
            this.start = bounds.start;
            this.end = bounds.end;
        }
    };

    const resolved = commitResolvedBounds(region, { start: 3, end: 5 });
    assert.deepEqual(resolved, { start: 3, end: 5 });
    assert.deepEqual(applied, [{ start: 3, end: 5 }]);
    assert.equal(region.start, 3);
    assert.equal(region.end, 5);
});
