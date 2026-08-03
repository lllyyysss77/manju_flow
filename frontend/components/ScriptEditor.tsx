
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Episode, Scene, SceneReference } from '../types';
import {
  Plus,
  MessageSquare,
  Save,
  AlertCircle,
  Pencil,
  Upload,
  X,
  RotateCcw,
  Maximize2,
  Smartphone,
  Check,
  Image as ImageIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Download,
  Lock,
  Unlock,
  Loader2
} from 'lucide-react';
import { Chapter, ChapterImportTask, ChapterImportTaskStatus, chapterApi, sceneApi, fileApi, commentApi, sceneReferenceApi, getFileUrl, downloadFile } from '../api';
import { useSceneComments } from './useSceneComments';
import { CommentItem } from './CommentItem';
import { CommentInput } from './CommentInput';
import { STATUS_MAP } from '../constants';
import { useScriptEditorReducer } from './useScriptEditorReducer';
import { usePanelResize } from './usePanelResize';

interface ScriptEditorProps {
  bookId: number;
  episodes?: Episode[];
  onEpisodesChange?: (episodes: Episode[]) => void;
  // 跨模块状态同步
  initialChapterId?: number | null;
  initialSceneId?: number | null;
  onActiveChapterChange?: (chapterId: number | null) => void;
  onActiveSceneChange?: (sceneId: number | null) => void;
}

const BRUSH_COLORS = [
  { name: '黑色', hex: '#000000' },
  { name: '红色', hex: '#ef4444' },
  { name: '蓝色', hex: '#3b82f6' },
  { name: '绿色', hex: '#22c55e' },
  { name: '黄色', hex: '#eab308' },
];

const BRUSH_SIZES = [
  { label: '小', value: 2 },
  { label: '中', value: 6 },
  { label: '大', value: 14 },
];

const formatTimestamp = (value?: string | Date | null) => {
  if (!value) return '暂无';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const markdownValue = (value?: string | null) => {
  const normalized = (value || '').trim();
  return normalized || '未填写';
};

const escapeMarkdownTitle = (value?: string | null) =>
  (value || '未命名').replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1');

const getExportTimestamp = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const CHAPTER_IMPORT_STATUS_TEXT: Record<ChapterImportTaskStatus, string> = {
  PENDING: '等待后台处理',
  ANALYZING: 'AI 正在分析脚本内容',
  IMPORTING: '分析完成，正在导入章节和场景',
  SUCCEEDED: '章节导入完成',
  FAILED: '章节导入失败',
};

const chapterToEpisode = (chapter: Chapter): Episode => ({
  id: chapter.id,
  title: chapter.title,
  index: chapter.index,
  synopsis: chapter.synopsis || '',
  status: chapter.status,
  scenes: (chapter.scenes || []).map(scene => ({
    ...scene,
    chapterId: scene.chapterId ?? chapter.id,
    description: scene.description || '',
    cameraMovement: scene.cameraMovement || '',
    dialogue: scene.dialogue || '',
    transitionEffect: scene.transitionEffect || '',
    comments: scene.comments || [],
  })).sort((a, b) => a.index - b.index),
});

const getExportFileStamp = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
};

