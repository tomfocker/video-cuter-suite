import { AppState, MIN_ZOOM, MAX_ZOOM } from './state.js';
import { escapeHTML, formatTime } from './utils.js';

export function resetZoom() {
    if (!AppState.wavesurfer) return;
    AppState.currentZoom = MIN_ZOOM;
    AppState.wavesurfer.zoom(AppState.currentZoom);
}

let switchToVideoCallback = null;
export function setSwitchToVideoCallback(cb) { switchToVideoCallback = cb; }

export function checkRegionOverlap(tempRegion) {
    if (!AppState.wsRegions) return false;
    const regions = AppState.wsRegions.getRegions();
    for (const r of regions) {
        if (r.id === tempRegion.id) continue;
        if (tempRegion.start < r.end && tempRegion.end > r.start) return true;
    }
    return false;
}

export function saveCurrentSegments() {
    if (AppState.currentVideoIndex === -1 || !AppState.wsRegions) return;
    const regions = AppState.wsRegions.getRegions();
    const segments = regions
        .filter((region) => !region.isHighlight)
        .map(r => ({
        id: r.id,
        start: r.start,
        end: r.end,
        color: r.options?.color || 'rgba(99, 102, 241, 0.4)'
    }))
        .sort((a, b) => a.start - b.start);
    AppState.videoFiles[AppState.currentVideoIndex].segments = segments;
}

let renderAllSegmentsCallback = null;
let updateTranscriptionHighlightCallback = null;

function inferRegionUpdateMode(region) {
    const dragStartState = region.dragStartState;
    if (!dragStartState) return 'move';

    const startChanged = Math.abs(region.start - dragStartState.start) > 0.0001;
    const endChanged = Math.abs(region.end - dragStartState.end) > 0.0001;

    if (startChanged && !endChanged) return 'resize-start';
    if (!startChanged && endChanged) return 'resize-end';
    return 'move';
}

function getRegionUpdateMode(region, side) {
    if (side === 'start') return 'resize-start';
    if (side === 'end') return 'resize-end';
    return inferRegionUpdateMode(region);
}

function getSiblingSegments(regionId) {
    if (!AppState.wsRegions) return [];

    return AppState.wsRegions.getRegions()
        .filter((region) => !region.isHighlight && region.id !== regionId)
        .map((region) => ({
            id: region.id,
            start: region.start,
            end: region.end
        }))
        .sort((a, b) => a.start - b.start);
}

