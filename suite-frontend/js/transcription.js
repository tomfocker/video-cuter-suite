import { AppState } from './state.js';
import { highlightRegionAtTime, clearHighlightRegion, addRegionAtTime, setWaveformCallbacks, renderAllSegments } from './waveform.js';
import { clearAllSegments } from './video.js';
import { escapeHTML } from './utils.js';

function getRenderableChunks(result = AppState.transcriptionResult) {
    if (!result) return [];
    if (Array.isArray(result.displayChunks) && result.displayChunks.length > 0) {
        return result.displayChunks;
    }
    if (Array.isArray(result.chunks) && result.chunks.length > 0) {
        return result.chunks;
    }
    return [];
}

export function updateTranscriptionHighlight(previewRegion = null) {
    if (!AppState.transcriptionResult || getRenderableChunks().length === 0 || !AppState.wsRegions) return;
    if (AppState.isResetState) return;
    
    const regions = AppState.wsRegions.getRegions();
    document.querySelectorAll('.transcript-token').forEach(span => {
        const start = parseFloat(span.dataset.start);
        const end = parseFloat(span.dataset.end);
        let isIncluded = false;
        
        for (const region of regions) {
            if (start < region.end && end > region.start) { isIncluded = true; break; }
        }
        
        const preview = previewRegion || AppState.pendingPreviewRegion;
        if (preview && start < preview.end && end > preview.start) {
            isIncluded = true;
        }
        
        if (isIncluded) {
            span.classList.add('bg-green-500/40', 'text-white');
            span.classList.remove('bg-red-500/30', 'text-red-300', 'line-through', 'text-gray-200');
        } else {
            span.classList.remove('bg-green-500/40', 'text-white');
            span.classList.add('bg-red-500/30', 'text-red-300', 'line-through');
        }
    });
}

export function toggleRegionAtTime(start, end) {
    if (!AppState.wsRegions) return;
    const regions = AppState.wsRegions.getRegions();
    let existingRegion = null;
    for (const region of regions) {
        if (start >= region.start && end <= region.end) {
            existingRegion = region;
            break;
        }
    }
    if (existingRegion) {
        existingRegion.remove();
    } else {
        addRegionAtTime(start, end, 'rgba(99, 102, 241, 0.4)');
    }
}

export function setSelectionMode(mode, skipConfirm = false) {
    AppState.selectionMode = mode;
    AppState.pendingPreviewRegion = null;
    AppState.isPreviewMode = false;
    AppState.isResetState = false;
    
    const keepModeBtn = document.getElementById('keepModeBtn');
    const excludeModeBtn = document.getElementById('excludeModeBtn');
    const transcriptionText = document.getElementById('transcriptionText');
    
    if (mode === 'keep') {
        if (keepModeBtn) keepModeBtn.className = 'text-xs px-3 py-1.5 bg-green-600 text-white rounded flex items-center gap-1 transition-colors';
        if (excludeModeBtn) excludeModeBtn.className = 'text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex items-center gap-1 transition-colors';
        
        AppState.excludeSelections = [];
        AppState.pendingSelections = [];
        if (transcriptionText) {
            const tokens = transcriptionText.querySelectorAll('.transcript-token');
            tokens.forEach(token => {
                token.classList.remove('bg-red-500/40', 'bg-green-500/40', 'text-white');
                token.classList.add('text-gray-200');
            });
        }
        updateTranscriptionHighlight();
        updatePendingSelectionsUI();
    } else {
        if (keepModeBtn) keepModeBtn.className = 'text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex items-center gap-1 transition-colors';
        if (excludeModeBtn) excludeModeBtn.className = 'text-xs px-3 py-1.5 bg-red-600 text-white rounded flex items-center gap-1 transition-colors';
        
        AppState.pendingSelections = [];
        AppState.excludeSelections = [];
        
        if (AppState.wsRegions) {
            AppState.wsRegions.getRegions().forEach(r => r.remove());
        }
        
        if (transcriptionText) {
            const tokens = transcriptionText.querySelectorAll('.transcript-token');
            tokens.forEach((token) => {
                token.classList.add('bg-green-500/40', 'text-white');
                token.classList.remove('bg-red-500/30', 'text-red-300', 'line-through', 'text-gray-200');
            });
        }
        updatePendingSelectionsUI();
    }
}