const ReferenceSection: React.FC<{ 
  initialImage?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
  isUploading?: boolean;
  onUploadError?: (msg: string) => void;
  readOnly?: boolean;
}> = ({ initialImage, onUpload, onRemove, isUploading = false, onUploadError, readOnly = false }) => {
  const [mode, setMode] = useState<'NONE' | 'DRAW' | 'VIEW'>(initialImage ? 'VIEW' : 'NONE');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(6);
  const [isDrawing, setIsDrawing] = useState(false);
  const [localUploading, setLocalUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOverUpload, setDragOverUpload] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMode(initialImage ? 'VIEW' : 'NONE');
  }, [initialImage]);

  useEffect(() => {
    if (mode === 'DRAW') {
      initCanvas();
    }
  }, [mode, aspectRatio]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    }
  };

  const handleUpload = async (file: File) => {
    setError(null);
    setLocalUploading(true);
    try {
      await onUpload(file);
      setMode('VIEW');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败，请重试';
      setError(msg);
      onUploadError?.(msg);
    } finally {
      setLocalUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleDropUpload = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) {
      setDragOverUpload(false);
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
    setDragOverUpload(false);
  };

  const busy = isUploading || localUploading || readOnly;

  // 图片预览状态
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);

  // ESC 键关闭预览
  useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagePreview(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview]);

  if (mode === 'VIEW' && initialImage) {
    return (
      <>
        <div className="relative w-full bg-[#1a1a1a] rounded-2xl overflow-hidden border border-white/10 shadow-xl min-h-[300px] flex items-center justify-center">
          <img
            src={initialImage}
            className="max-w-full max-h-[500px] object-contain shadow-2xl cursor-zoom-in"
            alt="参考图"
            onClick={() => setImagePreview({ url: initialImage, title: '参考图' })}
          />
          {/* 右上角工具栏（与分镜模块一致） */}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); downloadFile(initialImage); }}
              className="p-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80"
              title="下载图片"
            >
              <Download size={14} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-[11px] rounded-lg bg-black/70 text-white/90 border border-white/10 shadow disabled:opacity-60 hover:bg-black/80"
              disabled={busy}
            >
              {busy ? '上传中...' : '重新上传'}
            </button>
            <button
              onClick={() => setMode('DRAW')}
              className="p-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80"
              title="切换为手绘"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onRemove}
              className="p-1.5 rounded-lg bg-black/70 text-red-400 border border-white/10 shadow hover:bg-black/80 hover:text-red-300"
              title="移除参考图"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {/* 图片预览弹窗（与分镜模块一致） */}
        {imagePreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setImagePreview(null)}
            />
            <div className="relative z-10 max-w-5xl w-full px-6">
              <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="text-sm font-semibold text-white">{imagePreview.title}</div>
                  <button
                    onClick={() => setImagePreview(null)}
                    className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="bg-black p-4 flex items-center justify-center">
                  <img
                    src={imagePreview.url}
                    alt={imagePreview.title}
                    className="max-h-[70vh] max-w-full object-contain rounded-lg border border-white/5"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (mode === 'NONE') {
    return (
      <div className="grid grid-cols-2 gap-6">
        <button 
          disabled={busy}
          onClick={() => !busy && fileInputRef.current?.click()}
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDragOverUpload(true);
          }}
          onDragEnter={e => {
            e.preventDefault();
            setDragOverUpload(true);
          }}
          onDragLeave={() => setDragOverUpload(false)}
          onDrop={handleDropUpload}
          className={`flex flex-col items-center justify-center gap-4 p-12 bg-[#1a1a1a] border-2 border-dashed rounded-2xl hover:bg-white/5 hover:border-blue-500/30 transition-all group disabled:opacity-60 ${
            dragOverUpload ? 'border-blue-500/50 bg-blue-900/20' : 'border-white/5'
          }`}
        >
          <div className="p-4 rounded-full bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
            <Upload size={32} />
          </div>
          <div className="text-center">
            <span className="block text-sm font-bold text-white mb-1">{busy ? '上传中...' : '上传本地参考图'}</span>
            <span className="text-[10px] text-white/20 uppercase tracking-widest">
              {dragOverUpload ? '释放即可上传' : '保持原始尺寸，不拉伸，支持拖拽'}
            </span>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
        </button>
        <button 
          disabled={busy}
          onClick={() => !busy && setMode('DRAW')}
          className="flex flex-col items-center justify-center gap-4 p-12 bg-[#1a1a1a] border-2 border-dashed border-white/5 rounded-2xl hover:bg-white/5 hover:border-green-500/30 transition-all group disabled:opacity-60"
        >
          <div className="p-4 rounded-full bg-green-500/10 text-green-500 group-hover:scale-110 transition-transform">
            <Pencil size={32} />
          </div>
          <div className="text-center">
            <span className="block text-sm font-bold text-white mb-1">开启在线手绘</span>
            <span className="text-[10px] text-white/20 uppercase tracking-widest">自由调整 16:9 或 9:16</span>
          </div>
        </button>
        {error && (
          <div className="col-span-2 text-center text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 bg-[#1a1a1a] p-6 rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in duration-300">
      {/* 画布工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-4">
          <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
            <button 
              onClick={() => setAspectRatio('16:9')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${aspectRatio === '16:9' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              <Maximize2 size={12} /> 16:9
            </button>
            <button 
              onClick={() => setAspectRatio('9:16')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${aspectRatio === '9:16' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >
              <Smartphone size={12} /> 9:16
            </button>
          </div>
          <div className="w-[1px] h-6 bg-white/10 mx-2" />
          <div className="flex gap-2">
            {BRUSH_COLORS.map(c => (
              <button 
                key={c.hex}
                onClick={() => setColor(c.hex)}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-125 ${color === c.hex ? 'border-white scale-125 shadow-lg' : 'border-transparent'}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
          <div className="w-[1px] h-6 bg-white/10 mx-2" />
          <div className="flex items-center gap-3">
            {BRUSH_SIZES.map(s => (
              <button 
                key={s.label}
                onClick={() => setBrushSize(s.value)}
                className={`text-[10px] font-bold transition-colors ${brushSize === s.value ? 'text-blue-400' : 'text-white/30 hover:text-white'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={() => setMode('NONE')} className="p-2 hover:bg-white/5 rounded-lg text-white/30 hover:text-white transition-all text-xs font-bold">返回选择</button>
           <button onClick={clearCanvas} className="p-2 hover:bg-white/5 rounded-lg text-white/30 hover:text-red-400 transition-all" title="重绘">
             <RotateCcw size={16} />
           </button>
        </div>
      </div>

      <div className="flex justify-center bg-black/40 rounded-xl overflow-hidden p-6 border border-white/5 min-h-[400px] items-center">
        <canvas
          ref={canvasRef}
          width={aspectRatio === '16:9' ? 800 : 450}
          height={aspectRatio === '16:9' ? 450 : 800}
          className={`bg-white shadow-2xl cursor-crosshair transition-all duration-300 ring-8 ring-white/5 rounded-sm ${aspectRatio === '16:9' ? 'w-full max-w-[640px]' : 'h-[600px] w-auto'}`}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button 
          disabled={busy}
          onClick={() => {
            if (busy) return;
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.toBlob(blob => {
              if (!blob) {
                setError('导出画布失败，请重试');
                return;
              }
              const file = new File([blob], `reference-${Date.now()}.png`, { type: 'image/png' });
              handleUpload(file);
            });
          }} 
          className="px-8 py-3 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 flex items-center gap-2 active:scale-95 disabled:opacity-60"
        >
          <Check size={16} /> {busy ? '上传中...' : '完成绘制并应用'}
        </button>
      </div>
      {error && (
        <div className="text-right text-xs text-red-400">{error}</div>
      )}
    </div>
  );
};

// 支持同时输入文字和图片的参考图组件（类似 Claude 输入框）
const ReferenceWithDescriptionSection: React.FC<{
  initialImage?: string;
  description: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
  onDescriptionChange: (desc: string) => void;
  isUploading?: boolean;
  onUploadError?: (msg: string) => void;
  readOnly?: boolean;
}> = ({ initialImage, description, onUpload, onRemove, onDescriptionChange, isUploading = false, onUploadError, readOnly = false }) => {
  const [localUploading, setLocalUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const busy = isUploading || localUploading || readOnly;

  // ESC 键关闭预览
  useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagePreview(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview]);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      const msg = '只支持上传图片文件';
      setError(msg);
      onUploadError?.(msg);
      return;
    }
    setError(null);
    setLocalUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败，请重试';
      setError(msg);
      onUploadError?.(msg);
    } finally {
      setLocalUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // 重置 input 以允许重复选择相同文件
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleUpload(file);
        }
        return;
      }
    }
    // 如果不是图片，允许正常粘贴文本
  };

  return (
    <div
      className={`relative bg-[#1a1a1a] border rounded-2xl overflow-hidden transition-all ${
        isDragOver ? 'border-blue-500 bg-blue-900/10' : 'border-white/10'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
    >
      {/* 图片预览区域 */}
      {initialImage && (
        <div className="relative border-b border-white/10">
          <div className="flex items-center justify-center p-4 bg-black/20 min-h-[200px]">
            <img
              src={initialImage}
              className="max-w-full max-h-[400px] object-contain rounded-lg shadow-lg cursor-zoom-in"
              alt="参考图"
              onClick={() => setImagePreview({ url: initialImage, title: '参考图' })}
            />
          </div>
          {/* 右上角工具栏（与分镜模块一致） */}
          <div className="absolute top-2 right-2 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); downloadFile(initialImage); }}
              className="p-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80"
              title="下载图片"
            >
              <Download size={14} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-[11px] rounded-lg bg-black/70 text-white/90 border border-white/10 shadow disabled:opacity-60 hover:bg-black/80"
              disabled={busy}
            >
              {busy ? '上传中...' : '重新上传'}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded-lg bg-black/70 text-red-400 border border-white/10 shadow hover:bg-black/80 hover:text-red-300"
              title="移除图片"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 文字输入区域 */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent p-4 text-white focus:outline-none min-h-[100px] resize-none leading-relaxed placeholder:text-white/30"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={initialImage ? "添加参考图说明..." : "输入参考图说明，或拖拽/粘贴图片到此处..."}
        />

        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-all disabled:opacity-60"
            >
              {busy ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>上传中...</span>
                </>
              ) : (
                <>
                  <ImageIcon size={14} />
                  <span>{initialImage ? '更换图片' : '添加图片'}</span>
                </>
              )}
            </button>
            <span className="text-[10px] text-white/30">支持拖拽或 Ctrl+V 粘贴</span>
          </div>
        </div>
      </div>

      {/* 拖拽提示遮罩 */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-900/30 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-blue-200">
            <Upload size={32} />
            <span className="text-sm font-bold">释放以上传图片</span>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="px-4 pb-3">
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
      />

      {/* 图片预览弹窗（与分镜模块一致） */}
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setImagePreview(null)}
          />
          <div className="relative z-10 max-w-5xl w-full px-6">
            <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="text-sm font-semibold text-white">{imagePreview.title}</div>
                <button
                  onClick={() => setImagePreview(null)}
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="bg-black p-4 flex items-center justify-center">
                <img
                  src={imagePreview.url}
                  alt={imagePreview.title}
                  className="max-h-[70vh] max-w-full object-contain rounded-lg border border-white/5"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 单个参考资料卡片组件
const ReferenceCard: React.FC<{
  reference: SceneReference;
  index: number;
  resolvedImageUrl?: string;
  onUpdate: (ref: SceneReference) => Promise<void>;
  onDelete: () => Promise<void>;
  onUploadImage: (file: File) => Promise<string>;
  isUploading?: boolean;
  readOnly?: boolean;
}> = ({ reference, index, resolvedImageUrl, onUpdate, onDelete, onUploadImage, isUploading = false, readOnly = false }) => {
  const [localUploading, setLocalUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [description, setDescription] = useState(reference.description || '');
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = isUploading || localUploading || readOnly;
  const uploadTime = reference.imageUploadedAt || (reference.imageUrl ? reference.updatedAt || reference.createdAt : undefined);

  // ESC 键关闭预览
  useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagePreview(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview]);

  // 同步 description 状态
  useEffect(() => {
    setDescription(reference.description || '');
  }, [reference.description]);

  // 防抖保存描述
  useEffect(() => {
    if (readOnly) return;
    if (description === (reference.description || '')) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      onUpdate({ ...reference, description });
    }, 1000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [description, reference, onUpdate, readOnly]);

  const handleUpload = async (file: File) => {
    if (readOnly) return;
    if (!file.type.startsWith('image/')) {
      setError('只支持上传图片文件');
      return;
    }
    setError(null);
    setLocalUploading(true);
    try {
      const imageUrl = await onUploadImage(file);
      await onUpdate({ ...reference, imageUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败，请重试');
    } finally {
      setLocalUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (busy || readOnly) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (readOnly) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleUpload(file);
        return;
      }
    }
  };

  const handleDelete = async () => {
    if (readOnly) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } catch {
      setError('删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={`relative bg-[#1a1a1a] border rounded-2xl overflow-hidden transition-all ${
        isDragOver ? 'border-blue-500 bg-blue-900/10' : 'border-white/10'
      }`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = readOnly ? 'none' : 'copy'; if (!readOnly) setIsDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
      onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
    >
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/20">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
          参考 #{index + 1}
        </span>
        {reference.imageUrl && (
          <span className="text-[10px] text-white/30">
            上传：{formatTimestamp(uploadTime)}
          </span>
        )}
      </div>

      {/* 图片预览区域 */}
      {resolvedImageUrl ? (
        <div className="relative border-b border-white/10">
          <div className="flex items-center justify-center p-4 bg-black/20 min-h-[160px]">
            <img
              src={resolvedImageUrl}
              className="max-w-full max-h-[300px] object-contain rounded-lg shadow-lg cursor-zoom-in"
              alt={`参考图 ${index + 1}`}
              onClick={() => setImagePreview({ url: resolvedImageUrl, title: `参考图 ${index + 1}` })}
            />
          </div>
          {/* 右上角工具栏（与分镜模块一致） */}
          <div className="absolute top-2 right-2 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); downloadFile(resolvedImageUrl); }}
              className="p-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80"
              title="下载图片"
            >
              <Download size={14} />
            </button>
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-[11px] rounded-lg bg-black/70 text-white/90 border border-white/10 shadow disabled:opacity-60 hover:bg-black/80"
                  disabled={busy}
                >
                  {busy ? '上传中...' : '重新上传'}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="p-1.5 rounded-lg bg-black/70 text-red-400 border border-white/10 shadow hover:bg-black/80 hover:text-red-300 disabled:opacity-60"
                  title="删除此参考"
                >
                  {isDeleting ? (
                    <div className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      ) : !readOnly ? (
        <button
          onClick={() => !busy && fileInputRef.current?.click()}
          disabled={busy}
          className="w-full flex flex-col items-center justify-center gap-2 p-6 min-h-[120px] border-b border-white/5 hover:bg-white/5 transition-colors disabled:opacity-60"
        >
          <div className="p-2 rounded-full bg-blue-500/10 text-blue-500">
            {busy ? (
              <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            ) : (
              <Upload size={20} />
            )}
          </div>
          <span className="text-xs text-white/40">{busy ? '上传中...' : '点击上传图片'}</span>
        </button>
      ) : (
        <div className="w-full flex flex-col items-center justify-center gap-2 p-6 min-h-[120px] border-b border-white/5 text-white/25">
          <ImageIcon size={20} />
          <span className="text-xs">暂无图片</span>
        </div>
      )}

      {/* 描述输入区域 */}
      <div className="p-3">
        <textarea
          className="w-full bg-transparent text-white text-sm focus:outline-none min-h-[60px] resize-none leading-relaxed placeholder:text-white/30"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onPaste={handlePaste}
          readOnly={readOnly}
          placeholder="添加参考说明..."
        />
      </div>

      {/* 拖拽提示遮罩 */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-900/30 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-blue-200">
            <Upload size={24} />
            <span className="text-xs font-bold">释放以上传图片</span>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="px-3 pb-3">
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-2 py-1">
            {error}
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
      />

      {/* 图片预览弹窗（与分镜模块一致） */}
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setImagePreview(null)}
          />
          <div className="relative z-10 max-w-5xl w-full px-6">
            <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="text-sm font-semibold text-white">{imagePreview.title}</div>
                <button
                  onClick={() => setImagePreview(null)}
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="bg-black p-4 flex items-center justify-center">
                <img
                  src={imagePreview.url}
                  alt={imagePreview.title}
                  className="max-h-[70vh] max-w-full object-contain rounded-lg border border-white/5"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 多参考资料管理组件
const MultipleReferencesSection: React.FC<{
  sceneId: number;
  references: SceneReference[];
  onReferencesChange: (refs: SceneReference[]) => void;
  readOnly?: boolean;
}> = ({ sceneId, references, onReferencesChange, readOnly = false }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddReference = async () => {
    if (readOnly) return;
    setIsAdding(true);
    setError(null);
    try {
      const maxIndex = references.length > 0 ? Math.max(...references.map(r => r.index)) : 0;
      const newRef = await sceneReferenceApi.create(sceneId, {
        index: maxIndex + 1,
        description: '',
      });
      onReferencesChange([...references, newRef]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdateReference = async (ref: SceneReference) => {
    if (readOnly) return;
    try {
      const updated = await sceneReferenceApi.update(sceneId, ref.id, {
        index: ref.index,
        imageUrl: ref.imageUrl,
        description: ref.description,
      });
      onReferencesChange(references.map(r => r.id === ref.id ? updated : r));
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteReference = async (refId: number) => {
    if (readOnly) return;
    await sceneReferenceApi.delete(sceneId, refId);
    onReferencesChange(references.filter(r => r.id !== refId));
  };

  const handleUploadImage = async (file: File): Promise<string> => {
    if (readOnly) throw new Error('只读模式下不能上传参考图');
    const res = await fileApi.upload(file, 'private');
    return res.key;
  };

  const sortedRefs = [...references].sort((a, b) => a.index - b.index);

  return (
    <div className="space-y-4">
      {/* 参考资料列表 */}
      {sortedRefs.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedRefs.map((ref, idx) => (
            <ReferenceCard
              key={ref.id}
              reference={ref}
              index={idx}
              resolvedImageUrl={getFileUrl(ref.imageUrl)}
              onUpdate={handleUpdateReference}
              onDelete={() => handleDeleteReference(ref.id)}
              onUploadImage={handleUploadImage}
              readOnly={readOnly}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-8 bg-[#1a1a1a] border border-dashed border-white/10 rounded-2xl text-white/40">
          <ImageIcon size={32} strokeWidth={1.5} />
          <p className="text-sm">暂无参考资料</p>
          <p className="text-xs text-white/20">点击下方按钮添加参考图及说明</p>
        </div>
      )}

      {/* 添加按钮 */}
      {!readOnly && <button
        onClick={handleAddReference}
        disabled={isAdding}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 hover:border-blue-500/30 text-white/60 hover:text-white rounded-xl text-sm font-medium transition-all disabled:opacity-60"
      >
        {isAdding ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>添加中...</span>
          </>
        ) : (
          <>
            <Plus size={16} />
            <span>添加参考资料</span>
          </>
        )}
      </button>}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
};

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  bookId,
  episodes = [],
  onEpisodesChange,
  initialChapterId,
  initialSceneId,
  onActiveChapterChange,
  onActiveSceneChange,
}) => {
  // ============ 使用 Reducer 管理核心状态 ============
  const {
    state,
    dispatch,
    activeChapter,
    loadChapters,
    persistScene,
    persistChapterSynopsis,
    updateActiveScene,
    checkSceneDirty,
    checkSynopsisDirty,
    storeSceneSignature,
    storeChapterSynopsisSignature,
    cleanupChapterSignatures,
    commitChapters,
  } = useScriptEditorReducer({
    bookId,
    episodes,
    initialChapterId,
    initialSceneId,
    onEpisodesChange,
    onActiveChapterChange,
    onActiveSceneChange,
  });

  // 从 state 解构常用值
  const {
    chapters,
    activeChapterId,
    activeScene,
    isDirty,
    isSynopsisDirty,
    isLoading,
    loadError,
    isSaving,
    saveError,
    lastSavedAt,
    isSavingSynopsis,
    retryCount,
    isRetrying,
    saveQueueSize,
  } = state;

  // ============ 面板拖拽使用 Hook ============
  const leftPanel = usePanelResize({ initialWidth: 256, minWidth: 200, maxWidth: 360, side: 'left' });
  const rightPanel = usePanelResize({ initialWidth: 320, minWidth: 260, maxWidth: 520, side: 'right' });

  // ============ 保留的独立 useState (表单输入 + UI 状态) ============
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null);
  const [isCommentPanelCollapsed, setIsCommentPanelCollapsed] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  // 场景评论数映射 (sceneId -> count)
  const [sceneCommentCounts, setSceneCommentCounts] = useState<Record<number, number>>({});
  // 场景未解决评论数映射 (sceneId -> count)
  const [sceneUnresolvedCounts, setSceneUnresolvedCounts] = useState<Record<number, number>>({});
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'chapter' | 'scene';
    chapterId: number;
    sceneId?: number;
    label: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [synopsisDraft, setSynopsisDraft] = useState('');
  const [editingChapterId, setEditingChapterId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isSubmittingChapterImport, setIsSubmittingChapterImport] = useState(false);
  const [chapterImportTasks, setChapterImportTasks] = useState<ChapterImportTask[]>([]);
  const chapterImportInputRef = useRef<HTMLInputElement>(null);
  const chaptersRef = useRef(chapters);
  const chapterImportStatusesRef = useRef<Record<number, ChapterImportTaskStatus>>({});
  const isPollingChapterImportsRef = useRef(false);
  // 场景参考资料
  const [sceneReferences, setSceneReferences] = useState<SceneReference[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  // 本地备份恢复提示
  const [localBackup, setLocalBackup] = useState<{ sceneId: number; data: any } | null>(null);
  const isReadOnly = !isEditMode;

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  // ============ Hooks ============
  const {
    comments: sceneComments,
    loading: loadingComments,
    posting: postingComment,
    addComment,
    updateComment,
    deleteComment,
    resolveComment,
    unresolveComment,
    error: commentError,
  } = useSceneComments(activeScene?.id, 'script');

  const activeSceneComments = activeScene?.id ? sceneComments : [];

  // ============ 辅助函数 ============
  const computeInsertIndex = (items: { index?: number }[], insertIndex: number) => {
    if (items.length === 0) return 1;
    const normalized = items.map(it => it.index ?? 0);
    if (insertIndex === 0) return (normalized[0] ?? 0) - 1 || 0;
    if (insertIndex >= items.length) return (normalized[items.length - 1] ?? 0) + 1;
    const prev = normalized[insertIndex - 1] ?? 0;
    const next = normalized[insertIndex] ?? prev + 1;
    return (prev + next) / 2;
  };

  const requireEditMode = () => {
    if (isReadOnly) {
      setToast({ message: '当前为只读模式，请先打开编辑模式', tone: 'info' });
      return false;
    }
    return true;
  };

  const toggleEditMode = () => {
    if (isEditMode && (isDirty || isSynopsisDirty || saveQueueSize > 0 || isSaving || isSavingSynopsis)) {
      setToast({ message: '存在未保存内容，请保存完成后再切回只读模式', tone: 'error' });
      return;
    }
    if (isEditMode) {
      setEditingChapterId(null);
    }
    setIsEditMode(prev => !prev);
    setToast({
      message: isEditMode ? '已切换为只读模式' : '已打开编辑模式',
      tone: isEditMode ? 'info' : 'success',
    });
  };

  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  // 检查是否有本地备份需要恢复
  useEffect(() => {
    if (!isEditMode) {
      setLocalBackup(null);
      return;
    }
    if (!activeScene?.id) return;

    const backupKey = `manju_scene_${activeScene.id}`;
    try {
      const backup = localStorage.getItem(backupKey);
      if (backup) {
        const data = JSON.parse(backup);
        // 检查备份时间，如果是最近1小时内的备份才提示恢复
        const backupTime = new Date(data.backupTime);
        const now = new Date();
        const hoursDiff = (now.getTime() - backupTime.getTime()) / (1000 * 60 * 60);

        if (hoursDiff < 1) {
          setLocalBackup({ sceneId: activeScene.id, data });
        } else {
          // 超过1小时的备份自动清除
          localStorage.removeItem(backupKey);
        }
      }
    } catch (err) {
      console.error('Failed to check local backup', err);
    }
  }, [isEditMode, activeScene?.id]);

  // 获取场景评论数
  useEffect(() => {
    if (!bookId) return;
    commentApi.getSceneCommentCounts(bookId, 'script').then(res => {
      setSceneCommentCounts(res.data || {});
      setSceneUnresolvedCounts(res.unresolvedCounts || {});
    }).catch(err => {
      console.error('Failed to fetch comment counts', err);
    });
  }, [bookId]);

  // 同步 synopsisDraft 与 activeChapter
  useEffect(() => {
    setSynopsisDraft(activeChapter?.synopsis || '');
  }, [activeChapter?.id, activeChapter?.synopsis]);

  // 加载场景参考资料
  useEffect(() => {
    if (!activeScene?.id) {
      setSceneReferences([]);
      return;
    }
    setLoadingReferences(true);
    sceneReferenceApi.list(activeScene.id)
      .then(res => {
        setSceneReferences(res.data || []);
      })
      .catch(err => {
        console.error('Failed to load scene references', err);
        setSceneReferences([]);
      })
      .finally(() => {
        setLoadingReferences(false);
      });
  }, [activeScene?.id]);

  // ============ 事件处理函数 ============
  const appendCompletedImport = useCallback(async (task: ChapterImportTask) => {
    if (!task.outputChapterId || chaptersRef.current.some(chapter => chapter.id === task.outputChapterId)) return;
    const imported = chapterToEpisode(await chapterApi.get(bookId, task.outputChapterId, true));
    imported.scenes.forEach(storeSceneSignature);
    storeChapterSynopsisSignature(imported.id, imported.synopsis);
    const nextChapters = [...chaptersRef.current, imported]
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    chaptersRef.current = nextChapters;
    commitChapters(nextChapters);
  }, [bookId, commitChapters, storeChapterSynopsisSignature, storeSceneSignature]);

  const loadChapterImportTasks = useCallback(async () => {
    if (isPollingChapterImportsRef.current) return;
    isPollingChapterImportsRef.current = true;
    try {
      const response = await chapterApi.listImportTasks(bookId);
      const tasks = response.data || [];
      const previousStatuses = chapterImportStatusesRef.current;

      for (const task of tasks) {
        if (task.status === 'SUCCEEDED') {
          await appendCompletedImport(task);
        }
        const previousStatus = previousStatuses[task.id];
        if (previousStatus && previousStatus !== task.status) {
          if (task.status === 'SUCCEEDED') {
            setToast({ message: `${task.originalFilename} 已导入完成`, tone: 'success' });
          } else if (task.status === 'FAILED') {
            setToast({ message: task.errorMessage || `${task.originalFilename} 导入失败`, tone: 'error' });
          }
        }
      }

      chapterImportStatusesRef.current = Object.fromEntries(tasks.map(task => [task.id, task.status]));
      setChapterImportTasks(tasks);
    } catch (err) {
      console.error('Failed to load chapter import tasks', err);
    } finally {
      isPollingChapterImportsRef.current = false;
    }
  }, [appendCompletedImport, bookId]);

  useEffect(() => {
    chapterImportStatusesRef.current = {};
    setChapterImportTasks([]);
    loadChapterImportTasks();
  }, [bookId, loadChapterImportTasks]);

  const hasActiveChapterImport = chapterImportTasks.some(task =>
    task.status === 'PENDING' || task.status === 'ANALYZING' || task.status === 'IMPORTING'
  );
  const activeChapterImportTasks = chapterImportTasks.filter(task =>
    task.status === 'PENDING' || task.status === 'ANALYZING' || task.status === 'IMPORTING'
  );
  const latestTerminalImportTask = chapterImportTasks.find(task =>
    task.status === 'SUCCEEDED' || task.status === 'FAILED'
  );
  const displayedChapterImportTasks = [
    ...activeChapterImportTasks,
    ...(latestTerminalImportTask ? [latestTerminalImportTask] : []),
  ].slice(0, 3);

  useEffect(() => {
    const timer = window.setInterval(loadChapterImportTasks, hasActiveChapterImport ? 2000 : 10000);
    return () => window.clearInterval(timer);
  }, [hasActiveChapterImport, loadChapterImportTasks]);

  const handleAddChapterAt = (insertIndex: number) => {
    if (!requireEditMode()) return;
    const index = computeInsertIndex(chapters, insertIndex);
    chapterApi.create(bookId, { title: `新章节(点我修改章节名)`, index, status: 'DRAFT' }).then(res => {
      const newChapter: Episode = { id: res.id, title: res.title, index: res.index, status: res.status as 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED', scenes: [] };
      dispatch({ type: 'ADD_CHAPTER', payload: { chapter: newChapter, insertIndex } });
      dispatch({ type: 'SELECT_CHAPTER', payload: { chapterId: newChapter.id, scene: null } });
    }).catch(err => {
      console.error('Failed to create chapter', err);
      setToast({ message: '创建章节失败，请稍后再试', tone: 'error' });
    });
  };

  const handleImportChapter = async (file?: File) => {
    if (!file || !requireEditMode()) return;
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setToast({ message: '仅支持导入 txt 格式的脚本', tone: 'error' });
      return;
    }
    if (file.size <= 0 || file.size > 1024 * 1024) {
      setToast({ message: '脚本文件不能为空且不能超过 1MB', tone: 'error' });
      return;
    }

    setIsSubmittingChapterImport(true);
    try {
      const task = await chapterApi.import(bookId, file);
      chapterImportStatusesRef.current[task.id] = task.status;
      setChapterImportTasks(previous => [task, ...previous.filter(item => item.id !== task.id)]);
      setToast({ message: '导入任务已提交，可以继续编辑其他内容', tone: 'success' });
    } catch (err) {
      console.error('Failed to import chapter', err);
      setToast({ message: err instanceof Error ? err.message : '导入章节失败，请稍后再试', tone: 'error' });
    } finally {
      setIsSubmittingChapterImport(false);
      if (chapterImportInputRef.current) chapterImportInputRef.current.value = '';
    }
  };

  const handleAddSceneAt = (chapterId: number, insertIndex: number) => {
    if (!requireEditMode()) return;
    dispatch({ type: 'SET_ACTIVE_CHAPTER', payload: chapterId });
    const chapter = chapters.find(c => c.id === chapterId);
    const index = computeInsertIndex(chapter?.scenes || [], insertIndex);
    // 乐观更新：立即加入占位 scene，防止快速连续插入时 index 重复
    const tempId = -(Date.now() + Math.random());
    const placeholder: Scene = {
      id: tempId, chapterId, index,
      description: '待补充描述', cameraMovement: '', dialogue: '',
      status: 'DRAFT' as const, thumbnailUrl: '', comments: [],
    };
    dispatch({ type: 'ADD_SCENE', payload: { chapterId, scene: placeholder } });
    sceneApi.create(bookId, chapterId, {
      index,
      description: '待补充描述',
      cameraMovement: '',
      dialogue: '',
      status: 'DRAFT',
    }).then(newScene => {
      const created: Scene = { ...newScene, chapterId, comments: newScene.comments || [] };
      storeSceneSignature(created);
      // 用真实数据替换占位 scene
      dispatch({ type: 'REPLACE_SCENE', payload: { chapterId, tempId, scene: created } });
    }).catch(err => {
      console.error('Failed to create scene', err);
      // 失败时移除占位 scene
      dispatch({ type: 'REMOVE_SCENE', payload: { chapterId, sceneId: tempId } });
      setToast({ message: '创建场景失败，请稍后再试', tone: 'error' });
    });
  };

  const handleDeleteScene = (chapterId: number, sceneId: number, label: string) => {
    if (!requireEditMode()) return;
    setConfirmDelete({ type: 'scene', chapterId, sceneId, label });
  };

  const handleSelectScene = async (chapterId: number, scene: Scene) => {
    // 只在编辑模式下切换选择时自动保存当前编辑。
    if (isEditMode && activeChapterId && isSynopsisDirty && activeChapter) {
      const ok = await persistChapterSynopsis(activeChapterId, synopsisDraft);
      if (ok) setToast({ message: '章节梗概已保存', tone: 'success' });
    }
    if (isEditMode && activeScene && activeChapterId && isDirty) {
      await persistScene(activeChapterId, activeScene);
    }
    dispatch({ type: 'SELECT_SCENE', payload: { chapterId, scene } });
    dispatch({ type: 'SET_DIRTY', payload: checkSceneDirty(scene) });
  };

  const handleToggleChapter = (chapterId: number) => {
    if (isEditMode && activeChapterId && isSynopsisDirty && activeChapter) {
      persistChapterSynopsis(activeChapterId, synopsisDraft).then(ok => {
        if (ok) setToast({ message: '章节梗概已保存', tone: 'success' });
      });
    }
    if (activeChapterId === chapterId) {
      dispatch({ type: 'SELECT_CHAPTER', payload: { chapterId: null, scene: null } });
      return;
    }
    dispatch({ type: 'SELECT_CHAPTER', payload: { chapterId, scene: null } });
  };

  const handleUpdateChapterTitle = (chapterId: number, title: string) => {
    if (!requireEditMode()) return;
    dispatch({ type: 'UPDATE_CHAPTER', payload: { chapterId, updates: { title } } });
    chapterApi.update(bookId, chapterId, { title }).catch(err => {
      console.error('Failed to update chapter title', err);
    });
  };

  const handleSaveChapterSynopsis = async () => {
    if (!requireEditMode()) return;
    if (!activeChapter) return;
    dispatch({ type: 'UPDATE_CHAPTER', payload: { chapterId: activeChapter.id, updates: { synopsis: synopsisDraft } } });
    const ok = await persistChapterSynopsis(activeChapter.id, synopsisDraft);
    if (ok) setToast({ message: '章节梗概已保存', tone: 'success' });
    else if (!checkSynopsisDirty(activeChapter.id, synopsisDraft)) setToast({ message: '无改动', tone: 'info' });
  };

  const handleDeleteChapter = (chapterId: number) => {
    if (!requireEditMode()) return;
    const target = chapters.find(ch => ch.id === chapterId);
    setConfirmDelete({ type: 'chapter', chapterId, label: target?.title || '未命名章节' });
  };

  const handleSubmitComment = async (content: string, meta?: string) => {
    if (!requireEditMode()) return;
    if (!activeScene?.id) return;
    try {
      await addComment(content, meta);
      // 更新评论数（新评论默认是未解决状态）
      if (activeScene?.id) {
        setSceneCommentCounts(prev => ({
          ...prev,
          [activeScene.id]: (prev[activeScene.id] || 0) + 1
        }));
        setSceneUnresolvedCounts(prev => ({
          ...prev,
          [activeScene.id]: (prev[activeScene.id] || 0) + 1
        }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发表评论失败';
      setToast({ message: msg, tone: 'error' });
    }
  };

  const executeDelete = async () => {
    if (!requireEditMode()) return;
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      if (confirmDelete.type === 'chapter') {
        const chapterId = confirmDelete.chapterId;
        await chapterApi.delete(bookId, chapterId);
        const remainingChapters = chapters.filter(ch => ch.id !== chapterId);
        cleanupChapterSignatures(chapterId, remainingChapters);
        dispatch({ type: 'REMOVE_CHAPTER', payload: chapterId });
      } else {
        const { chapterId, sceneId } = confirmDelete;
        if (!sceneId) return;
        await sceneApi.delete(bookId, chapterId, sceneId);
        dispatch({ type: 'REMOVE_SCENE', payload: { chapterId, sceneId } });
      }
      setToast({ message: '删除成功', tone: 'success' });
    } catch (err) {
      console.error('Failed to delete', err);
      setToast({ message: '删除失败，请稍后重试', tone: 'error' });
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  const buildExportMarkdown = () => {
    const sortedChapters = [...chapters].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const lines: string[] = [
      '# 剧本创作导出',
      '',
      `导出时间：${getExportTimestamp()}`,
      '',
    ];

    if (sortedChapters.length === 0) {
      lines.push('暂无章节。');
      return lines.join('\n');
    }

    sortedChapters.forEach((chapter, chapterIdx) => {
      const synopsis = chapter.id === activeChapterId ? synopsisDraft : chapter.synopsis;
      const sortedScenes = [...(chapter.scenes || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      lines.push(`## 章节 ${chapterIdx + 1}：${escapeMarkdownTitle(chapter.title || '未命名章节')}`);
      lines.push('');
      lines.push('### 故事梗概');
      lines.push('');
      lines.push(markdownValue(synopsis));
      lines.push('');

      if (sortedScenes.length === 0) {
        lines.push('### 场景');
        lines.push('');
        lines.push('暂无场景。');
        lines.push('');
        return;
      }

      sortedScenes.forEach((scene, sceneIdx) => {
        lines.push(`### 场景 ${sceneIdx + 1}`);
        lines.push('');
        lines.push('#### 画面描述');
        lines.push('');
        lines.push(markdownValue(scene.description));
        lines.push('');
        lines.push('#### 台词/旁白');
        lines.push('');
        lines.push(markdownValue(scene.dialogue));
        lines.push('');
        lines.push('#### 镜头/运镜');
        lines.push('');
        lines.push(markdownValue(scene.cameraMovement));
        lines.push('');
        lines.push('#### 转场/剪辑手法');
        lines.push('');
        lines.push(markdownValue(scene.transitionEffect));
        lines.push('');
      });
    });

    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  };

  const handleExportMarkdown = () => {
    try {
      const markdown = buildExportMarkdown();
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `剧本创作导出_${bookId}_${getExportFileStamp()}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setToast({ message: 'Markdown 文件已导出', tone: 'success' });
    } catch (err) {
      console.error('Failed to export markdown', err);
      setToast({ message: '导出失败，请稍后重试', tone: 'error' });
    }
  };

  // Toast 自动隐藏
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // 场景定时自动保存（2秒）
  useEffect(() => {
    if (!isEditMode) return;
    if (!isDirty || !activeScene || !activeChapterId) return;
    const timer = setTimeout(() => {
      persistScene(activeChapterId, activeScene);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isEditMode, isDirty, activeScene, activeChapterId, persistScene]);

  // 梗概定时自动保存（2秒）
  useEffect(() => {
    if (!isEditMode) return;
    if (!isSynopsisDirty || !activeChapterId) return;
    const timer = setTimeout(() => {
      persistChapterSynopsis(activeChapterId, synopsisDraft);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isEditMode, isSynopsisDirty, activeChapterId, synopsisDraft, persistChapterSynopsis]);

  // Ctrl+S / Cmd+S 手动保存快捷键
  // 使用 ref 存储回调依赖，避免频繁注册/卸载事件监听器
  const saveShortcutRef = useRef({ activeScene, activeChapterId, isDirty, isSynopsisDirty, activeChapter, synopsisDraft, persistScene, persistChapterSynopsis, setToast, isEditMode });
  useEffect(() => {
    saveShortcutRef.current = { activeScene, activeChapterId, isDirty, isSynopsisDirty, activeChapter, synopsisDraft, persistScene, persistChapterSynopsis, setToast, isEditMode };
  });
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();

        const { activeScene, activeChapterId, isDirty, isSynopsisDirty, activeChapter, synopsisDraft, persistScene, persistChapterSynopsis, setToast, isEditMode } = saveShortcutRef.current;
        if (!isEditMode) {
          setToast({ message: '只读模式下不能保存，请先打开编辑模式', tone: 'info' });
          return;
        }
        if (activeScene && activeChapterId && isDirty) {
          persistScene(activeChapterId, activeScene).then(ok => {
            if (ok) setToast({ message: '场景已保存 (Ctrl+S)', tone: 'success' });
          });
        } else if (activeChapterId && isSynopsisDirty && activeChapter) {
          persistChapterSynopsis(activeChapterId, synopsisDraft).then(ok => {
            if (ok) setToast({ message: '章节梗概已保存 (Ctrl+S)', tone: 'success' });
          });
        } else {
          setToast({ message: '无改动，无需保存', tone: 'info' });
        }
      }
    };

    // capture: true 在捕获阶段拦截，确保先于浏览器默认行为
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // 离开页面前确保保存
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isEditMode && (isDirty || isSynopsisDirty)) {
        e.preventDefault();
        // 现代浏览器会显示标准确认对话框
        return (e.returnValue = '您有未保存的更改，确定要离开吗？');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isEditMode, isDirty, isSynopsisDirty]);

  return (
    <div className="flex h-full bg-[#121212] relative">
      {/* 本地备份恢复提示 */}
      {localBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-blue-500/30 rounded-2xl p-6 w-[420px] shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-200">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">发现本地备份</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  检测到有未同步到服务器的本地备份数据
                </p>
              </div>
            </div>
            <div className="bg-black/30 border border-white/5 rounded-xl p-4 mb-4">
              <p className="text-sm text-white/70 mb-2">备份信息：</p>
              <div className="text-xs text-white/50 space-y-1">
                <div>• 场景 ID: {localBackup.sceneId}</div>
                <div>• 备份时间: {new Date(localBackup.data.backupTime).toLocaleString()}</div>
              </div>
            </div>
            <p className="text-sm text-white/60 mb-6">
              这可能是之前保存失败时的备份数据，您想要恢复吗？
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  // 删除备份
                  try {
                    localStorage.removeItem(`manju_scene_${localBackup.sceneId}`);
                  } catch (err) {
                    console.error('Failed to remove backup', err);
                  }
                  setLocalBackup(null);
                }}
                className="px-4 py-2 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-colors"
              >
                丢弃备份
              </button>
              <button
                onClick={() => {
                  // 恢复备份
                  if (activeScene && localBackup.sceneId === activeScene.id) {
                    const { backupTime, ...sceneData } = localBackup.data;
                    updateActiveScene(() => sceneData);
                    setToast({ message: '已恢复本地备份，请手动保存', tone: 'success' });
                  }
                  setLocalBackup(null);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors"
              >
                恢复备份
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-[380px] shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-200">
                <Trash2 size={16} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-bold">
                  {confirmDelete.type === 'chapter' ? '删除章节' : '删除场景'}
                </p>
                <h3 className="text-lg font-bold text-white mt-0.5">{confirmDelete.label}</h3>
              </div>
            </div>
            <p className="text-sm text-white/70 mb-6">该操作不可恢复，确认要删除吗？</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-colors"
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                onClick={executeDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-colors disabled:opacity-60"
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
          <div
            className={`px-5 py-2 rounded-lg border text-sm shadow-xl ${
              toast.tone === 'success'
                ? 'bg-green-500/20 border-green-500/40 text-green-100'
                : toast.tone === 'error'
                ? 'bg-red-500/20 border-red-500/40 text-red-100'
                : 'bg-white/10 border-white/20 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
      {isLoading && chapters.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm">加载中...</div>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="px-6 py-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200">
            加载章节失败：{loadError}
          </div>
        </div>
      )}
      {/* 1. 左侧：章节/场景导航 */}
      <div style={{ width: leftPanel.width }} className="border-r border-white/5 flex flex-col bg-[#161616]">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">章节 / 场景</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleExportMarkdown();
              }}
              className="px-2 py-1 text-[10px] font-bold text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              导出 MD
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'SELECT_CHAPTER', payload: { chapterId: null, scene: null } });
              }}
              className="px-2 py-1 text-[10px] font-bold text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              折叠全部
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          {chapters.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-white/30">
              <AlertCircle size={32} />
              <p className="text-xs font-semibold">{isReadOnly ? '暂无章节，打开编辑模式后可新建' : '暂无章节，点击下方按钮插入'}</p>
              {!isReadOnly && (
                <button
                  onClick={() => handleAddChapterAt(0)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 transition-colors flex items-center gap-2"
                >
                  <Plus size={14} /> 新建章节
                </button>
              )}
            </div>
          )}
          {chapters.length > 0 && (
            <>
              <div className="relative flex justify-center my-1 group">
                <div className="w-full max-w-[200px] h-px bg-white/5 group-hover:bg-white/10 transition-colors" />
                <button
                  onClick={() => handleAddChapterAt(0)}
                  className={`absolute top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] rounded-full border border-dashed border-white/10 text-white/50 bg-[#1a1a1a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all hover:border-blue-500/50 hover:text-blue-200 ${isReadOnly ? 'hidden' : ''}`}
                >
                  <Plus size={12} className="inline-block mr-1" /> 在此插入章节
                </button>
              </div>
            {chapters.map((chapter, idx) => {
              const sortedScenes = [...(chapter.scenes || [])].sort((a, b) => a.index - b.index);
              return (
                <React.Fragment key={chapter.id}>
                  <div className="mb-2 border border-white/5 rounded-2xl overflow-hidden bg-black/30">
                    <div
                      className={`w-full px-3 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                        chapter.id === activeChapterId ? 'bg-white/5 text-white' : 'text-white/60 hover:bg-white/5'
                      }`}
                      onClick={() => handleToggleChapter(chapter.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1 rounded-md bg-white/5 text-white/60 transition-transform ${chapter.id === activeChapterId ? 'rotate-180 text-white' : ''}`}>
                      <ChevronDown size={14} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-widest">章节 {idx + 1}</span>
                          {editingChapterId === chapter.id ? (
                            <input
                              value={editingTitle}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={() => {
                                handleUpdateChapterTitle(chapter.id, editingTitle.trim() || '未命名章节');
                                setEditingChapterId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                } else if (e.key === 'Escape') {
                                  setEditingChapterId(null);
                                  setEditingTitle(chapter.title);
                                }
                              }}
                              className="bg-transparent border-b border-white/20 focus:border-blue-500 focus:outline-none text-sm font-semibold text-white"
                            />
                          ) : (
                            <button
                              className={`text-left text-sm font-semibold transition-colors ${isReadOnly ? 'cursor-default text-white/80' : 'hover:text-blue-300'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!requireEditMode()) return;
                                setEditingChapterId(chapter.id);
                                setEditingTitle(chapter.title || '未命名章节');
                              }}
                            >
                              {chapter.title || '未命名章节'}
                            </button>
                          )}
                        </div>
                      </div>
                      {!isReadOnly && <div className="flex items-center gap-1.5">
                        <button
                          className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChapter(chapter.id);
                          }}
                          title="删除章节"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>}
                    </div>

                    {chapter.id === activeChapterId && (
                      <div className="px-2 pb-3 pt-1 space-y-2">
                        <div className="relative flex justify-center my-1 group">
                          <div className="w-full max-w-[180px] h-px bg-white/5 group-hover:bg-white/10 transition-colors" />
                          <button
                            onClick={() => handleAddSceneAt(chapter.id, 0)}
                            className={`absolute top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] rounded-full border border-dashed border-white/10 text-white/50 bg-[#1a1a1a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all hover:border-blue-500/50 hover:text-blue-200 ${isReadOnly ? 'hidden' : ''}`}
                          >
                            <Plus size={12} className="inline-block mr-1" /> 在此插入场景
                          </button>
                        </div>
                        {sortedScenes.length === 0 ? (
                          <div className="w-full border border-dashed border-white/10 rounded-xl py-3 text-white/40 text-sm flex items-center justify-center gap-2">
                            暂无场景，请在上方或下方插入
                          </div>
                        ) : (
                          sortedScenes.map((scene, sceneIdx) => (
                            <React.Fragment key={scene.id}>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => handleSelectScene(chapter.id, scene)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleSelectScene(chapter.id, scene);
                                  }
                                }}
                                className={`w-full p-4 text-left rounded-xl transition-all cursor-pointer ${
                                  activeScene?.id === scene.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20' : 'hover:bg-white/5'
                                }`}
                              >
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${activeScene?.id === scene.id ? 'text-white' : 'text-white/20'}`}>
                                    场景 {sceneIdx + 1}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {sceneCommentCounts[scene.id] > 0 && (
                                      <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded ${
                                        sceneUnresolvedCounts[scene.id] > 0
                                          ? (activeScene?.id === scene.id ? 'bg-red-500/30 text-red-200' : 'bg-red-500/20 text-red-300/80')
                                          : (activeScene?.id === scene.id ? 'bg-yellow-500/30 text-yellow-200' : 'bg-yellow-500/20 text-yellow-300/80')
                                      }`} title={`${sceneCommentCounts[scene.id]} 条评论${sceneUnresolvedCounts[scene.id] > 0 ? `（${sceneUnresolvedCounts[scene.id]} 条未解决）` : '（全部已解决）'}`}>
                                        <MessageSquare size={10} />
                                        {sceneCommentCounts[scene.id]}
                                      </span>
                                    )}
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                      activeScene?.id === scene.id ? 'bg-white/20 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/20'
                                    }`}>
                                      {STATUS_MAP[scene.status]}
                                    </span>
                                    {!isReadOnly && <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteScene(chapter.id, scene.id, `场景 ${sceneIdx + 1}`);
                                      }}
                                      className="p-1 rounded-md text-red-300 hover:text-red-100 hover:bg-red-500/20 transition-colors"
                                      title="删除场景"
                                    >
                                      <Trash2 size={14} />
                                    </button>}
                                  </div>
                                </div>
                                <p className={`text-sm line-clamp-2 leading-snug font-medium transition-colors ${activeScene?.id === scene.id ? 'text-white' : 'text-white/60 group-hover:text-white'}`}>
                                  {scene.description || '点击添加描述...'}
                                </p>
                              </div>
                              <div className="relative flex justify-center my-1 group">
                                <div className="w-full max-w-[180px] h-px bg-white/5 group-hover:bg-white/10 transition-colors" />
                                <button
                                  onClick={() => handleAddSceneAt(chapter.id, sceneIdx + 1)}
                                  className={`absolute top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] rounded-full border border-dashed border-white/10 text-white/50 bg-[#1a1a1a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all hover:border-blue-500/50 hover:text-blue-200 ${isReadOnly ? 'hidden' : ''}`}
                                >
                                  <Plus size={12} className="inline-block mr-1" /> 在此插入场景
                                </button>
                              </div>
                            </React.Fragment>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative flex justify-center my-1 group">
                    <div className="w-full max-w-[200px] h-px bg-white/5 group-hover:bg-white/10 transition-colors" />
                    <button
                      onClick={() => handleAddChapterAt(idx + 1)}
                      className={`absolute top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] rounded-full border border-dashed border-white/10 text-white/50 bg-[#1a1a1a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all hover:border-blue-500/50 hover:text-blue-200 ${isReadOnly ? 'hidden' : ''}`}
                    >
                      <Plus size={12} className="inline-block mr-1" /> 在此插入章节
                    </button>
                  </div>
                </React.Fragment>
              );
            })}
            </>
          )}
        </div>

        {/* 底部快捷添加栏 - 始终可见 */}
        <div className="p-3 border-t border-white/5 bg-[#1a1a1a] space-y-2">
          <button
            type="button"
            onClick={toggleEditMode}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
              isEditMode
                ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25'
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {isEditMode ? <Unlock size={14} /> : <Lock size={14} />}
            {isEditMode ? '编辑模式' : '只读模式'}
          </button>
          {displayedChapterImportTasks.map(task => {
            const isActive = task.status === 'PENDING' || task.status === 'ANALYZING' || task.status === 'IMPORTING';
            const isFailed = task.status === 'FAILED';
            const canOpen = task.status === 'SUCCEEDED' && Boolean(task.outputChapterId);
            return (
              <button
                key={task.id}
                type="button"
                disabled={!canOpen}
                onClick={() => {
                  if (task.outputChapterId) {
                    dispatch({ type: 'SELECT_CHAPTER', payload: { chapterId: task.outputChapterId, scene: null } });
                  }
                }}
                className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                  isFailed
                    ? 'bg-red-500/10 border-red-400/20 text-red-100'
                    : isActive
                    ? 'bg-amber-500/10 border-amber-400/20 text-amber-50'
                    : 'bg-emerald-500/10 border-emerald-400/20 text-emerald-100 enabled:hover:bg-emerald-500/20'
                } disabled:cursor-default`}
              >
                <span className="flex items-center gap-2 text-[11px] font-bold">
                  {isActive ? <Loader2 size={12} className="animate-spin shrink-0" /> : isFailed ? <AlertCircle size={12} className="shrink-0" /> : <Check size={12} className="shrink-0" />}
                  <span className="truncate">{CHAPTER_IMPORT_STATUS_TEXT[task.status]}</span>
                </span>
                <span className="mt-1 block truncate text-[10px] opacity-60" title={task.originalFilename}>
                  {task.originalFilename}{canOpen ? ' · 点击查看章节' : ''}
                </span>
                {isFailed && task.errorMessage && (
                  <span className="mt-1 block text-[10px] opacity-70 line-clamp-2">{task.errorMessage}</span>
                )}
              </button>
            );
          })}
          {isEditMode ? (
            <>
              <button
                onClick={() => handleAddChapterAt(chapters.length)}
                disabled={isSubmittingChapterImport}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 rounded-xl text-xs font-bold transition-all hover:border-blue-500/50"
              >
                <Plus size={14} /> 添加章节
              </button>
              <input
                ref={chapterImportInputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  handleImportChapter(file);
                }}
              />
              <button
                type="button"
                onClick={() => chapterImportInputRef.current?.click()}
                disabled={isSubmittingChapterImport || hasActiveChapterImport}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/25 text-amber-100 rounded-xl text-xs font-bold transition-all hover:border-amber-300/50 disabled:opacity-50 disabled:cursor-wait"
                title="上传 UTF-8 编码的 txt 脚本，由 AI 自动生成章节梗概和场景"
              >
                {isSubmittingChapterImport ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {isSubmittingChapterImport ? '正在提交...' : hasActiveChapterImport ? '章节导入进行中' : '导入章节'}
              </button>
              <button
                onClick={() => {
                  if (activeChapterId) {
                    const chapter = chapters.find(c => c.id === activeChapterId);
                    handleAddSceneAt(activeChapterId, chapter?.scenes?.length || 0);
                  }
                }}
                disabled={!activeChapterId}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:text-white/60"
              >
                <Plus size={14} /> 添加场景
              </button>
              {!activeChapterId && chapters.length > 0 && (
                <p className="text-[10px] text-white/30 text-center">选择章节后可添加场景</p>
              )}
            </>
          ) : (
            <p className="text-[10px] text-white/30 text-center">只读模式下不会自动保存，也不能增删改</p>
          )}
        </div>
      </div>

      {/* 左侧与中间的分隔线 */}
      <div
        className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${leftPanel.isResizing ? 'bg-white/20' : ''}`}
        onMouseDown={leftPanel.startResizing}
      />

      {/* 2 & 3. 中间区域 + 右侧反馈，可拖拽分隔 */}
      <div className="flex flex-1 h-full">
        {/* 中间：创作核心区 */}
        <div className="flex-1 flex flex-col h-full bg-[#0f0f0f]">
          {activeScene ? (
            <>
              <div className="flex-1 overflow-y-auto p-12">
                <div className="max-w-4xl mx-auto space-y-12">
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">画面描述 (Action & Visuals)</label>
                    <textarea
                      className={`w-full bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 text-white text-lg focus:outline-none min-h-[140px] resize-none leading-relaxed transition-all placeholder:text-white/5 shadow-inner ${isReadOnly ? 'cursor-default opacity-80' : 'focus:ring-2 focus:ring-blue-500/30'}`}
                      value={activeScene.description}
                      onChange={(e) => updateActiveScene(scene => ({ ...scene, description: e.target.value }))}
                      readOnly={isReadOnly}
                      placeholder="详细描述画面内容，包括角色动作、环境变化等..."
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">台词/旁白 (Dialogue)</label>
                    <textarea
                      className={`w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none min-h-[80px] resize-none leading-relaxed ${isReadOnly ? 'cursor-default opacity-80' : 'focus:border-blue-500/50'}`}
                      value={activeScene.dialogue}
                      onChange={(e) => updateActiveScene(scene => ({ ...scene, dialogue: e.target.value }))}
                      readOnly={isReadOnly}
                      placeholder="角色的台词或剧情叙述..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">镜头/运镜 (Camera Movement)</label>
                      <textarea
                        className={`w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none min-h-[60px] resize-none leading-relaxed ${isReadOnly ? 'cursor-default opacity-80' : 'focus:border-blue-500/50'}`}
                        value={activeScene.cameraMovement}
                        onChange={(e) => updateActiveScene(scene => ({ ...scene, cameraMovement: e.target.value }))}
                        readOnly={isReadOnly}
                        placeholder="特写 / 全景 / 俯视..."
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">转场/剪辑手法 (Transition)</label>
                      <textarea
                        className={`w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none min-h-[60px] resize-none leading-relaxed ${isReadOnly ? 'cursor-default opacity-80' : 'focus:border-blue-500/50'}`}
                        value={activeScene.transitionEffect || ''}
                        onChange={(e) => updateActiveScene(scene => ({ ...scene, transitionEffect: e.target.value }))}
                        readOnly={isReadOnly}
                        placeholder="淡入淡出 / 硬切 / 叠化..."
                      />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <ImageIcon size={14} className="text-blue-500" />
                      <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">参考资料</label>
                      {loadingReferences && (
                        <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                      )}
                    </div>
                    <MultipleReferencesSection
                      sceneId={activeScene.id}
                      references={sceneReferences}
                      onReferencesChange={setSceneReferences}
                      readOnly={isReadOnly}
                    />
                  </div>
                </div>
              </div>
              
              <div className="h-16 bg-[#1a1a1a] border-t border-white/5 flex justify-between items-center px-10">
                 <div className="flex items-center gap-4">
                   {/* 保存状态指示器 */}
                   <div className="flex items-center gap-3">
                     {/* 动画状态点 */}
                     <div className="relative">
                       <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                         isReadOnly
                           ? 'bg-white/40'
                           : saveError
                           ? 'bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse'
                           : isDirty && !isSaving
                             ? 'bg-orange-400 shadow-[0_0_12px_#fb923c] animate-pulse'
                             : isSaving || isRetrying
                               ? 'bg-yellow-400 shadow-[0_0_12px_#fbbf24]'
                               : 'bg-green-500 shadow-[0_0_12px_#22c55e]'
                       }`} />
                       {!isReadOnly && (isSaving || isRetrying) && (
                         <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping" />
                       )}
                     </div>

                     {/* 状态文字 */}
                     <div className="flex flex-col gap-0.5">
                       <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${
                         isReadOnly
                           ? 'text-white/50'
                           : saveError
                           ? 'text-red-300'
                           : isDirty && !isSaving
                             ? 'text-orange-300'
                             : 'text-white/50'
                       }`}>
                         {isReadOnly
                             ? '只读模式'
                           : saveError
                             ? '保存失败'
                           : isRetrying
                             ? `正在重试 (${retryCount}/3)`
                             : isSaving
                               ? '保存中...'
                               : isDirty
                                 ? '未保存'
                                 : '已保存'}
                       </span>
                       {isReadOnly && (
                         <span className="text-[9px] text-white/30">
                           打开编辑模式后可修改和保存
                         </span>
                       )}
                       {activeScene && (
                         <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-white/25">
                           <span>创建：{formatTimestamp(activeScene.createdAt)}</span>
                           <span>修改：{formatTimestamp(activeScene.updatedAt)}</span>
                         </div>
                       )}
                       {!isReadOnly && lastSavedAt && !isDirty && (
                         <span className="text-[9px] text-white/30">
                           上次保存：{lastSavedAt.toLocaleTimeString()}
                         </span>
                       )}
                       {!isReadOnly && saveError && (
                         <span className="text-[9px] text-red-400/70">
                           {saveError}
                         </span>
                       )}
                       {/* 保存队列提示 */}
                       {!isReadOnly && saveQueueSize > 0 && (
                         <span className="text-[9px] text-blue-400/70">
                           队列中：{saveQueueSize} 个任务
                         </span>
                       )}
                     </div>
                   </div>

                   {/* 未保存徽章 */}
                   {!isReadOnly && isDirty && !isSaving && (
                     <div className="px-2.5 py-1 bg-orange-500/20 border border-orange-500/40 rounded-lg text-[10px] font-bold text-orange-200 animate-pulse">
                       有未保存更改
                     </div>
                   )}

                   {/* 保存队列徽章 */}
                   {!isReadOnly && saveQueueSize > 1 && (
                     <div className="px-2.5 py-1 bg-blue-500/20 border border-blue-500/40 rounded-lg text-[10px] font-bold text-blue-200">
                       <div className="flex items-center gap-1.5">
                         <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                         <span>队列: {saveQueueSize}</span>
                       </div>
                     </div>
                   )}
                 </div>

                 {isEditMode && <button
                   onClick={async () => {
                     if (!activeScene || !activeChapterId) return;
                     if (!isDirty) {
                       setToast({ message: '无改动，无需保存', tone: 'info' });
                       return;
                     }
                     const ok = await persistScene(activeChapterId, activeScene);
                     if (ok) {
                       setToast({ message: '保存成功', tone: 'success' });
                     }
                   }}
                   className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 active:scale-95 disabled:opacity-60"
                   disabled={isSaving || !activeScene || !activeChapterId}
                 >
                    <Save size={16} /> 手动保存 <span className="text-[9px] opacity-60">(Ctrl+S)</span>
                 </button>}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-start justify-start gap-6 px-10 py-10 text-left">
              {chapters.length === 0 ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-white/40">
                    <Plus size={28} />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-lg font-semibold text-white">还没有任何章节</p>
                    <p className="text-sm text-white/40">先创建章节，再为章节添加场景</p>
                  </div>
                  <button
                    onClick={() => handleAddChapterAt(0)}
                    className={`px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-colors flex items-center gap-2 ${isReadOnly ? 'hidden' : ''}`}
                  >
                    <Plus size={16} /> 新建章节
                  </button>
                </>
              ) : activeChapter ? (
                <>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-inner max-w-3xl w-full">
                    <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] bg-blue-600/20 text-blue-200 rounded">
                        章节故事梗概
                      </div>
                      <span className="text-[10px] text-white/30">点击章节时展示的概要</span>
                      <span className="text-[10px] text-white/30">序号 #{chapters.findIndex(c => c.id === activeChapter.id) + 1}</span>
                    </div>
                      {isEditMode && <button
                        onClick={handleSaveChapterSynopsis}
                        disabled={isSavingSynopsis}
                        className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-60"
                      >
                        {isSavingSynopsis ? '保存中...' : '保存梗概'}
                      </button>}
                    </div>
                    <textarea
                      rows={10}
                      className={`w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none min-h-[200px] resize-none ${isReadOnly ? 'cursor-default opacity-80' : 'focus:border-blue-500/50'}`}
                      value={synopsisDraft}
                      onChange={(e) => {
                        if (isReadOnly) return;
                        setSynopsisDraft(e.target.value);
                        if (activeChapter?.id != null) {
                          dispatch({ type: 'SET_SYNOPSIS_DIRTY', payload: checkSynopsisDirty(activeChapter.id, e.target.value) });
                        }
                      }}
                      readOnly={isReadOnly}
                      placeholder="填写章节的故事梗概，便于团队快速理解剧情走向"
                    />
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle size={48} className="text-white/30" />
                  <p className="text-sm font-bold uppercase tracking-widest text-white/60">请选择或创建一个场景开始创作</p>
                </>
              )}
            </div>
          )}
        </div>

        {isCommentPanelCollapsed ? (
          <button
            type="button"
            onClick={() => setIsCommentPanelCollapsed(false)}
            className="w-12 border-l border-white/5 bg-[#121212] flex flex-col items-center justify-center gap-3 text-white/40 hover:bg-[#171717] hover:text-white transition-colors"
            title="展开评论区"
          >
            <ChevronLeft size={16} />
            <MessageSquare size={16} />
            {activeSceneComments.length > 0 && (
              <span className="min-w-5 px-1.5 py-0.5 rounded-full bg-blue-500/15 text-[10px] font-bold text-blue-100 border border-blue-400/30">
                {activeSceneComments.length}
              </span>
            )}
          </button>
        ) : (
          <>
            {/* 可拖拽分隔线 */}
            <div
              className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${rightPanel.isResizing ? 'bg-white/20' : ''}`}
              onMouseDown={rightPanel.startResizing}
            />

            {/* 右侧：反馈侧边栏 */}
            <div style={{ width: rightPanel.width }} className="border-l border-white/5 bg-[#121212] flex flex-col">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">审核反馈</span>
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-white/20" />
                  <button
                    type="button"
                    onClick={() => setIsCommentPanelCollapsed(true)}
                    className="p-1 rounded-lg text-white/35 hover:text-white hover:bg-white/5 transition-colors"
                    title="收起评论区"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {commentError ? (
                  <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    加载评论失败：{commentError}
                  </div>
                ) : loadingComments ? (
                  <div className="h-full flex items-center justify-center text-white/40 text-sm">
                    评论加载中...
                  </div>
                ) : activeScene ? (
                  activeSceneComments.length ? (
                    activeSceneComments.map(c => (
                      <CommentItem
                        key={c.id}
                        comment={c}
                        onUpdate={isEditMode ? async (id, content) => {
                          await updateComment(id, content);
                        } : undefined}
                        onDelete={isEditMode ? async (id) => {
                          const target = activeSceneComments.find(cm => cm.id === id);
                          await deleteComment(id);
                          if (activeScene?.id) {
                            setSceneCommentCounts(prev => ({
                              ...prev,
                              [activeScene.id]: Math.max(0, (prev[activeScene.id] || 0) - 1)
                            }));
                            if (target?.status === 'unresolved') {
                              setSceneUnresolvedCounts(prev => ({
                                ...prev,
                                [activeScene.id]: Math.max(0, (prev[activeScene.id] || 0) - 1)
                              }));
                            }
                          }
                        } : undefined}
                        onResolve={isEditMode ? async (id) => {
                          await resolveComment(id);
                          if (activeScene?.id) {
                            setSceneUnresolvedCounts(prev => ({
                              ...prev,
                              [activeScene.id]: Math.max(0, (prev[activeScene.id] || 0) - 1)
                            }));
                          }
                        } : undefined}
                        onUnresolve={isEditMode ? async (id) => {
                          await unresolveComment(id);
                          if (activeScene?.id) {
                            setSceneUnresolvedCounts(prev => ({
                              ...prev,
                              [activeScene.id]: (prev[activeScene.id] || 0) + 1
                            }));
                          }
                        } : undefined}
                      />
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-4 opacity-10">
                      <MessageSquare size={48} strokeWidth={1} />
                      <p className="text-[10px] font-bold uppercase tracking-widest">暂无修改意见</p>
                    </div>
                  )
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-4 opacity-10">
                    <MessageSquare size={48} strokeWidth={1} />
                    <p className="text-[10px] font-bold uppercase tracking-widest">请选择场景查看评论</p>
                  </div>
                )}
              </div>

              <CommentInput
                onSubmit={handleSubmitComment}
                disabled={!activeScene || isReadOnly}
                posting={postingComment}
                placeholder={isReadOnly ? '只读模式下不能发表或修改评论' : '输入您的修改意见或审核回复...'}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
