import { AppState } from './state.js';
import { escapeHTML, resolveSrtContent } from './utils.js';
import { highlightRegionAtTime, clearHighlightRegion, addRegionAtTime, renderAllSegments } from './waveform.js';
import { renderTranscriptionText, updateTranscriptionHighlight } from './transcription.js';

function getRenderableChunks() {
    if (Array.isArray(AppState.transcriptionResult?.displayChunks) && AppState.transcriptionResult.displayChunks.length > 0) {
        return AppState.transcriptionResult.displayChunks;
    }
    if (Array.isArray(AppState.transcriptionResult?.chunks) && AppState.transcriptionResult.chunks.length > 0) {
        return AppState.transcriptionResult.chunks;
    }
    return [];
}

export async function callLLM(prompt, systemPrompt = 'You are a helpful assistant.') {
    if (!AppState.llmConfig.apiKey) throw new Error('请先配置 LLM API Key');
    const apiUrl = AppState.llmConfig.apiUrl.endsWith('/chat/completions') ? AppState.llmConfig.apiUrl : AppState.llmConfig.apiUrl.replace(/\/$/, '') + '/chat/completions';
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AppState.llmConfig.apiKey}` },
        body: JSON.stringify({ model: AppState.llmConfig.model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], temperature: 0.3 })
    });
    if (!response.ok) throw new Error(`LLM API 调用失败: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
}

export async function removeFillerWords() {
    const chunks = getRenderableChunks();
    if (chunks.length === 0) { console.log('没有可用的语音识别内容'); return; }
    const removeFillerBtn = document.getElementById('removeFillerBtn');
    removeFillerBtn.disabled = true;
    removeFillerBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> 处理中...';
    lucide.createIcons();
    
    try {
        const chunkTexts = chunks.map((c, idx) => `${idx}|${c.text}`).join('\n');
        const llmResponse = await callLLM(`请仔细分析以下按行编号的语音识别文本片段，只标记那些明显是纯粹语气词或填充词的片段。只返回需要删除的行号，用英文逗号分隔，如果没有需要删除的，返回 "NONE"。\n\n文本片段（格式：行号|文本）：\n${chunkTexts}`, '你是一个非常谨慎的文本编辑助手。');
        
        AppState.deletionMap = new Set();
        let deletedCount = 0;
        if (llmResponse.trim() !== 'NONE') {
            const indices = llmResponse.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n < chunks.length);
            indices.forEach(idx => { AppState.deletionMap.add(idx); deletedCount++; });
        }
        console.log(`智能分析完成，标记了 ${deletedCount} 个片段`);
        renderMarkedTranscription();
    } catch (err) {
        console.log(`[错误] 分析失败: ${err.message}`);
    } finally {
        removeFillerBtn.disabled = false;
        removeFillerBtn.innerHTML = '<i data-lucide="sparkles" class="w-3 h-3"></i> 智能去水词';
        lucide.createIcons();
    }
}

function renderMarkedTranscription() {
    const chunks = getRenderableChunks();
    if (chunks.length === 0) return;
    const transcriptionText = document.getElementById('transcriptionText');
    let html = `<div class="text-cyan-300 mb-2 text-xs flex items-center gap-1"><i data-lucide="sparkles" class="w-3 h-3"></i>点击任意词可切换是否删除，确认后自动选择保留区域</div>`;
    html += `<div class="flex items-center gap-2 mb-2"><button id="confirmDeletionsBtn" class="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-1 transition-colors"><i data-lucide="check" class="w-3 h-3"></i>确认删除并选择区域</button>`;
    html += `<button id="cancelMarksBtn" class="text-xs px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded flex items-center gap-1 transition-colors"><i data-lucide="x" class="w-3 h-3"></i>取消</button></div>`;
    html += `<div id="markedTranscriptionContainer" class="text-sm text-gray-200 leading-relaxed p-3 bg-gray-900/50 rounded max-h-48 overflow-y-auto">`;
    
    chunks.forEach((chunk, idx) => {
        if (chunk.text) {
            const isDeleted = AppState.deletionMap.has(idx);
            html += `<span class="filler-token cursor-pointer hover:bg-purple-600/30 rounded px-0.5 select-none transition-colors ${isDeleted ? 'line-through text-red-400 bg-red-900/30' : ''}" data-start="${chunk.timestamp[0]}" data-end="${chunk.timestamp[1]}" data-idx="${idx}">${escapeHTML(chunk.text)}</span>`;
        }
    });
    
    html += `</div>`;
    transcriptionText.innerHTML = html;
    lucide.createIcons();
    
    transcriptionText.querySelectorAll('.filler-token').forEach(span => {
        span.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tokenIdx = parseInt(span.dataset.idx);
            if (AppState.deletionMap.has(tokenIdx)) {
                AppState.deletionMap.delete(tokenIdx);
                span.classList.remove('line-through', 'text-red-400', 'bg-red-900/30');
            } else {
                AppState.deletionMap.add(tokenIdx);
                span.classList.add('line-through', 'text-red-400', 'bg-red-900/30');
            }
        });
        span.addEventListener('mouseenter', () => {
            const start = parseFloat(span.dataset.start);
            const end = parseFloat(span.dataset.end);
            if (!isNaN(start) && !isNaN(end)) highlightRegionAtTime(start, end);
        });
        span.addEventListener('mouseleave', () => { if (AppState.isPreviewMode) return; clearHighlightRegion(); });
    });
    
    const confirmDeletionsBtn = document.getElementById('confirmDeletionsBtn');
    const cancelMarksBtn = document.getElementById('cancelMarksBtn');
    
    if (confirmDeletionsBtn) {
        confirmDeletionsBtn.addEventListener('click', confirmDeletions);
    }
    if (cancelMarksBtn) {
        cancelMarksBtn.addEventListener('click', () => { 
            AppState.deletionMap.clear(); 
            renderTranscriptionText(AppState.transcriptionResult); 
        });
    }
}