export function highlightSelectedTokens(startIdx, endIdx, type = 'keep') {
    const transcriptionText = document.getElementById('transcriptionText');
    if (!transcriptionText) return;
    const tokens = transcriptionText.querySelectorAll('.transcript-token');
    tokens.forEach((token, idx) => {
        if (idx >= startIdx && idx <= endIdx) {
            if (type === 'keep') {
                token.classList.add('bg-green-500/40', 'text-white');
                token.classList.remove('bg-red-500/30', 'text-red-300', 'line-through', 'text-gray-200');
            } else {
                token.classList.add('bg-red-500/40', 'text-white');
                token.classList.remove('bg-green-500/40', 'text-gray-200');
            }
        }
    });
}

export function unhighlightSelectedTokens(startIdx, endIdx) {
    const transcriptionText = document.getElementById('transcriptionText');
    if (!transcriptionText) return;
    const tokens = transcriptionText.querySelectorAll('.transcript-token');
    tokens.forEach((token, idx) => {
        if (idx >= startIdx && idx <= endIdx) {
            token.classList.remove('bg-green-500/40', 'bg-red-500/40', 'text-white');
            token.classList.add('bg-red-500/30', 'text-red-300', 'line-through');
        }
    });
}

export function updatePendingSelectionsUI() {
    const keepCount = AppState.pendingSelections.length;
    const excludeCount = AppState.excludeSelections.length;
    
    const pendingSelectionCount = document.getElementById('pendingSelectionCount');
    const excludeSelectionCount = document.getElementById('excludeSelectionCount');
    const clearPendingSelectionsBtn = document.getElementById('clearPendingSelectionsBtn');
    const confirmSelectionsBtn = document.getElementById('confirmSelectionsBtn');
    
    if (pendingSelectionCount) {
        if (keepCount > 0) {
            pendingSelectionCount.classList.remove('hidden');
            const span = pendingSelectionCount.querySelector('span');
            if (span) span.textContent = keepCount;
        } else {
            pendingSelectionCount.classList.add('hidden');
        }
    }
    
    if (excludeSelectionCount) {
        if (excludeCount > 0) {
            excludeSelectionCount.classList.remove('hidden');
            const span = excludeSelectionCount.querySelector('span');
            if (span) span.textContent = excludeCount;
        } else {
            excludeSelectionCount.classList.add('hidden');
        }
    }
    
    if (clearPendingSelectionsBtn && confirmSelectionsBtn) {
        if (keepCount > 0 || excludeCount > 0) {
            clearPendingSelectionsBtn.classList.remove('hidden');
            confirmSelectionsBtn.classList.remove('hidden');
        } else {
            clearPendingSelectionsBtn.classList.add('hidden');
            confirmSelectionsBtn.classList.add('hidden');
        }
    }
}

export function clearPendingSelections() {
    AppState.pendingSelections = [];
    AppState.excludeSelections = [];
    const transcriptionText = document.getElementById('transcriptionText');
    if (transcriptionText) {
        const tokens = transcriptionText.querySelectorAll('.transcript-token');
        tokens.forEach(token => {
            token.classList.remove('bg-green-500/40', 'bg-red-500/40', 'text-white');
            token.classList.add('text-gray-200');
        });
    }
    updatePendingSelectionsUI();
}

export function resetTranscriptionState() {
    AppState.pendingSelections = [];
    AppState.excludeSelections = [];
    AppState.pendingPreviewRegion = null;
    AppState.isPreviewMode = false;
    AppState.isResetState = true;
    
    if (AppState.wsRegions) {
        AppState.wsRegions.getRegions().forEach(r => {
            if (!r.isHighlight) r.remove();
        });
    }
    
    if (AppState.currentVideoIndex >= 0 && AppState.videoFiles[AppState.currentVideoIndex]) {
        AppState.videoFiles[AppState.currentVideoIndex].segments = [];
    }
    renderAllSegments();
    
    const transcriptionText = document.getElementById('transcriptionText');
    if (transcriptionText) {
        const tokens = transcriptionText.querySelectorAll('.transcript-token');
        tokens.forEach(token => {
            if (AppState.selectionMode === 'keep') {
                token.classList.remove('bg-green-500/40', 'text-white', 'bg-red-500/40');
                token.classList.add('bg-red-500/30', 'text-red-300', 'line-through');
            } else {
                token.classList.remove('bg-red-500/40', 'bg-red-500/30', 'text-red-300', 'line-through', 'text-gray-200');
                token.classList.add('bg-green-500/40', 'text-white');
            }
        });
    }
    updatePendingSelectionsUI();
}

