import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Loader2, Music, X } from 'lucide-react';

interface AudioTrimmerModalProps {
  file: File;
  minDuration: number;
  maxDuration: number;
  isOpen: boolean;
  onConfirm: (trimmedFile: File) => void;
  onCancel: () => void;
}

type TrimmerStatus = 'loading' | 'ready' | 'rendering' | 'error';

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });

const getAudioContext = () => {
  const ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctor) throw new Error('当前浏览器不支持音频处理');
  return new ctor();
};

const getAudioDuration = async (file: File): Promise<number> => {
  const url = URL.createObjectURL(file);
  try {
    const audio = new Audio(url);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        URL.revokeObjectURL(url);
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('error', onError);
      };
      const onLoaded = () => {
        cleanup();
        resolve(audio.duration);
      };
      const onError = () => {
        cleanup();
        reject(new Error('无法读取音频时长'));
      };
      audio.addEventListener('loadedmetadata', onLoaded);
      audio.addEventListener('error', onError);
      if (audio.readyState >= 1) onLoaded();
    });
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('无法读取音频时长');
  }
};

const decodeAudioFile = async (file: File): Promise<AudioBuffer> => {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const ctx = getAudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
};

const computeWaveform = (buffer: AudioBuffer, bars: number): Float32Array => {
  const peaks = new Float32Array(bars);
  if (!buffer.numberOfChannels || !buffer.length) return peaks;
  const channel = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channel.length / bars));
  for (let i = 0; i < bars; i++) {
    let max = 0;
    const start = i * step;
    const end = Math.min(start + step, channel.length);
    for (let j = start; j < end; j++) {
      const value = Math.abs(channel[j]);
      if (value > max) max = value;
    }
    peaks[i] = max;
  }
  return peaks;
};

const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const sampleRate = buffer.sampleRate;

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + buffer.length * numOfChan * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numOfChan * 2, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, buffer.length * numOfChan * 2, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numOfChan; c++) {
      let sample = buffer.getChannelData(c)[i];
      sample = Math.max(-1, Math.min(1, sample));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  return out;
};