function confirmDeletions() {
    const chunks = getRenderableChunks();
    if (chunks.length === 0) return;
    
    if (AppState.wsRegions) {
        AppState.wsRegions.getRegions().forEach(r => r.remove());
    }
    if (AppState.currentVideoIndex >= 0 && AppState.videoFiles[AppState.currentVideoIndex]) {
        AppState.videoFiles[AppState.currentVideoIndex].segments = [];
    }
    
    const regionsToCreate = [];
    let currentRegion = null;
    
    for (let i = 0; i < chunks.length; i++) {
        if (!AppState.deletionMap.has(i)) {
            const start = chunks[i].timestamp[0];
            const end = chunks[i].timestamp[1];
            if (currentRegion === null) currentRegion = { startIdx: i, endIdx: i, start, end };
            else if (i === currentRegion.endIdx + 1) { currentRegion.endIdx = i; currentRegion.end = end; }
            else { regionsToCreate.push(currentRegion); currentRegion = { startIdx: i, endIdx: i, start, end }; }
        }
    }
    if (currentRegion !== null) regionsToCreate.push(currentRegion);
    
    regionsToCreate.forEach(region => addRegionAtTime(region.start, region.end, 'rgba(99, 102, 241, 0.4)'));
    console.log(`已自动创建 ${regionsToCreate.length} 个保留区域`);
    AppState.deletionMap.clear();
    renderAllSegments();
    updateTranscriptionHighlight();
    renderTranscriptionText(AppState.transcriptionResult);
}

export async function translateToBilingual() {
    if (getRenderableChunks().length === 0) { console.log('没有可用的语音识别内容'); return; }
    const translateBtn = document.getElementById('translateBtn');
    translateBtn.disabled = true;
    translateBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> 翻译中...';
    lucide.createIcons();
    
    try {
        const srtContent = resolveSrtContent(AppState.transcriptionResult);
        if (!srtContent) throw new Error('无法生成 SRT 内容');
        const targetLang = AppState.llmConfig.targetLang;
        const translatedSrt = await callLLM(`请将以下 SRT 字幕翻译成${targetLang}，保持 SRT 格式不变。每一条字幕的内容部分要显示双语，格式为：原文\\n译文\n\nSRT 内容：\n${srtContent}`, `你是一个专业的字幕翻译助手。请将 SRT 字幕翻译成${targetLang}，并保持 SRT 格式不变。`);
        
        console.log('双语翻译完成');
        AppState.bilingualSrtContent = translatedSrt;
        document.getElementById('downloadBilingualSrtBtn').classList.remove('hidden');
        document.getElementById('transcriptionText').innerHTML = `<div class="text-emerald-300 mb-2 text-xs flex items-center gap-1"><i data-lucide="languages" class="w-3 h-3"></i>已处理 - 双语翻译</div><pre class="text-xs text-gray-300 bg-gray-900/50 p-2 rounded overflow-auto max-h-48">${escapeHTML(translatedSrt.substring(0, 1000))}${translatedSrt.length > 1000 ? '...' : ''}</pre>`;
        lucide.createIcons();
    } catch (err) {
        console.log(`[错误] 翻译失败: ${err.message}`);
    } finally {
        translateBtn.disabled = false;
        translateBtn.innerHTML = '<i data-lucide="languages" class="w-3 h-3"></i> 双语翻译';
        lucide.createIcons();
    }
}