export function confirmPendingSelections() {
    if (AppState.pendingSelections.length === 0 && AppState.excludeSelections.length === 0) return;
    
    if (AppState.selectionMode === 'keep' && AppState.pendingSelections.length > 0) {
        AppState.pendingSelections.forEach(sel => {
            addRegionAtTime(sel.start, sel.end, 'rgba(99, 102, 241, 0.4)');
        });
        console.log(`已添加 ${AppState.pendingSelections.length} 个保留片段`);
    }
    
    if (AppState.selectionMode === 'exclude' && AppState.excludeSelections.length > 0) {
        const transcriptionText = document.getElementById('transcriptionText');
        if (transcriptionText) {
            const tokens = transcriptionText.querySelectorAll('.transcript-token');
            const totalTokens = tokens.length;
            const excludedIndices = new Set();
            
            AppState.excludeSelections.forEach(sel => {
                for (let i = sel.startIdx; i <= sel.endIdx; i++) {
                    excludedIndices.add(i);
                }
            });
            
            const regionsToCreate = [];
            let currentRegion = null;
            
            for (let i = 0; i < totalTokens; i++) {
                if (!excludedIndices.has(i)) {
                    const token = tokens[i];
                    const start = parseFloat(token.dataset.start);
                    const end = parseFloat(token.dataset.end);
                    
                    if (currentRegion === null) {
                        currentRegion = { startIdx: i, endIdx: i, start: start, end: end };
                    } else if (i === currentRegion.endIdx + 1) {
                        currentRegion.endIdx = i;
                        currentRegion.end = end;
                    } else {
                        regionsToCreate.push(currentRegion);
                        currentRegion = { startIdx: i, endIdx: i, start: start, end: end };
                    }
                }
            }
            
            if (currentRegion !== null) {
                regionsToCreate.push(currentRegion);
            }
            
            regionsToCreate.forEach(region => {
                addRegionAtTime(region.start, region.end, 'rgba(99, 102, 241, 0.4)');
            });
            
            console.log(`已排除 ${AppState.excludeSelections.length} 个片段，自动创建 ${regionsToCreate.length} 个保留片段`);
        }
    }
    
    AppState.pendingSelections = [];
    AppState.excludeSelections = [];
    updatePendingSelectionsUI();
    updateTranscriptionHighlight();
}

export function renderTranscriptionText(result) {
    const transcriptionContent = document.getElementById('transcriptionContent');
    const transcriptionText = document.getElementById('transcriptionText');
    if (transcriptionContent) transcriptionContent.classList.remove('hidden');
    AppState.pendingSelections = [];
    AppState.excludeSelections = [];
    AppState.selectionMode = 'keep';
    updatePendingSelectionsUI();
    
    const chunks = getRenderableChunks(result);
    if (!result.text && chunks.length === 0) {
        if (transcriptionText) transcriptionText.innerHTML = '<span class="text-gray-500">未识别到语音内容</span>';
        return;
    }
    
    if (chunks.length > 0) {
        let html = '';
        chunks.forEach((chunk, idx) => {
            const text = chunk.text || '';
            const start = chunk.timestamp[0];
            const end = chunk.timestamp[1];
            if (text) {
                html += `<span class="transcript-token cursor-pointer hover:bg-purple-600/30 rounded px-0.5 select-text transition-colors text-gray-200" data-start="${start}" data-end="${end}" data-idx="${idx}">${escapeHTML(text)}</span>`;
            }
        });
        
        if (transcriptionText) {
            transcriptionText.innerHTML = html;
            
            transcriptionText.querySelectorAll('.transcript-token').forEach(span => {
                span.addEventListener('click', (e) => {
                    if (window.getSelection().toString().length > 0) return;
                    const start = parseFloat(span.dataset.start);
                    const videoPlayer = document.getElementById('videoPlayer');
                    if (videoPlayer) videoPlayer.currentTime = start;
                });
            });
            
            transcriptionText.onmouseup = handleTextSelection;
        }
        
        setTimeout(updateTranscriptionHighlight, 50);
    } else if (result.text) {
        if (transcriptionText) transcriptionText.innerHTML = `<span class="text-gray-200">${escapeHTML(result.text)}</span>`;
        return;
    }
}