const trimAudioBuffer = async (
  buffer: AudioBuffer,
  start: number,
  duration: number,
  originalName: string
): Promise<File> => {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(start * sampleRate));
  const endSample = Math.min(buffer.length, startSample + Math.floor(duration * sampleRate));
  const frames = Math.max(0, endSample - startSample);

  const offline = new OfflineAudioContext(buffer.numberOfChannels, frames, sampleRate);
  const segment = offline.createBuffer(buffer.numberOfChannels, frames, sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = segment.getChannelData(c);
    for (let i = 0; i < frames; i++) {
      dst[i] = src[startSample + i];
    }
    segment.copyToChannel(dst, c);
  }

  const source = offline.createBufferSource();
  source.buffer = segment;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  const wavArrayBuffer = audioBufferToWav(rendered);
  const blob = new Blob([wavArrayBuffer], { type: 'audio/wav' });
  const name = originalName.replace(/\.[^/.]+$/, '') + '.wav';
  return new File([blob], name, { type: 'audio/wav', lastModified: Date.now() });
};

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const AudioTrimmerModal: React.FC<AudioTrimmerModalProps> = ({
  file,
  minDuration,
  maxDuration,
  isOpen,
  onConfirm,
  onCancel,
}) => {
  const [status, setStatus] = useState<TrimmerStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [waveform, setWaveform] = useState<Float32Array | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const dragStateRef = useRef<{
    mode: 'left' | 'right' | 'window' | null;
    startX: number;
    startTime: number;
    startEnd: number;
  }>({ mode: null, startX: 0, startTime: 0, startEnd: 0 });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setStatus('loading');
    setErrorMessage(null);
    setPreviewPlaying(false);

    const load = async () => {
      try {
        const totalDuration = await getAudioDuration(file);
        if (cancelled) return;
        if (!isFinite(totalDuration) || totalDuration <= 0) {
          throw new Error('无法解析音频时长');
        }
        const buffer = await decodeAudioFile(file);
        if (cancelled) return;
        const actualDuration = Math.max(totalDuration, buffer.duration);
        const peaks = computeWaveform(buffer, 240);
        if (cancelled) return;
        setDuration(actualDuration);
        setAudioBuffer(buffer);
        setWaveform(peaks);
        const selectionLength = Math.min(maxDuration, Math.max(minDuration, actualDuration));
        const defaultStart = Math.max(0, (actualDuration - selectionLength) / 2);
        setStart(defaultStart);
        setEnd(Math.min(actualDuration, defaultStart + selectionLength));
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : '音频解码失败');
        setStatus('error');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, file, maxDuration, minDuration]);

  useEffect(() => {
    if (!isOpen) return;
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onended = () => setPreviewPlaying(false);
    previewAudioRef.current = audio;
    previewUrlRef.current = url;
    return () => {
      audio.pause();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewAudioRef.current = null;
      previewUrlRef.current = null;
    };
  }, [isOpen, file]);

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio || !previewPlaying) return;
    const id = window.setInterval(() => {
      if (audio.currentTime >= end - 0.05) {
        audio.pause();
        audio.currentTime = start;
        setPreviewPlaying(false);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [previewPlaying, start, end]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const peaks = waveform;
    if (!canvas || !container || !peaks || !duration) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const bars = peaks.length;
    const barWidth = width / bars;
    const gap = 1;

    const startBar = Math.floor((start / duration) * bars);
    const endBar = Math.min(bars, Math.ceil((end / duration) * bars));

    for (let i = 0; i < bars; i++) {
      const amp = peaks[i];
      const barHeight = Math.max(2, amp * height * 0.85);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      const inSelection = i >= startBar && i < endBar;
      ctx.fillStyle = inSelection ? 'rgba(59, 130, 246, 0.95)' : 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(x + gap / 2, y, Math.max(1, barWidth - gap), barHeight);
    }

    const leftX = (start / duration) * width;
    const rightX = (end / duration) * width;

    // 选区遮罩
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.fillRect(leftX, 0, rightX - leftX, height);

    // 左右手柄
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(leftX - 1, 0, 2, height);
    ctx.fillRect(rightX - 1, 0, 2, height);

    const handleRadius = 6;
    ctx.beginPath();
    ctx.arc(leftX, height / 2, handleRadius, 0, Math.PI * 2);
    ctx.arc(rightX, height / 2, handleRadius, 0, Math.PI * 2);
    ctx.fill();

    // 时间刻度
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(formatTime(0), 8, height - 8);
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(duration / 2), width / 2, height - 8);
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(duration), width - 8, height - 8);

    ctx.restore();
  }, [duration, start, end, waveform]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const clampStart = useCallback(
    (value: number, currentEnd: number) =>
      Math.max(0, Math.min(value, Math.max(0, currentEnd - minDuration))),
    [minDuration]
  );

  const clampEnd = useCallback(
    (value: number, currentStart: number) =>
      Math.min(duration, Math.max(currentStart + minDuration, value)),
    [duration, minDuration]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (status !== 'ready' || !duration) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const leftX = (start / duration) * rect.width;
    const rightX = (end / duration) * rect.width;
    const handleThreshold = 12;

    let mode: 'left' | 'right' | 'window' | null = null;
    if (Math.abs(x - leftX) <= handleThreshold) {
      mode = 'left';
    } else if (Math.abs(x - rightX) <= handleThreshold) {
      mode = 'right';
    } else if (x > leftX && x < rightX) {
      mode = 'window';
    }

    if (!mode) {
      // 点击空白处：以点击位置居中跳转选区，保持当前选区长度
      const time = (x / rect.width) * duration;
      const length = Math.max(minDuration, Math.min(maxDuration, end - start));
      const half = length / 2;
      let newStart = time - half;
      newStart = Math.max(0, Math.min(duration - length, newStart));
      setStart(newStart);
      setEnd(newStart + length);
      return;
    }

    dragStateRef.current = { mode, startX: e.clientX, startTime: start, startEnd: end };
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { mode } = dragStateRef.current;
    if (!mode || !duration) return;
    e.preventDefault();

    const rect = containerRef.current!.getBoundingClientRect();
    const deltaPixels = e.clientX - dragStateRef.current.startX;
    const deltaTime = (deltaPixels / rect.width) * duration;

    if (mode === 'window') {
      const length = dragStateRef.current.startEnd - dragStateRef.current.startTime;
      const newStart = Math.max(0, Math.min(duration - length, dragStateRef.current.startTime + deltaTime));
      setStart(newStart);
      setEnd(newStart + length);
    } else if (mode === 'left') {
      const newStart = clampStart(dragStateRef.current.startTime + deltaTime, end);
      const minStart = Math.max(0, end - maxDuration);
      setStart(Math.max(newStart, minStart));
    } else if (mode === 'right') {
      const newEnd = clampEnd(dragStateRef.current.startEnd + deltaTime, start);
      const maxEnd = Math.min(duration, start + maxDuration);
      setEnd(Math.min(newEnd, maxEnd));
    }
  };

  const handlePointerUp = () => {
    dragStateRef.current = { mode: null, startX: 0, startTime: 0, startEnd: 0 };
  };

  const togglePreview = async () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (previewPlaying) {
      audio.pause();
      setPreviewPlaying(false);
      return;
    }
    audio.currentTime = start;
    try {
      await audio.play();
      setPreviewPlaying(true);
    } catch {
      setPreviewPlaying(false);
    }
  };

  const handleConfirm = async () => {
    if (!audioBuffer || status !== 'ready') return;
    setStatus('rendering');
    try {
      const trimmed = await trimAudioBuffer(audioBuffer, start, Math.max(minDuration, Math.min(maxDuration, end - start)), file.name);
      setStatus('ready');
      onConfirm(trimmed);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '截取失败');
      setStatus('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#141414] shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-300">
                <Music size={18} />
              </div>
              <h3 className="text-lg font-bold text-white">音频长度超过 {maxDuration} 秒</h3>
            </div>
            <p className="text-sm text-white/50 mt-1">
              请拖动选区保留 {minDuration}~{maxDuration} 秒片段，未选中部分将被舍弃。
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {status === 'loading' && (
          <div className="h-48 rounded-xl border border-white/10 bg-black/40 flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="animate-spin text-blue-400" />
            <span className="text-sm text-white/50">正在解析音频...</span>
          </div>
        )}

        {status === 'error' && (
          <div className="h-48 rounded-xl border border-red-500/20 bg-red-500/10 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="text-sm text-red-200">{errorMessage || '音频处理失败'}</span>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 text-sm transition-colors"
            >
              关闭
            </button>
          </div>
        )}

        {(status === 'ready' || status === 'rendering') && (
          <>
            <div
              ref={containerRef}
              className="relative h-44 rounded-xl border border-white/10 bg-black/40 overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
              <div className="absolute top-2 left-3 text-[11px] font-semibold text-blue-200 tabular-nums bg-black/40 px-2 py-0.5 rounded">
                选区 {formatTime(start)} - {formatTime(end)}
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <button
                type="button"
                onClick={togglePreview}
                disabled={status === 'rendering'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/90 text-sm transition-colors disabled:opacity-50"
              >
                {previewPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                {previewPlaying ? '暂停预览' : '播放选区'}
              </button>
              <div className="text-xs text-white/40 tabular-nums">
                总时长 {formatTime(duration)} · 选区时长 {formatTime(Math.max(0, end - start))}
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={status === 'rendering'}
            className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white/80 text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={status !== 'ready'}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold border border-blue-500/60 shadow-md transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {status === 'rendering' && <Loader2 size={14} className="animate-spin" />}
            {status === 'rendering' ? '截取中...' : '确认截取'}
          </button>
        </div>
      </div>
    </div>
  );
};

export interface AudioTrimmerState {
  trimIfNeeded: (file: File) => Promise<File>;
  modal: React.ReactNode;
}

export const useAudioTrimmer = (maxDuration = 12, minDuration = 5): AudioTrimmerState => {
  const [pending, setPending] = useState<{ file: File; resolve: (file: File) => void; reject: (reason?: unknown) => void } | null>(null);

  const trimIfNeeded = useCallback(
    async (file: File): Promise<File> => {
      const duration = await getAudioDuration(file);
      if (duration < minDuration) {
        throw new Error(`音频时长不足 ${minDuration} 秒，请上传更长的音频`);
      }
      if (duration <= maxDuration) return file;
      return new Promise<File>((resolve, reject) => {
        setPending({ file, resolve, reject });
      });
    },
    [maxDuration, minDuration]
  );

  const handleConfirm = useCallback(
    (trimmedFile: File) => {
      pending?.resolve(trimmedFile);
      setPending(null);
    },
    [pending]
  );

  const handleCancel = useCallback(() => {
    pending?.reject(new Error('用户取消截取'));
    setPending(null);
  }, [pending]);

  const modal = pending ? (
    <AudioTrimmerModal
      file={pending.file}
      minDuration={minDuration}
      maxDuration={maxDuration}
      isOpen
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { trimIfNeeded, modal };
};

export default AudioTrimmerModal;
