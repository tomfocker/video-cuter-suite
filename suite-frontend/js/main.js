import { AppState } from './state.js';
import { initDB } from './database.js';
import { downloadSrt, downloadBilingualSrt } from './utils.js';
import { setSwitchToVideoCallback, resetZoom } from './waveform.js';
import { updateTranscriptionHighlight, renderTranscriptionText, initTranscriptionCallbacks, setSelectionMode, clearPendingSelections, confirmPendingSelections, resetTranscriptionState } from './transcription.js';
import { switchToVideo, renderVideoList, handleFileSelect, clearAllSegments, resetWorkspace } from './video.js';
import { updateTranscribeStatus, connectToServer, transcribeVideo, renderServerHelp } from './websocket.js';
import { callLLM, removeFillerWords, translateToBilingual } from './llm.js';
import { processAudioExport, processMergeAudioExport, executeSmartVideoExport } from './export.js';

initTranscriptionCallbacks();
setSwitchToVideoCallback(switchToVideo);

function saveCurrentWorkspace() {
    if (AppState.currentVideoIndex === -1 || AppState.videoFiles.length === 0) return;
    const currentVideo = AppState.videoFiles[AppState.currentVideoIndex];
    if (!currentVideo) return;
    
    const workspaceData = {
        videoFiles: AppState.videoFiles.map(v => ({
            name: v.name,
            segments: v.segments || []
        })),
        currentVideoIndex: AppState.currentVideoIndex,
        savedAt: Date.now()
    };
    
    localStorage.setItem('videoCutterWorkspace', JSON.stringify(workspaceData));
    AppState.savedWorkspaceData = workspaceData;
}

function restoreWorkspace() {
    const saved = localStorage.getItem('videoCutterWorkspace');
    if (!saved) return null;
    
    try {
        return JSON.parse(saved);
    } catch (e) {
        return null;
    }
}

window.saveCurrentWorkspace = saveCurrentWorkspace;

