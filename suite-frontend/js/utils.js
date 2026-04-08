export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function escapeHTML(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function formatSrtTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function getRenderableChunks(transcriptionResult) {
    if (!transcriptionResult) return [];
    if (Array.isArray(transcriptionResult.displayChunks) && transcriptionResult.displayChunks.length > 0) {
        return transcriptionResult.displayChunks;
    }
    if (Array.isArray(transcriptionResult.chunks) && transcriptionResult.chunks.length > 0) {
        return transcriptionResult.chunks;
    }
    return [];
}

export function generateSrtContent(transcriptionResult) {
    const chunks = getRenderableChunks(transcriptionResult);
    if (chunks.length === 0) return null;

    const hasSubtitleStyleChunks = Array.isArray(transcriptionResult?.displayChunks) && transcriptionResult.displayChunks.length > 0;
    if (hasSubtitleStyleChunks) {
        return chunks
            .filter((chunk) => chunk?.text && Array.isArray(chunk.timestamp))
            .map((chunk, index) => {
                const [start, end] = chunk.timestamp;
                return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${chunk.text.trim()}\n`;
            })
            .join('\n');
    }
    
    let srtContent = '';
    let subtitleIndex = 1;
    let currentText = '';
    let currentStart = null;
    let currentEnd = null;
    const maxChars = 15;
    
    const punctChars = ['。', '？', '！', '，', '.', '?', '!', ','];
    
    const flushSubtitle = () => {
        if (currentText.trim()) {
            let text = currentText.trim();
            while (punctChars.includes(text.charAt(text.length - 1))) {
                text = text.slice(0, -1);
            }
            if (text) {
                srtContent += `${subtitleIndex}\n`;
                srtContent += `${formatSrtTime(currentStart)} --> ${formatSrtTime(currentEnd)}\n`;
                srtContent += `${text}\n\n`;
                subtitleIndex++;
            }
        }
        currentText = '';
        currentStart = null;
    };
    
    chunks.forEach((chunk, idx) => {
        const text = chunk.text || '';
        const start = chunk.timestamp[0];
        const end = chunk.timestamp[1];
        
        if (currentStart === null) currentStart = start;
        currentEnd = end;
        currentText += text;
        
        const shouldFlush = punctChars.includes(text) || 
                           currentText.length >= maxChars || 
                           idx === chunks.length - 1;
        
        if (shouldFlush) {
            flushSubtitle();
        }
    });
    
    return srtContent;
}

export function resolveSrtContent(transcriptionResult) {
    if (transcriptionResult?.srt) {
        return transcriptionResult.srt;
    }
    return generateSrtContent(transcriptionResult);
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function downloadSrt(transcriptionResult) {
    const srtContent = resolveSrtContent(transcriptionResult);
    if (!srtContent) { console.log('没有可用的字幕内容'); return; }
    downloadBlob(new Blob([srtContent], { type: 'text/plain;charset=utf-8' }), `subtitle_${Date.now()}.srt`);
    console.log('SRT 字幕文件已下载');
}

export function downloadBilingualSrt(bilingualSrtContent) {
    if (!bilingualSrtContent) { console.log('没有可用的双语字幕内容'); return; }
    downloadBlob(new Blob([bilingualSrtContent], { type: 'text/plain;charset=utf-8' }), `bilingual_subtitle_${Date.now()}.srt`);
    console.log('双语字幕文件已下载');
}

export function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = buffer.length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(arrayBuffer);
    
    const writeString = (offset, string) => { for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i)); };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    const channels = [];
    for (let i = 0; i < numChannels; i++) channels.push(buffer.getChannelData(i));
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, channels[channel][i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }
    return new Blob([arrayBuffer], { type: 'audio/wav' });
}
