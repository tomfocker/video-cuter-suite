import { AppState } from './state.js';
import { initWaveSurfer, renderAllSegments } from './waveform.js';
import { updateTranscriptionHighlight, renderTranscriptionText } from './transcription.js';
import { updateTranscribeStatus } from './websocket.js';
import { escapeHTML } from './utils.js';

function clearTranscriptionUI() {
    AppState.transcriptionResult = null;
    AppState.bilingualSrtContent = null;
    AppState.pendingSelections = [];
    AppState.excludeSelections = [];
    AppState.pendingPreviewRegion = null;
    AppState.isPreviewMode = false;
    AppState.isResetState = false;
    AppState.deletionMap.clear();

    const transcriptionPanel = document.getElementById('transcriptionPanel');
    const transcriptionContent = document.getElementById('transcriptionContent');
    const transcriptionText = document.getElementById('transcriptionText');
    const downloadSrtBtn = document.getElementById('downloadSrtBtn');
    const downloadBilingualSrtBtn = document.getElementById('downloadBilingualSrtBtn');

    if (transcriptionPanel) transcriptionPanel.classList.add('hidden');
    if (transcriptionContent) transcriptionContent.classList.add('hidden');
    if (transcriptionText) transcriptionText.textContent = '';
    if (downloadSrtBtn) downloadSrtBtn.classList.remove('hidden');
    if (downloadBilingualSrtBtn) downloadBilingualSrtBtn.classList.add('hidden');
}

function removeTranscriptionResultAtIndex(idx) {
    const nextResults = {};

    Object.entries(AppState.transcriptionResults).forEach(([key, value]) => {
        const numericKey = Number(key);

        if (!Number.isInteger(numericKey)) {
            nextResults[key] = value;
            return;
        }

        if (numericKey < idx) {
            nextResults[numericKey] = value;
        } else if (numericKey > idx) {
            nextResults[numericKey - 1] = value;
        }
    });

    AppState.transcriptionResults = nextResults;
}

export function switchToVideo(idx) {
    if (idx < 0 || idx >= AppState.videoFiles.length) return;
    AppState.currentVideoIndex = idx;
    const v = AppState.videoFiles[idx];
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.src = v.objectURL;
    document.getElementById('currentVideoName').textContent = v.name;
    document.getElementById('currentVideoIndicator').classList.remove('hidden');
    initWaveSurfer(v.objectURL, v.segments);
    renderVideoList();
    if (AppState.transcriptionResults[idx]) {
        AppState.transcriptionResult = AppState.transcriptionResults[idx];
        document.getElementById('transcriptionPanel').classList.remove('hidden');
        renderTranscriptionText(AppState.transcriptionResults[idx]);
    } else {
        AppState.transcriptionResult = null;
        document.getElementById('transcriptionPanel').classList.add('hidden');
        document.getElementById('transcriptionContent').classList.add('hidden');
    }
    updateTranscribeStatus();
}

export function renderVideoList() {
    const videoList = document.getElementById('videoListContainer');
    if (AppState.videoFiles.length === 0) {
        videoList.innerHTML = '<p class="text-gray-500 text-xs">暂无视频</p>';
        return;
    }
    let html = '';
    AppState.videoFiles.forEach((v, idx) => {
        const isActive = idx === AppState.currentVideoIndex;
        const segmentCount = v.segments ? v.segments.length : 0;
        const safeName = escapeHTML(v.name);
        html += `<div class="flex items-center justify-between p-2 rounded ${isActive ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'} text-xs cursor-pointer group" onclick="window.switchToVideo(${idx})">
            <div class="flex items-center gap-2 flex-1 min-w-0">
                <i data-lucide="film" class="w-3 h-3 flex-shrink-0"></i>
                <span class="truncate">${safeName}</span>
                ${segmentCount > 0 ? `<span class="text-xs bg-indigo-500/30 px-1 rounded">${segmentCount}</span>` : ''}
            </div>
            <button onclick="event.stopPropagation(); window.removeVideo(${idx})" class="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
        </div>`;
    });
    videoList.innerHTML = html;
    lucide.createIcons();
}

window.switchToVideo = switchToVideo;

window.removeVideo = (idx) => {
    const removedVideo = AppState.videoFiles[idx];
    if (removedVideo?.objectURL) {
        URL.revokeObjectURL(removedVideo.objectURL);
    }

    AppState.videoFiles.splice(idx, 1);
    removeTranscriptionResultAtIndex(idx);

    if (AppState.videoFiles.length > 0) {
        switchToVideo(Math.min(idx, AppState.videoFiles.length - 1));
        if (window.saveCurrentWorkspace) window.saveCurrentWorkspace();
    } else {
        AppState.currentVideoIndex = -1;
        AppState.savedWorkspaceData = null;
        localStorage.removeItem('videoCutterWorkspace');
        clearTranscriptionUI();
        document.getElementById('workspace').classList.add('hidden');
        document.getElementById('uploadSection').classList.remove('hidden');
    }
    renderVideoList();
    renderAllSegments();
};

export function handleFileSelect(files) {
    if (!files || files.length === 0) return;
    for (const file of files) {
        if (!file.type.startsWith('video/')) continue;
        const objectURL = URL.createObjectURL(file);
        
        let segments = [];
        if (AppState.savedWorkspaceData && AppState.savedWorkspaceData.videoFiles) {
            const savedVideo = AppState.savedWorkspaceData.videoFiles.find(v => v.name === file.name);
            if (savedVideo && savedVideo.segments) {
                segments = savedVideo.segments;
                console.log(`已恢复视频 "${file.name}" 的 ${segments.length} 个选区`);
            }
        }
        
        AppState.videoFiles.push({ name: file.name, file: file, objectURL: objectURL, segments: segments });
    }
    if (AppState.videoFiles.length > 0) {
        document.getElementById('uploadSection').classList.add('hidden');
        document.getElementById('workspace').classList.remove('hidden');
        if (AppState.currentVideoIndex === -1) switchToVideo(0);
        else {
            renderVideoList();
            renderAllSegments();
            updateTranscribeStatus();
        }
    }
}

export function clearAllSegments() {
    if (AppState.currentVideoIndex === -1 || !AppState.wsRegions) return;
    AppState.wsRegions.getRegions().forEach(r => r.remove());
    AppState.videoFiles[AppState.currentVideoIndex].segments = [];
    renderAllSegments();
    updateTranscriptionHighlight();
    console.log('已清空所有选区');
}

export function resetWorkspace() {
    if (AppState.wavesurfer) { AppState.wavesurfer.destroy(); AppState.wavesurfer = null; }
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.load();
    AppState.videoFiles.forEach(v => URL.revokeObjectURL(v.objectURL));
    AppState.videoFiles = [];
    AppState.allSegments = [];
    AppState.currentVideoIndex = -1;
    AppState.transcriptionResults = {};
    AppState.savedWorkspaceData = null;
    localStorage.removeItem('videoCutterWorkspace');
    clearTranscriptionUI();
    document.getElementById('segmentsListContainer').innerHTML = '';
    document.getElementById('videoListContainer').innerHTML = '';
    document.getElementById('workspace').classList.add('hidden');
    document.getElementById('uploadSection').classList.remove('hidden');
    document.getElementById('currentVideoIndicator').classList.add('hidden');
    updateTranscribeStatus();
}