async function initApp() {
    console.log('Starting initApp...');
    await initDB();
    
    const savedWorkspace = restoreWorkspace();
    if (savedWorkspace && savedWorkspace.videoFiles && savedWorkspace.videoFiles.length > 0) {
        AppState.savedWorkspaceData = savedWorkspace;
    }
    
    // 获取 DOM 元素
    const fileInput = document.getElementById('fileInput');
    const uploadSection = document.getElementById('uploadSection');
    const addVideoInput = document.getElementById('addVideoInput');
    const addVideoBtn = document.getElementById('addVideoBtn');
    const resetWorkspaceBtn = document.getElementById('resetWorkspaceBtn');
    const transcribeBtn = document.getElementById('transcribeBtn');
    const serverSettingsBtn = document.getElementById('serverSettingsBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const serverSettingsModal = document.getElementById('serverSettingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const serverApiInput = document.getElementById('serverApiInput');
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const serverPresetProxyBtn = document.getElementById('serverPresetProxyBtn');
    const serverPresetLocalBtn = document.getElementById('serverPresetLocalBtn');
    const serverPresetBundleBtn = document.getElementById('serverPresetBundleBtn');
    const llmSettingsBtn = document.getElementById('llmSettingsBtn');
    const llmSettingsModal = document.getElementById('llmSettingsModal');
    const closeLlmSettingsBtn = document.getElementById('closeLlmSettingsBtn');
    const llmApiUrl = document.getElementById('llmApiUrl');
    const llmApiKey = document.getElementById('llmApiKey');
    const llmModel = document.getElementById('llmModel');
    const llmTargetLang = document.getElementById('llmTargetLang');
    const testLlmConnectionBtn = document.getElementById('testLlmConnectionBtn');
    const saveLlmSettingsBtn = document.getElementById('saveLlmSettingsBtn');
    const llmConnectionStatus = document.getElementById('llmConnectionStatus');
    const removeFillerBtn = document.getElementById('removeFillerBtn');
    const translateBtn = document.getElementById('translateBtn');
    const clearTranscriptionBtn = document.getElementById('clearTranscriptionBtn');
    const downloadBilingualSrtBtn = document.getElementById('downloadBilingualSrtBtn');
    const downloadSrtBtn = document.getElementById('downloadSrtBtn');
    const clearPendingSelectionsBtn = document.getElementById('clearPendingSelectionsBtn');
    const confirmSelectionsBtn = document.getElementById('confirmSelectionsBtn');
    const keepModeBtn = document.getElementById('keepModeBtn');
    const excludeModeBtn = document.getElementById('excludeModeBtn');
    const smartBatchVideoBtn = document.getElementById('smartBatchVideoBtn');
    const smartMergeVideoBtn = document.getElementById('smartMergeVideoBtn');
    const batchAudioBtn = document.getElementById('batchAudioBtn');
    const mergeAudioBtn = document.getElementById('mergeAudioBtn');
    const clearAllSegmentsBtn = document.getElementById('clearAllSegmentsBtn');
    const resetTranscriptionBtn = document.getElementById('resetTranscriptionBtn');
    
    // 初始化 Lucide 图标
    if (window.lucide) window.lucide.createIcons();

    // 绑定上传逻辑
    if (uploadSection) {
        uploadSection.onclick = () => fileInput.click();
        uploadSection.addEventListener('dragover', (e) => { e.preventDefault(); uploadSection.classList.add('dragover'); });
        uploadSection.addEventListener('dragleave', () => uploadSection.classList.remove('dragover'));
        uploadSection.addEventListener('drop', (e) => { e.preventDefault(); uploadSection.classList.remove('dragover'); handleFileSelect(e.dataTransfer.files); });
    }
    
    if (fileInput) {
        fileInput.onchange = (e) => {
            if (e.target.files.length > 0) handleFileSelect(e.target.files);
        };
    }
    
    if (addVideoBtn) addVideoBtn.onclick = () => addVideoInput.click();
    if (addVideoInput) {
        addVideoInput.onchange = (e) => {
            if (e.target.files.length > 0) handleFileSelect(e.target.files);
        };
    }
    
    if (resetWorkspaceBtn) resetWorkspaceBtn.addEventListener('click', resetWorkspace);
    if (transcribeBtn) transcribeBtn.addEventListener('click', transcribeVideo);
    if (resetZoomBtn) resetZoomBtn.addEventListener('click', resetZoom);
    
    // 设置界面逻辑
    if (serverSettingsBtn) {
        serverSettingsBtn.addEventListener('click', () => {
            if (serverApiInput) serverApiInput.value = AppState.serverApiUrl;
            const connectionStatus = document.getElementById('connectionStatus');
            if (connectionStatus) connectionStatus.classList.add('hidden');
            renderServerHelp(AppState.serverApiUrl);
            if (serverSettingsModal) serverSettingsModal.classList.remove('hidden');
        });
    }
    
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => {
        if (serverSettingsModal) serverSettingsModal.classList.add('hidden');
    });
    if (serverApiInput) {
        serverApiInput.addEventListener('input', (event) => {
            renderServerHelp(event.target.value);
        });
    }
    if (serverPresetProxyBtn) {
        serverPresetProxyBtn.addEventListener('click', () => {
            if (serverApiInput) serverApiInput.value = '/api/asr';
            renderServerHelp('/api/asr');
        });
    }
    if (serverPresetLocalBtn) {
        serverPresetLocalBtn.addEventListener('click', () => {
            if (serverApiInput) serverApiInput.value = 'http://127.0.0.1:8000';
            renderServerHelp('http://127.0.0.1:8000');
        });
    }
    if (serverPresetBundleBtn) {
        serverPresetBundleBtn.addEventListener('click', () => {
            if (serverApiInput) serverApiInput.value = 'http://127.0.0.1:18000';
            renderServerHelp('http://127.0.0.1:18000');
        });
    }
    if (testConnectionBtn) testConnectionBtn.addEventListener('click', connectToServer);
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const url = serverApiInput?.value.trim();
            if (url) { AppState.serverApiUrl = url; localStorage.setItem('serverApiUrl', url); }
            if (serverSettingsModal) serverSettingsModal.classList.add('hidden');
            connectToServer();
        });
    }

    if (llmSettingsBtn) {
        llmSettingsBtn.addEventListener('click', () => {
            llmApiUrl.value = AppState.llmConfig.apiUrl;
            llmApiKey.value = AppState.llmConfig.apiKey;
            llmModel.value = AppState.llmConfig.model;
            llmTargetLang.value = AppState.llmConfig.targetLang;
            llmConnectionStatus.classList.add('hidden');
            llmSettingsModal.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
        });
    }
    
    if (closeLlmSettingsBtn) closeLlmSettingsBtn.addEventListener('click', () => llmSettingsModal.classList.add('hidden'));
    
    if (testLlmConnectionBtn) {
        testLlmConnectionBtn.addEventListener('click', async () => {
            const apiUrl = llmApiUrl.value.trim();
            const apiKey = llmApiKey.value.trim();
            if (!apiUrl || !apiKey) return;
            llmConnectionStatus.textContent = '测试连接中...';
            llmConnectionStatus.classList.remove('hidden');
            try {
                const originalConfig = { ...AppState.llmConfig };
                AppState.llmConfig = { apiUrl, apiKey, model: llmModel.value.trim(), targetLang: llmTargetLang.value };
                await callLLM('Hello', 'You are a test assistant.');
                AppState.llmConfig = originalConfig;
                llmConnectionStatus.textContent = '✓ 连接成功！';
            } catch (err) {
                llmConnectionStatus.textContent = `✗ 失败: ${err.message}`;
            }
        });
    }

    if (saveLlmSettingsBtn) {
        saveLlmSettingsBtn.addEventListener('click', () => {
            AppState.llmConfig.apiUrl = llmApiUrl.value.trim();
            AppState.llmConfig.apiKey = llmApiKey.value.trim();
            AppState.llmConfig.model = llmModel.value.trim();
            AppState.llmConfig.targetLang = llmTargetLang.value;
            localStorage.setItem('llmApiUrl', AppState.llmConfig.apiUrl);
            localStorage.setItem('llmApiKey', AppState.llmConfig.apiKey);
            localStorage.setItem('llmModel', AppState.llmConfig.model);
            localStorage.setItem('llmTargetLang', AppState.llmConfig.targetLang);
            llmSettingsModal.classList.add('hidden');
        });
    }

    if (removeFillerBtn) removeFillerBtn.addEventListener('click', removeFillerWords);
    if (translateBtn) translateBtn.addEventListener('click', translateToBilingual);
    if (clearTranscriptionBtn) {
        clearTranscriptionBtn.addEventListener('click', () => {
            if (AppState.currentVideoIndex >= 0) {
                delete AppState.transcriptionResults[AppState.currentVideoIndex];
            }
            AppState.transcriptionResult = null;
            AppState.bilingualSrtContent = null;
            resetTranscriptionState();
            const transcriptionPanel = document.getElementById('transcriptionPanel');
            const transcriptionContent = document.getElementById('transcriptionContent');
            const transcriptionText = document.getElementById('transcriptionText');
            if (transcriptionPanel) transcriptionPanel.classList.add('hidden');
            if (transcriptionContent) transcriptionContent.classList.add('hidden');
            if (transcriptionText) transcriptionText.textContent = '';
            if (downloadBilingualSrtBtn) downloadBilingualSrtBtn.classList.add('hidden');
        });
    }
    if (downloadBilingualSrtBtn) downloadBilingualSrtBtn.addEventListener('click', () => downloadBilingualSrt(AppState.bilingualSrtContent));
    if (downloadSrtBtn) downloadSrtBtn.addEventListener('click', () => downloadSrt(AppState.transcriptionResult));
    
    if (clearPendingSelectionsBtn) clearPendingSelectionsBtn.addEventListener('click', clearPendingSelections);
    if (confirmSelectionsBtn) confirmSelectionsBtn.addEventListener('click', confirmPendingSelections);
    if (resetTranscriptionBtn) resetTranscriptionBtn.addEventListener('click', resetTranscriptionState);
    if (keepModeBtn) keepModeBtn.addEventListener('click', () => setSelectionMode('keep'));
    if (excludeModeBtn) excludeModeBtn.addEventListener('click', () => setSelectionMode('exclude'));
    
    if (smartBatchVideoBtn) {
        smartBatchVideoBtn.onclick = async () => {
            const segmentsWithFiles = AppState.allSegments.map(s => ({ ...s, videoFile: AppState.videoFiles[s.videoIndex].file }));
            await executeSmartVideoExport(segmentsWithFiles, AppState.allSegments.map((_, i) => i + 1), false);
        };
    }

    if (smartMergeVideoBtn) {
        smartMergeVideoBtn.onclick = async () => {
            const segmentsWithFiles = AppState.allSegments.map(s => ({ ...s, videoFile: AppState.videoFiles[s.videoIndex].file }));
            await executeSmartVideoExport(segmentsWithFiles, [], true);
        };
    }

    if (batchAudioBtn) {
        batchAudioBtn.onclick = async () => {
            for (const seg of AppState.allSegments) {
                await processAudioExport(AppState.videoFiles[seg.videoIndex].file, [seg], [AppState.allSegments.indexOf(seg) + 1]);
            }
        };
    }

    if (mergeAudioBtn) mergeAudioBtn.onclick = async () => { await processMergeAudioExport(AppState.allSegments); };
    if (clearAllSegmentsBtn) clearAllSegmentsBtn.addEventListener('click', clearAllSegments);

    // FFmpeg 引擎加载
    const tty = document.getElementById('tty');
    const ffmpegProgressBar = document.getElementById('ffmpegProgressBar');
    
    function log(message, isSystem = false) {
        const time = new Date().toLocaleTimeString();
        let msgHTML = `[${time}] ${message}\n`;
        if (message.includes('Error') || message.includes('失败')) {
            msgHTML = `<span class="text-red-400 font-bold">[${time}] ${message}</span>\n`;
        } else if (isSystem) {
            msgHTML = `<span class="text-blue-300">[${time}] ${message}</span>\n`;
        }
        if (tty) { tty.innerHTML += msgHTML; tty.scrollTop = tty.scrollHeight; }
    }
    
    const baseURLFFMPEG = `https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/umd`;
    const baseURLCore = `https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd`;
    
    const toBlobURLPatched = async (url, mimeType, patcher) => {
        const resp = await fetch(url);
        let body = await resp.text();
        if (patcher) body = patcher(body);
        return URL.createObjectURL(new Blob([body], { type: mimeType }));
    };
    
    const toBlobURL = async (url, mimeType) => {
        const resp = await fetch(url);
        const blob = await resp.blob();
        return URL.createObjectURL(blob);
    };
    
    const loadFFmpeg = async () => {
        log('开始加载 FFmpeg 内核...', true);
        const ffmpegBlobURL = await toBlobURLPatched(`${baseURLFFMPEG}/ffmpeg.js`, 'text/javascript', (js) => js.replace('new URL(e.p+e.u(814),e.b)', 'r.workerLoadURL'));
        await import(ffmpegBlobURL);
        
        const FFmpegWASM = window.FFmpegWASM;
        if (!FFmpegWASM) throw new Error('FFmpeg WASM 模块未找到');
        
        AppState.ffmpeg = new FFmpegWASM.FFmpeg();
        AppState.ffmpeg.on('log', ({ message }) => console.log('[FFmpeg]', message));
        AppState.ffmpeg.on('progress', (p) => {
            if (ffmpegProgressBar) ffmpegProgressBar.style.width = `${Math.round(p.progress * 100)}%`;
        });
        
        await AppState.ffmpeg.load({
            workerLoadURL: await toBlobURL(`${baseURLFFMPEG}/814.ffmpeg.js`, 'text/javascript'),
            coreURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURLCore}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        log('FFmpeg 内核加载成功！', true);
        if (ffmpegProgressBar) ffmpegProgressBar.style.width = '0%';
    };
    
    loadFFmpeg().catch(err => log(`[错误] FFmpeg 加载失败: ${err.message}`));
    
    connectToServer();
    updateTranscribeStatus();
    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
