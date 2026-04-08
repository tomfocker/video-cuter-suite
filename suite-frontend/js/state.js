function resolveDefaultServerApiUrl() {
    const hasWindow = typeof window !== 'undefined';
    const configured = hasWindow ? window.__CUT_CONFIG__?.serverApiUrl : undefined;
    if (configured !== undefined) {
        return configured;
    }

    const saved = localStorage.getItem('serverApiUrl');
    if (saved) return saved;

    return '/api/asr';
}

export const AppState = {
    lastProgressLog: 0,
    pendingSelections: [],
    excludeSelections: [],
    transcriptionResult: null,
    currentSelectionRange: null,
    selectionMode: 'keep',
    bilingualSrtContent: null,
    pendingPreviewRegion: null,
    isPreviewMode: false,
    isResetState: false,
    videoFiles: [],
    currentVideoIndex: -1,
    wavesurfer: null,
    wsRegions: null,
    allSegments: [],
    ffmpeg: null,
    transcriptionResults: {},
    highlightRegion: null,
    currentZoom: 1,
    deletionMap: new Set(),
    savedWorkspaceData: null,
    serverReady: false,
    serverInfo: null,
    
    serverApiUrl: resolveDefaultServerApiUrl(),
    llmConfig: {
        apiUrl: localStorage.getItem('llmApiUrl') || 'https://api.openai.com/v1',
        apiKey: localStorage.getItem('llmApiKey') || '',
        model: localStorage.getItem('llmModel') || 'gpt-4o-mini',
        targetLang: localStorage.getItem('llmTargetLang') || '中文'
    }
};

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 20;
export const DB_NAME = 'VideoEditorDB';
export const DB_VERSION = 1;

export let db = null;
export const setDb = (newDb) => { db = newDb; };

export let ws = null;
export const setWs = (newWs) => { ws = newWs; };
