
import React, { useState, useRef, useEffect } from 'react';
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
  Trash2,
  Download
} from 'lucide-react';
import { chapterApi, sceneApi, fileApi, commentApi, sceneReferenceApi, isValidMediaUrl, ensureHttpsUrl, normalizeFileKey } from '../api';
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

const ReferenceSection: React.FC<{ 
  initialImage?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
  isUploading?: boolean;
  onUploadError?: (msg: string) => void;
}> = ({ initialImage, onUpload, onRemove, isUploading = false, onUploadError }) => {
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

  const busy = isUploading || localUploading;

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
            <a
              href={initialImage}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80"
              title="下载图片"
              onClick={e => e.stopPropagation()}
            >
              <Download size={14} />
            </a>
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
}> = ({ initialImage, description, onUpload, onRemove, onDescriptionChange, isUploading = false, onUploadError }) => {
  const [localUploading, setLocalUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const busy = isUploading || localUploading;

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
            <a
              href={initialImage}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80"
              title="下载图片"
              onClick={e => e.stopPropagation()}
            >
              <Download size={14} />
            </a>
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
}> = ({ reference, index, resolvedImageUrl, onUpdate, onDelete, onUploadImage, isUploading = false }) => {
  const [localUploading, setLocalUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [description, setDescription] = useState(reference.description || '');
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = isUploading || localUploading;

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
    if (description === (reference.description || '')) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      onUpdate({ ...reference, description });
    }, 1000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [description, reference, onUpdate]);

  const handleUpload = async (file: File) => {
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
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
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
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
      onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
    >
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/20">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
          参考 #{index + 1}
        </span>
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
            <a
              href={resolvedImageUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80"
              title="下载图片"
              onClick={e => e.stopPropagation()}
            >
              <Download size={14} />
            </a>
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
          </div>
        </div>
      ) : (
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
      )}

      {/* 描述输入区域 */}
      <div className="p-3">
        <textarea
          className="w-full bg-transparent text-white text-sm focus:outline-none min-h-[60px] resize-none leading-relaxed placeholder:text-white/30"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onPaste={handlePaste}
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
}> = ({ sceneId, references, onReferencesChange }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUrls, setResolvedUrls] = useState<Record<number, string>>({});
  const resolvedUrlsCacheRef = useRef<Record<string, string>>({});

  // 解析参考图的 URL
  useEffect(() => {
    const resolveUrls = async () => {
      const newResolved: Record<number, string> = {};
      for (const ref of references) {
        if (!ref.imageUrl) continue;

        const raw = ensureHttpsUrl(ref.imageUrl);
        if (raw.startsWith('data:') || raw.startsWith('blob:')) {
          newResolved[ref.id] = raw;
          continue;
        }

        const { key, externalUrl } = normalizeFileKey(raw);
        if (!key) {
          if (externalUrl && isValidMediaUrl(externalUrl)) {
            newResolved[ref.id] = externalUrl;
          }
          continue;
        }

        // 使用缓存
        if (resolvedUrlsCacheRef.current[key]) {
          newResolved[ref.id] = resolvedUrlsCacheRef.current[key];
          continue;
        }

        try {
          const signed = await fileApi.getSignedUrl(key);
          const url = ensureHttpsUrl(signed.url);
          if (url && isValidMediaUrl(url)) {
            resolvedUrlsCacheRef.current[key] = url;
            newResolved[ref.id] = url;
          }
        } catch (e) {
          console.error('Failed to resolve reference image', e);
          if (externalUrl && isValidMediaUrl(externalUrl)) {
            newResolved[ref.id] = externalUrl;
          }
        }
      }
      setResolvedUrls(newResolved);
    };

    resolveUrls();
  }, [references]);

  const handleAddReference = async () => {
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
    await sceneReferenceApi.delete(sceneId, refId);
    onReferencesChange(references.filter(r => r.id !== refId));
  };

  const handleUploadImage = async (file: File): Promise<string> => {
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
              resolvedImageUrl={resolvedUrls[ref.id]}
              onUpdate={handleUpdateReference}
              onDelete={() => handleDeleteReference(ref.id)}
              onUploadImage={handleUploadImage}
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
      <button
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
      </button>

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
    cleanupChapterSignatures,
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
  } = state;

  // ============ 面板拖拽使用 Hook ============
  const leftPanel = usePanelResize({ initialWidth: 256, minWidth: 200, maxWidth: 360, side: 'left' });
  const rightPanel = usePanelResize({ initialWidth: 320, minWidth: 260, maxWidth: 520, side: 'right' });

  // ============ 保留的独立 useState (表单输入 + UI 状态) ============
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null);
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
  // 场景参考资料
  const [sceneReferences, setSceneReferences] = useState<SceneReference[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  // 本地备份恢复提示
  const [localBackup, setLocalBackup] = useState<{ sceneId: number; data: any } | null>(null);

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

  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  // 检查是否有本地备份需要恢复
  useEffect(() => {
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
  }, [activeScene?.id]);

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
  const handleAddChapterAt = (insertIndex: number) => {
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

  const handleAddSceneAt = (chapterId: number, insertIndex: number) => {
    dispatch({ type: 'SET_ACTIVE_CHAPTER', payload: chapterId });
    const chapter = chapters.find(c => c.id === chapterId);
    const index = computeInsertIndex(chapter?.scenes || [], insertIndex);
    sceneApi.create(bookId, chapterId, {
      index,
      description: '待补充描述',
      cameraMovement: '',
      dialogue: '',
      status: 'DRAFT',
    }).then(newScene => {
      const created: Scene = { ...newScene, chapterId, comments: newScene.comments || [] };
      storeSceneSignature(created);
      dispatch({ type: 'ADD_SCENE', payload: { chapterId, scene: created } });
    }).catch(err => {
      console.error('Failed to create scene', err);
      setToast({ message: '创建场景失败，请稍后再试', tone: 'error' });
    });
  };

  const handleDeleteScene = (chapterId: number, sceneId: number, label: string) => {
    setConfirmDelete({ type: 'scene', chapterId, sceneId, label });
  };

  const handleSelectScene = async (chapterId: number, scene: Scene) => {
    // 自动保存当前编辑
    if (activeChapterId && isSynopsisDirty && activeChapter) {
      const ok = await persistChapterSynopsis(activeChapterId, synopsisDraft);
      if (ok) setToast({ message: '章节梗概已保存', tone: 'success' });
    }
    if (activeScene && activeChapterId && isDirty) {
      await persistScene(activeChapterId, activeScene);
    }
    dispatch({ type: 'SELECT_SCENE', payload: { chapterId, scene } });
    dispatch({ type: 'SET_DIRTY', payload: checkSceneDirty(scene) });
  };

  const handleToggleChapter = (chapterId: number) => {
    if (activeChapterId && isSynopsisDirty && activeChapter) {
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
    dispatch({ type: 'UPDATE_CHAPTER', payload: { chapterId, updates: { title } } });
    chapterApi.update(bookId, chapterId, { title }).catch(err => {
      console.error('Failed to update chapter title', err);
    });
  };

  const handleSaveChapterSynopsis = async () => {
    if (!activeChapter) return;
    dispatch({ type: 'UPDATE_CHAPTER', payload: { chapterId: activeChapter.id, updates: { synopsis: synopsisDraft } } });
    const ok = await persistChapterSynopsis(activeChapter.id, synopsisDraft);
    if (ok) setToast({ message: '章节梗概已保存', tone: 'success' });
    else if (!checkSynopsisDirty(activeChapter.id, synopsisDraft)) setToast({ message: '无改动', tone: 'info' });
  };

  const handleDeleteChapter = (chapterId: number) => {
    const target = chapters.find(ch => ch.id === chapterId);
    setConfirmDelete({ type: 'chapter', chapterId, label: target?.title || '未命名章节' });
  };

  const handleSubmitComment = async (content: string, meta?: string) => {
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

  // Toast 自动隐藏
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // 场景定时自动保存（2秒）
  useEffect(() => {
    if (!isDirty || !activeScene || !activeChapterId) return;
    const timer = setTimeout(() => {
      persistScene(activeChapterId, activeScene);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isDirty, activeScene, activeChapterId, persistScene]);

  // 梗概定时自动保存（2秒）
  useEffect(() => {
    if (!isSynopsisDirty || !activeChapterId) return;
    const timer = setTimeout(() => {
      persistChapterSynopsis(activeChapterId, synopsisDraft);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isSynopsisDirty, activeChapterId, synopsisDraft, persistChapterSynopsis]);

  // Ctrl+S / Cmd+S 手动保存快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S (Windows/Linux) 或 Cmd+S (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // 阻止浏览器默认保存行为

        // 保存当前激活的内容
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

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeScene, activeChapterId, isDirty, isSynopsisDirty, activeChapter, synopsisDraft, persistScene, persistChapterSynopsis]);

  // 离开页面前确保保存
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty || isSynopsisDirty) {
        e.preventDefault();
        // 现代浏览器会显示标准确认对话框
        return (e.returnValue = '您有未保存的更改，确定要离开吗？');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, isSynopsisDirty]);

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
        <div className="flex-1 overflow-y-auto px-2 py-4">
          {chapters.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-white/30">
              <AlertCircle size={32} />
              <p className="text-xs font-semibold">暂无章节，点击下方按钮插入</p>
              <button
                onClick={() => handleAddChapterAt(0)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 transition-colors flex items-center gap-2"
              >
                <Plus size={14} /> 新建章节
              </button>
            </div>
          )}
          {chapters.length > 0 && (
            <>
              <div className="relative flex justify-center my-1 group">
                <div className="w-full max-w-[200px] h-px bg-white/5 group-hover:bg-white/10 transition-colors" />
                <button
                  onClick={() => handleAddChapterAt(0)}
                  className="absolute top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] rounded-full border border-dashed border-white/10 text-white/50 bg-[#1a1a1a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all hover:border-blue-500/50 hover:text-blue-200"
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
                              className="text-left text-sm font-semibold hover:text-blue-300 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChapterId(chapter.id);
                                setEditingTitle(chapter.title || '未命名章节');
                              }}
                            >
                              {chapter.title || '未命名章节'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
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
                      </div>
                    </div>

                    {chapter.id === activeChapterId && (
                      <div className="px-2 pb-3 pt-1 space-y-2">
                        <div className="relative flex justify-center my-1 group">
                          <div className="w-full max-w-[180px] h-px bg-white/5 group-hover:bg-white/10 transition-colors" />
                          <button
                            onClick={() => handleAddSceneAt(chapter.id, 0)}
                            className="absolute top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] rounded-full border border-dashed border-white/10 text-white/50 bg-[#1a1a1a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all hover:border-blue-500/50 hover:text-blue-200"
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
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteScene(chapter.id, scene.id, `场景 ${sceneIdx + 1}`);
                                      }}
                                      className="p-1 rounded-md text-red-300 hover:text-red-100 hover:bg-red-500/20 transition-colors"
                                      title="删除场景"
                                    >
                                      <Trash2 size={14} />
                                    </button>
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
                                  className="absolute top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] rounded-full border border-dashed border-white/10 text-white/50 bg-[#1a1a1a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all hover:border-blue-500/50 hover:text-blue-200"
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
                      className="absolute top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] rounded-full border border-dashed border-white/10 text-white/50 bg-[#1a1a1a] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all hover:border-blue-500/50 hover:text-blue-200"
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
            onClick={() => handleAddChapterAt(chapters.length)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 rounded-xl text-xs font-bold transition-all hover:border-blue-500/50"
          >
            <Plus size={14} /> 添加章节
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
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-h-[140px] resize-none leading-relaxed transition-all placeholder:text-white/5 shadow-inner"
                      value={activeScene.description}
                      onChange={(e) => updateActiveScene(scene => ({ ...scene, description: e.target.value }))}
                      placeholder="详细描述画面内容，包括角色动作、环境变化等..."
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">台词/旁白 (Dialogue)</label>
                    <textarea
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500/50 min-h-[80px] resize-none leading-relaxed"
                      value={activeScene.dialogue}
                      onChange={(e) => updateActiveScene(scene => ({ ...scene, dialogue: e.target.value }))}
                      placeholder="角色的台词或剧情叙述..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">镜头/运镜 (Camera Movement)</label>
                      <textarea
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500/50 min-h-[60px] resize-none leading-relaxed"
                        value={activeScene.cameraMovement}
                        onChange={(e) => updateActiveScene(scene => ({ ...scene, cameraMovement: e.target.value }))}
                        placeholder="特写 / 全景 / 俯视..."
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">转场/剪辑手法 (Transition)</label>
                      <textarea
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500/50 min-h-[60px] resize-none leading-relaxed"
                        value={activeScene.transitionEffect || ''}
                        onChange={(e) => updateActiveScene(scene => ({ ...scene, transitionEffect: e.target.value }))}
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
                         saveError
                           ? 'bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse'
                           : isDirty && !isSaving
                             ? 'bg-orange-400 shadow-[0_0_12px_#fb923c] animate-pulse'
                             : isSaving || isRetrying
                               ? 'bg-yellow-400 shadow-[0_0_12px_#fbbf24]'
                               : 'bg-green-500 shadow-[0_0_12px_#22c55e]'
                       }`} />
                       {(isSaving || isRetrying) && (
                         <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping" />
                       )}
                     </div>

                     {/* 状态文字 */}
                     <div className="flex flex-col gap-0.5">
                       <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${
                         saveError
                           ? 'text-red-300'
                           : isDirty && !isSaving
                             ? 'text-orange-300'
                             : 'text-white/50'
                       }`}>
                         {saveError
                           ? '保存失败'
                           : isRetrying
                             ? `正在重试 (${retryCount}/3)`
                             : isSaving
                               ? '保存中...'
                               : isDirty
                                 ? '未保存'
                                 : '已保存'}
                       </span>
                       {lastSavedAt && !isDirty && (
                         <span className="text-[9px] text-white/30">
                           上次保存：{lastSavedAt.toLocaleTimeString()}
                         </span>
                       )}
                       {saveError && (
                         <span className="text-[9px] text-red-400/70">
                           {saveError}
                         </span>
                       )}
                     </div>
                   </div>

                   {/* 未保存徽章 */}
                   {isDirty && !isSaving && (
                     <div className="px-2.5 py-1 bg-orange-500/20 border border-orange-500/40 rounded-lg text-[10px] font-bold text-orange-200 animate-pulse">
                       有未保存更改
                     </div>
                   )}
                 </div>

                 <button
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
                 </button>
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
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-colors flex items-center gap-2"
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
                      <button
                        onClick={handleSaveChapterSynopsis}
                        disabled={isSavingSynopsis}
                        className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-60"
                      >
                        {isSavingSynopsis ? '保存中...' : '保存梗概'}
                      </button>
                    </div>
                    <textarea
                      rows={10}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500/50 min-h-[200px] resize-none"
                      value={synopsisDraft}
                      onChange={(e) => {
                        setSynopsisDraft(e.target.value);
                        if (activeChapter?.id != null) {
                          dispatch({ type: 'SET_SYNOPSIS_DIRTY', payload: checkSynopsisDirty(activeChapter.id, e.target.value) });
                        }
                      }}
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

        {/* 可拖拽分隔线 */}
        <div
          className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${rightPanel.isResizing ? 'bg-white/20' : ''}`}
          onMouseDown={rightPanel.startResizing}
        />

        {/* 右侧：反馈侧边栏 */}
        <div style={{ width: rightPanel.width }} className="border-l border-white/5 bg-[#121212] flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">审核反馈</span>
            <MessageSquare size={16} className="text-white/20" />
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
                    onUpdate={async (id, content) => {
                      await updateComment(id, content);
                    }}
                    onDelete={async (id) => {
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
                    }}
                    onResolve={async (id) => {
                      await resolveComment(id);
                      if (activeScene?.id) {
                        setSceneUnresolvedCounts(prev => ({
                          ...prev,
                          [activeScene.id]: Math.max(0, (prev[activeScene.id] || 0) - 1)
                        }));
                      }
                    }}
                    onUnresolve={async (id) => {
                      await unresolveComment(id);
                      if (activeScene?.id) {
                        setSceneUnresolvedCounts(prev => ({
                          ...prev,
                          [activeScene.id]: (prev[activeScene.id] || 0) + 1
                        }));
                      }
                    }}
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
            disabled={!activeScene}
            posting={postingComment}
          />
        </div>
      </div>
    </div>
  );
};