function handleTextSelection() {
    AppState.isResetState = false;
    
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) return;
    
    const range = selection.getRangeAt(0);
    const transcriptionText = document.getElementById('transcriptionText');
    if (!transcriptionText) return;
    
    let startSpan = null;
    let endSpan = null;
    
    let node = range.startContainer;
    while (node && node !== transcriptionText) {
        if (node.classList && node.classList.contains('transcript-token')) {
            startSpan = node;
            break;
        }
        node = node.parentNode;
    }
    if (!startSpan && range.startContainer.parentNode?.classList?.contains('transcript-token')) {
        startSpan = range.startContainer.parentNode;
    }
    
    node = range.endContainer;
    while (node && node !== transcriptionText) {
        if (node.classList && node.classList.contains('transcript-token')) {
            endSpan = node;
            break;
        }
        node = node.parentNode;
    }
    if (!endSpan && range.endContainer.parentNode?.classList?.contains('transcript-token')) {
        endSpan = range.endContainer.parentNode;
    }
    
    if (startSpan && endSpan) {
        const startTime = parseFloat(startSpan.dataset.start);
        const endTime = parseFloat(endSpan.dataset.end);
        const selectedText = selection.toString().trim();
        
        if (startTime < endTime && selectedText) {
            const startIdx = parseInt(startSpan.dataset.idx);
            const endIdx = parseInt(endSpan.dataset.idx);
            
            const newSelection = {
                start: startTime,
                end: endTime,
                startIdx: startIdx,
                endIdx: endIdx,
                text: selectedText
            };
            
            if (AppState.selectionMode === 'exclude') {
                AppState.excludeSelections = mergeSelections([...AppState.excludeSelections, newSelection]);
                
                const tokens = transcriptionText.querySelectorAll('.transcript-token');
                tokens.forEach((token, idx) => {
                    const isInExclude = AppState.excludeSelections.some(sel => idx >= sel.startIdx && idx <= sel.endIdx);
                    if (isInExclude) {
                        token.classList.add('bg-red-500/40', 'text-white');
                        token.classList.remove('bg-green-500/40', 'text-gray-200');
                    }
                });
            } else {
                AppState.pendingSelections = mergeSelections([...AppState.pendingSelections, newSelection]);
                
                const tokens = transcriptionText.querySelectorAll('.transcript-token');
                tokens.forEach((token, idx) => {
                    const isInPending = AppState.pendingSelections.some(sel => idx >= sel.startIdx && idx <= sel.endIdx);
                    if (isInPending) {
                        token.classList.add('bg-green-500/40', 'text-white');
                        token.classList.remove('bg-red-500/30', 'text-red-300', 'line-through', 'text-gray-200');
                    }
                });
            }
            
            updatePendingSelectionsUI();
        }
    }
    
    selection.removeAllRanges();
}

function mergeSelections(selections) {
    if (selections.length <= 1) return selections;
    
    selections.sort((a, b) => a.startIdx - b.startIdx);
    
    const merged = [selections[0]];
    
    for (let i = 1; i < selections.length; i++) {
        const current = selections[i];
        const last = merged[merged.length - 1];
        
        if (current.startIdx <= last.endIdx + 1) {
            last.endIdx = Math.max(last.endIdx, current.endIdx);
            last.end = Math.max(last.end, current.end);
            last.text = last.text + current.text;
        } else {
            merged.push(current);
        }
    }
    
    return merged;
}

export function initTranscriptionCallbacks() {
    setWaveformCallbacks({
        updateTranscriptionHighlight
    });
}