function getAdjacentNeighbors(candidate, neighbors, context = {}) {
    const referenceStart = Number.isFinite(context.originalStart) ? context.originalStart : candidate.start;
    const referenceEnd = Number.isFinite(context.originalEnd) ? context.originalEnd : candidate.end;
    let previous = null;
    let next = null;

    for (const seg of neighbors) {
        if (seg.start < referenceStart) {
            previous = seg;
            continue;
        }

        if (seg.start >= referenceEnd && !next) {
            next = seg;
        }
    }

    return { previous, next };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getOriginalBounds(context, fallback) {
    const hasOriginalStart = Number.isFinite(context.originalStart);
    const hasOriginalEnd = Number.isFinite(context.originalEnd);

    if (hasOriginalStart && hasOriginalEnd) {
        return { start: context.originalStart, end: context.originalEnd };
    }

    return fallback;
}

function hasOverlap(candidate, neighbors) {
    return neighbors.some((seg) => candidate.start < seg.end && candidate.end > seg.start);
}

export function snapRegionBounds(candidate, neighbors, context = {}) {
    const minDuration = context.minDuration ?? 0.1;
    const duration = Math.max(minDuration, context.originalDuration ?? (candidate.end - candidate.start));
    const { previous, next } = getAdjacentNeighbors(candidate, neighbors, context);
    const originalBounds = getOriginalBounds(context, candidate);

    if (context.mode === 'resize-start') {
        const minStart = previous ? previous.end : Number.NEGATIVE_INFINITY;
        const maxStart = candidate.end - minDuration;

        if (maxStart < minStart) {
            return originalBounds;
        }

        return {
            start: clamp(candidate.start, minStart, maxStart),
            end: candidate.end
        };
    }

    if (context.mode === 'resize-end') {
        const minEnd = candidate.start + minDuration;
        const maxEnd = next ? next.start : Number.POSITIVE_INFINITY;

        if (maxEnd < minEnd) {
            return originalBounds;
        }

        return {
            start: candidate.start,
            end: clamp(candidate.end, minEnd, maxEnd)
        };
    }

    const minStart = previous ? previous.end : Number.NEGATIVE_INFINITY;
    const maxStart = next ? next.start - duration : Number.POSITIVE_INFINITY;

    if (maxStart < minStart) {
        return originalBounds;
    }

    const start = clamp(candidate.start, minStart, maxStart);
    const end = start + duration;

    return { start, end };
}

export function resolveRegionUpdateBounds(candidate, neighbors, context = {}) {
    const originalBounds = getOriginalBounds(context, candidate);
    const originalDuration = Math.max(context.minDuration ?? 0.1, context.originalDuration ?? (originalBounds.end - originalBounds.start));
    const candidateDuration = candidate.end - candidate.start;
    const durationPreserved = Math.abs(candidateDuration - originalDuration) <= 0.02;

    const modes = [];
    if (durationPreserved) {
        modes.push('move');
    }
    if (context.mode) {
        modes.push(context.mode);
    }
    modes.push('move', 'resize-start', 'resize-end');

    const tried = new Set();
    for (const mode of modes) {
        if (tried.has(mode)) continue;
        tried.add(mode);

        const resolved = snapRegionBounds(candidate, neighbors, { ...context, mode });
        if (!hasOverlap(resolved, neighbors)) {
            return resolved;
        }
    }

    return originalBounds;
}

function boundsMatch(left, right) {
    return Math.abs(left.start - right.start) < 0.0001 && Math.abs(left.end - right.end) < 0.0001;
}

export function commitResolvedBounds(region, snapped) {
    const currentBounds = { start: region.start, end: region.end };

    if (!boundsMatch(currentBounds, snapped)) {
        region.setOptions(snapped);
        region.start = snapped.start;
        region.end = snapped.end;
    }

    region.lastValidStart = snapped.start;
    region.lastValidEnd = snapped.end;
    region.pendingResolvedBounds = null;
    return snapped;
}

function beginRegionUpdateSession(region, side) {
    if (!region.dragStartState) {
        region.dragStartState = {
            start: region.lastValidStart ?? region.start,
            end: region.lastValidEnd ?? region.end
        };
    }
    region.lastUpdateSide = side;
}

function endRegionUpdateSession(region) {
    region.dragStartState = null;
    region.lastUpdateSide = undefined;
}

function buildSegmentCard(seg, index) {
    const startStr = formatTime(seg.start);
    const endStr = formatTime(seg.end);
    const durStr = formatTime(seg.end - seg.start);
    const summary = `${startStr} → ${endStr} ・ 时长 ${durStr}`;
    const isCurrentVideo = seg.videoIndex === AppState.currentVideoIndex;
    const safeVideoName = escapeHTML(seg.videoName);
    const safeSegIdArg = JSON.stringify(String(seg.id));

    return `
        <article class="rounded-2xl border border-gray-700/70 bg-gray-900/60 p-3.5 shadow-lg shadow-black/10 transition-all hover:border-gray-600/80 hover:bg-gray-900 ${isCurrentVideo ? 'ring-1 ring-indigo-500/30 bg-indigo-950/20' : ''}">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex items-start gap-3">
                    <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-xs font-bold text-indigo-200">${index + 1}</span>
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <h4 class="text-sm font-semibold text-white">片段 ${index + 1}</h4>
                            ${isCurrentVideo ? '<span class="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-200">当前视频</span>' : ''}
                        </div>
                        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            <span class="uppercase tracking-[0.18em] text-gray-500">来源视频</span>
                            <span class="video-source-tag" title="${safeVideoName}">${safeVideoName}</span>
                        </div>
                        <div class="clip-summary mt-2 text-xs text-gray-400">${summary}</div>
                    </div>
                </div>
            </div>

            <div class="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div class="flex flex-wrap gap-2">
                    <button onclick='window.playSegment(${seg.videoIndex}, ${safeSegIdArg})' class="inline-flex items-center gap-1.5 rounded-xl border border-gray-600 bg-gray-800/80 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:border-indigo-400/40 hover:bg-gray-700 hover:text-white" title="播放预览">
                        <i data-lucide="play" class="w-3.5 h-3.5"></i> 预览
                    </button>
                    <button onclick="window.pauseSegment()" class="inline-flex items-center gap-1.5 rounded-xl border border-gray-600 bg-gray-800/80 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-700 hover:text-white" title="暂停">
                        <i data-lucide="pause" class="w-3.5 h-3.5"></i> 暂停
                    </button>
                </div>
                <div class="flex flex-wrap gap-2 xl:justify-end">
                    <button onclick='window.exportSingleAudio(${seg.videoIndex}, ${safeSegIdArg}, ${index+1})' class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500 hover:text-white" title="导出音频">
                        <i data-lucide="music" class="w-3.5 h-3.5"></i> 音频
                    </button>
                    <button onclick='window.smartExportSingleVideo(${seg.videoIndex}, ${safeSegIdArg}, ${index+1})' class="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-500 hover:text-white" title="导出视频">
                        <i data-lucide="download" class="w-3.5 h-3.5"></i> 视频
                    </button>
                    <button onclick='window.removeSegment(${seg.videoIndex}, ${safeSegIdArg})' class="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-500 hover:text-white" title="删除选区">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> 删除片段
                    </button>
                </div>
            </div>
        </article>
    `;
}

export function setWaveformCallbacks(callbacks) {
    if (callbacks.renderAllSegments) renderAllSegmentsCallback = callbacks.renderAllSegments;
    if (callbacks.updateTranscriptionHighlight) updateTranscriptionHighlightCallback = callbacks.updateTranscriptionHighlight;
}

export function renderAllSegments() {
    saveCurrentSegments();
    AppState.allSegments = [];
    AppState.videoFiles.forEach((v, vIdx) => {
        const videoSegments = [...v.segments]
            .sort((a, b) => a.start - b.start)
            .map(seg => ({
                ...seg, videoIndex: vIdx, videoName: v.name, videoFile: v.file, videoObjectURL: v.objectURL
            }));
        AppState.allSegments = AppState.allSegments.concat(videoSegments);
    });
    AppState.allSegments.sort((a, b) => a.videoIndex !== b.videoIndex ? a.videoIndex - b.videoIndex : a.start - b.start);
    
    const segmentsList = document.getElementById('segmentsListContainer');
    const totalDurationDisplay = document.getElementById('totalDurationDisplay');
    const totalDurationValue = document.getElementById('totalDurationValue');
    const segmentsCountBadge = document.getElementById('segmentsCountBadge');
    const smartMergeVideoBtn = document.getElementById('smartMergeVideoBtn');
    const batchAudioBtn = document.getElementById('batchAudioBtn');
    const mergeAudioBtn = document.getElementById('mergeAudioBtn');
    const smartBatchVideoBtn = document.getElementById('smartBatchVideoBtn');
    
    const hasRegions = AppState.allSegments.length > 0;
    const hasMultiple = AppState.allSegments.length > 1;
    
    if (batchAudioBtn) batchAudioBtn.disabled = !hasRegions;
    if (smartBatchVideoBtn) smartBatchVideoBtn.disabled = !hasRegions;
    if (mergeAudioBtn) mergeAudioBtn.disabled = !hasMultiple;
    if (smartMergeVideoBtn) smartMergeVideoBtn.disabled = !hasMultiple;
    
    if (hasRegions) {
        let totalDur = 0;
        AppState.allSegments.forEach(s => totalDur += (s.end - s.start));
        if (totalDurationValue) totalDurationValue.textContent = formatTime(totalDur);
        if (totalDurationDisplay) totalDurationDisplay.classList.remove('hidden');
    } else {
        if (totalDurationDisplay) totalDurationDisplay.classList.add('hidden');
    }
    if (segmentsCountBadge) segmentsCountBadge.textContent = String(AppState.allSegments.length);
    
    if (!hasRegions) {
        segmentsList.innerHTML = `
            <div class="rounded-2xl border border-dashed border-gray-700 bg-gray-950/40 px-4 py-10 text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-gray-500">
                    <i data-lucide="layers" class="w-5 h-5"></i>
                </div>
                <p class="mt-4 text-sm font-medium text-gray-300">还没有已选片段</p>
                <p class="mt-2 text-xs leading-6 text-gray-500">在左侧波形图里拖拽选择，片段会按卡片形式整理到这里。</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    segmentsList.innerHTML = AppState.allSegments.map((seg, index) => buildSegmentCard(seg, index)).join('');
    lucide.createIcons();
}

window.playSegment = (vIdx, segId) => {
    if (vIdx !== AppState.currentVideoIndex) {
        saveCurrentSegments();
        if (switchToVideoCallback) switchToVideoCallback(vIdx);
        setTimeout(() => {
            const seg = AppState.videoFiles[vIdx].segments.find(s => s.id === segId);
            if (seg) {
                const videoPlayer = document.getElementById('videoPlayer');
                videoPlayer.currentTime = seg.start;
                videoPlayer.play();
            }
        }, 500);
    } else {
        const seg = AppState.videoFiles[vIdx].segments.find(s => s.id === segId);
        if (seg) {
            const videoPlayer = document.getElementById('videoPlayer');
            videoPlayer.currentTime = seg.start;
            videoPlayer.play();
        }
    }
};

window.pauseSegment = () => {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.pause();
};

window.removeSegment = (vIdx, segId) => {
    if (vIdx === AppState.currentVideoIndex) {
        const r = AppState.wsRegions.getRegions().find(x => x.id === segId);
        if (r) r.remove();
    } else {
        const segIdx = AppState.videoFiles[vIdx].segments.findIndex(s => s.id === segId);
        if (segIdx !== -1) {
            AppState.videoFiles[vIdx].segments.splice(segIdx, 1);
            renderAllSegments();
        }
    }
};

export function highlightRegionAtTime(start, end) {
    if (!AppState.wsRegions) return;
    clearHighlightRegion();
    const duration = AppState.wavesurfer.getDuration();
    const safeStart = Math.max(0, Math.min(start, duration - 0.1));
    const safeEnd = Math.max(safeStart + 0.1, Math.min(end, duration));
    AppState.highlightRegion = AppState.wsRegions.addRegion({
        start: safeStart, end: safeEnd, color: 'rgba(147, 51, 234, 0.2)', drag: false, resize: false, isHighlight: true
    });
}

export function clearHighlightRegion() {
    if (AppState.highlightRegion) {
        AppState.highlightRegion.remove();
        AppState.highlightRegion = null;
    }
}

export function addRegionAtTime(start, end, color = 'rgba(147, 51, 234, 0.4)') {
    if (!AppState.wsRegions) return;
    const duration = AppState.wavesurfer.getDuration();
    const safeStart = Math.max(0, Math.min(start, duration - 0.1));
    const safeEnd = Math.max(safeStart + 0.1, Math.min(end, duration));
    if (checkRegionOverlap({ start: safeStart, end: safeEnd, id: `temp_${Date.now()}` })) return;
    const region = AppState.wsRegions.addRegion({ start: safeStart, end: safeEnd, color: color, drag: true, resize: true });
    region.lastValidStart = region.start;
    region.lastValidEnd = region.end;
    document.getElementById('videoPlayer').currentTime = safeStart;
    renderAllSegments();
}

export function initWaveSurfer(url, savedSegments = []) {
    if (AppState.wavesurfer) {
        AppState.wavesurfer.destroy();
        AppState.wavesurfer = null;
        AppState.wsRegions = null;
    }
    AppState.currentZoom = 1;
    const waveformLoading = document.getElementById('waveformLoading');
    const waveformProgressText = document.getElementById('waveformProgressText');
    waveformLoading.classList.remove('hidden');
    waveformProgressText.textContent = '正在解析音频流...';

    const WaveSurfer = window.WaveSurfer;
    const RegionsPlugin = window.RegionsPlugin;
    const TimelinePlugin = window.TimelinePlugin;
    const HoverPlugin = window.HoverPlugin;

    AppState.wavesurfer = WaveSurfer.create({
        container: '#waveform', 
        waveColor: '#4F46E5', 
        progressColor: '#818CF8', 
        url: url, 
        media: document.getElementById('videoPlayer'),
        height: 120, 
        barWidth: 2, 
        barGap: 1, 
        barRadius: 2, 
        cursorColor: '#F87171',
        plugins: [
            TimelinePlugin.create({ container: '#timeline', height: 20, style: { color: '#9CA3AF' } }),
            HoverPlugin.create({ lineBaseColor: '#ffffff', lineWidth: 2, labelBackground: '#111827', labelColor: '#fff' })
        ]
    });
    
    AppState.wsRegions = AppState.wavesurfer.registerPlugin(RegionsPlugin.create());
    AppState.wsRegions.enableDragSelection({ color: 'rgba(99, 102, 241, 0.4)' });

    AppState.wavesurfer.on('loading', (percent) => {
        waveformLoading.classList.remove('hidden');
        waveformProgressText.textContent = `正在生成波形视图 ${percent}% ...`;
    });

    AppState.wavesurfer.on('decode', () => {
        waveformLoading.classList.add('hidden');
        if (savedSegments.length > 0) {
            savedSegments.forEach(seg => {
                const region = AppState.wsRegions.addRegion({ start: seg.start, end: seg.end, color: seg.color, drag: true, resize: true });
                region.lastValidStart = seg.start;
                region.lastValidEnd = seg.end;
            });
        }
        renderAllSegments();
        document.getElementById('transcribeBtn').disabled = false;
    });

    AppState.wsRegions.on('region-created', (region) => {
        if (region.isHighlight) return;
        
        region.lastValidStart = region.start;
        region.lastValidEnd = region.end;
        const hasTranscription = AppState.transcriptionResult && AppState.transcriptionResult.chunks && AppState.transcriptionResult.chunks.length > 0;
        if (!region.isRestoring && hasTranscription) {
            AppState.isPreviewMode = true;
            AppState.pendingPreviewRegion = region;
            if (updateTranscriptionHighlightCallback) updateTranscriptionHighlightCallback();
        } else {
            renderAllSegments();
            if (window.saveCurrentWorkspace) window.saveCurrentWorkspace();
        }
    });
    
    AppState.wsRegions.on('region-update', (region, side) => {
        beginRegionUpdateSession(region, side);
        if (AppState.transcriptionResult && AppState.transcriptionResult.chunks && updateTranscriptionHighlightCallback) {
            updateTranscriptionHighlightCallback({ start: region.start, end: region.end });
        }
    });
    
    AppState.wsRegions.on('region-updated', (region, side) => {
        const snapped = resolveRegionUpdateBounds(
            { start: region.start, end: region.end },
            getSiblingSegments(region.id),
            {
                mode: getRegionUpdateMode(region, side ?? region.lastUpdateSide),
                minDuration: 0.1,
                originalDuration: region.dragStartState ? (region.dragStartState.end - region.dragStartState.start) : (region.end - region.start),
                originalStart: region.dragStartState?.start,
                originalEnd: region.dragStartState?.end
            }
        );

        commitResolvedBounds(region, snapped);
        endRegionUpdateSession(region);
        if (!AppState.isPreviewMode) {
            renderAllSegments();
            if (AppState.transcriptionResult && AppState.transcriptionResult.chunks && updateTranscriptionHighlightCallback) {
                updateTranscriptionHighlightCallback();
            }
            if (window.saveCurrentWorkspace) window.saveCurrentWorkspace();
        }
    });
    
    AppState.wsRegions.on('region-removed', (region) => {
        if (region && region.isHighlight) return;
        
        renderAllSegments();
        if (AppState.transcriptionResult && AppState.transcriptionResult.chunks && updateTranscriptionHighlightCallback) {
            updateTranscriptionHighlightCallback();
        }
        if (window.saveCurrentWorkspace) window.saveCurrentWorkspace();
    });
    AppState.wsRegions.on('region-clicked', (region, e) => { e.stopPropagation(); });
    
    document.getElementById('waveform').addEventListener('wheel', (e) => {
        if (e.ctrlKey && AppState.wavesurfer) {
            e.preventDefault();
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, AppState.currentZoom * (e.deltaY > 0 ? 0.9 : 1.1)));
            AppState.currentZoom = newZoom;
            AppState.wavesurfer.zoom(newZoom);
        }
    }, { passive: false });
}
