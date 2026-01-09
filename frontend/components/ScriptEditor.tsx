
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Episode, Scene, Status } from '../types';
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
  Trash2
} from 'lucide-react';
import { chapterApi, sceneApi } from '../api';

interface ScriptEditorProps {
  bookId: number;
  episodes?: Episode[];
  onEpisodesChange?: (episodes: Episode[]) => void;
}

const STATUS_MAP: Record<Status, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成'
};

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
  initialImage?: string,
  onSave: (dataUrl: string) => void,
  onRemove: () => void
}> = ({ initialImage, onSave, onRemove }) => {
  const [mode, setMode] = useState<'NONE' | 'DRAW' | 'VIEW'>(initialImage ? 'VIEW' : 'NONE');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(6);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onSave(event.target?.result as string);
        setMode('VIEW');
      };
      reader.readAsDataURL(file);
    }
  };

  if (mode === 'VIEW' && initialImage) {
    return (
      <div className="relative group w-full bg-[#1a1a1a] rounded-2xl overflow-hidden border border-white/10 shadow-xl min-h-[300px] flex items-center justify-center">
        <img src={initialImage} className="max-w-full max-h-[500px] object-contain shadow-2xl" alt="参考图" />
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
           <button 
             onClick={() => setMode('DRAW')}
             className="flex items-center gap-2 px-6 py-2.5 bg-white text-black text-xs font-bold rounded-xl hover:bg-zinc-200 transition-all"
           >
             <Pencil size={14} /> 切换为手绘
           </button>
           <button 
             onClick={onRemove}
             className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-500 transition-all"
           >
             <X size={14} /> 移除参考图
           </button>
        </div>
      </div>
    );
  }

  if (mode === 'NONE') {
    return (
      <div className="grid grid-cols-2 gap-6">
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-4 p-12 bg-[#1a1a1a] border-2 border-dashed border-white/5 rounded-2xl hover:bg-white/5 hover:border-blue-500/30 transition-all group"
        >
          <div className="p-4 rounded-full bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
            <Upload size={32} />
          </div>
          <div className="text-center">
            <span className="block text-sm font-bold text-white mb-1">上传本地参考图</span>
            <span className="text-[10px] text-white/20 uppercase tracking-widest">保持原始尺寸，不拉伸</span>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
        </button>
        <button 
          onClick={() => setMode('DRAW')}
          className="flex flex-col items-center justify-center gap-4 p-12 bg-[#1a1a1a] border-2 border-dashed border-white/5 rounded-2xl hover:bg-white/5 hover:border-green-500/30 transition-all group"
        >
          <div className="p-4 rounded-full bg-green-500/10 text-green-500 group-hover:scale-110 transition-transform">
            <Pencil size={32} />
          </div>
          <div className="text-center">
            <span className="block text-sm font-bold text-white mb-1">开启在线手绘</span>
            <span className="text-[10px] text-white/20 uppercase tracking-widest">自由调整 16:9 或 9:16</span>
          </div>
        </button>
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
          onClick={() => {
            const dataUrl = canvasRef.current?.toDataURL();
            if (dataUrl) onSave(dataUrl);
            setMode('VIEW');
          }} 
          className="px-8 py-3 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 flex items-center gap-2 active:scale-95"
        >
          <Check size={16} /> 完成绘制并应用
        </button>
      </div>
    </div>
  );
};

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ bookId, episodes = [], onEpisodesChange }) => {
  const [chapters, setChapters] = useState<Episode[]>(episodes || []);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(episodes?.[0]?.id ?? null);
  const [activeScene, setActiveScene] = useState<Scene | null>(episodes?.[0]?.scenes[0] || null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null);
  const onEpisodesChangeRef = useRef(onEpisodesChange);
  const savedSignaturesRef = useRef<Record<number, string>>({});

  useEffect(() => {
    onEpisodesChangeRef.current = onEpisodesChange;
  }, [onEpisodesChange]);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [leftPanelWidth, setLeftPanelWidth] = useState(256);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const MIN_LEFT = 200;
  const MAX_LEFT = 360;
  const MIN_RIGHT = 260;
  const MAX_RIGHT = 520;

  const computeInsertIndex = (items: { index?: number }[], insertIndex: number) => {
    if (items.length === 0) return 1;
    const normalized = items.map(it => it.index ?? 0);
    if (insertIndex === 0) return (normalized[0] ?? 0) - 1 || 0;
    if (insertIndex >= items.length) return (normalized[items.length - 1] ?? 0) + 1;
    const prev = normalized[insertIndex - 1] ?? 0;
    const next = normalized[insertIndex] ?? prev + 1;
    return (prev + next) / 2;
  };

  const getSignature = (scene: Scene) =>
    JSON.stringify({
      description: scene.description,
      cameraMovement: scene.cameraMovement,
      dialogue: scene.dialogue,
      status: scene.status,
      index: scene.index,
      referenceImageUrl: scene.referenceImageUrl,
    });

  const loadChapters = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await chapterApi.list(bookId, true);
      const data = (res.data || []).map(ch => ({
        id: ch.id,
        title: ch.title,
        index: ch.index,
        status: ch.status as Status,
        scenes: (ch.scenes || []).map(s => ({
          id: s.id,
          index: s.index,
          description: s.description || '',
          cameraMovement: s.cameraMovement || '',
          dialogue: s.dialogue || '',
          status: s.status as Status,
          comments: [],
          referenceImageUrl: s.referenceImageUrl,
          startFrameUrl: s.startFrameUrl,
          endFrameUrl: s.endFrameUrl,
          clipUrl: s.clipUrl,
        })) as Scene[],
      })) as Episode[];
      const savedSig: Record<number, string> = {};
      data.forEach(ch => (ch.scenes || []).forEach(sc => { savedSig[sc.id] = getSignature(sc); }));
      savedSignaturesRef.current = savedSig;
      setChapters(data);
      setActiveChapterId(data[0]?.id ?? null);
      setActiveScene(data[0]?.scenes[0] || null);
      if (data[0]?.scenes[0]) {
        setIsDirty(false);
      }
      onEpisodesChangeRef.current?.(data);
    } catch (err) {
      console.error('Failed to load chapters', err);
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    loadChapters();
  }, [loadChapters]);

  const commitChapters = (next: Episode[]) => {
    setChapters(next);
    onEpisodesChange?.(next);
  };

  const handleAddChapterAt = (insertIndex: number) => {
    const index = computeInsertIndex(chapters, insertIndex);
    chapterApi.create(bookId, { title: `新章节 ${chapters.length + 1}`, index, status: 'DRAFT' }).then(res => {
      const newChapter: Episode = { id: res.id, title: res.title, index: res.index, status: res.status as Status, scenes: [] };
      const next = [...chapters];
      next.splice(insertIndex, 0, newChapter);
      commitChapters(next);
      setActiveChapterId(newChapter.id);
      setActiveScene(null);
    }).catch(err => {
      console.error('Failed to create chapter', err);
      alert('创建章节失败，请稍后再试');
    });
  };

  const handleAddSceneAt = (chapterId: number, insertIndex: number) => {
    setActiveChapterId(chapterId);
    const chapter = chapters.find(c => c.id === chapterId);
    const index = computeInsertIndex(chapter?.scenes || [], insertIndex);
    sceneApi.create(bookId, chapterId, {
      index,
      description: '待补充描述',
      cameraMovement: '',
      dialogue: '',
      status: 'DRAFT',
    }).then(newScene => {
      const created: Scene = { ...newScene, comments: newScene.comments || [] };
      savedSignaturesRef.current[created.id] = getSignature(created);
      const next = chapters.map(ch => {
        if (ch.id !== chapterId) return ch;
        const scenes = [...(ch.scenes || []), created].sort((a, b) => a.index - b.index);
        const inserted = scenes.find(s => s.id === created.id) || created;
        setActiveScene(inserted);
        return { ...ch, scenes };
      });
      commitChapters(next);
    }).catch(err => {
      console.error('Failed to create scene', err);
      alert('创建场景失败，请稍后再试');
    });
  };

  const handleSelectScene = async (chapterId: number, scene: Scene) => {
    if (activeScene && activeChapterId && isDirty) {
      await persistScene(activeChapterId, activeScene);
    }
    setActiveChapterId(chapterId);
    setActiveScene(scene);
    const sig = getSignature(scene);
    setIsDirty(savedSignaturesRef.current[scene.id] !== sig);
    setSaveError(null);
  };

  const handleToggleChapter = (chapterId: number) => {
    if (activeChapterId === chapterId) {
      setActiveChapterId(null);
      setActiveScene(null);
      return;
    }
    const targetChapter = chapters.find(ch => ch.id === chapterId);
    setActiveChapterId(chapterId);
    setActiveScene(targetChapter?.scenes?.[0] || null);
  };

  const handleUpdateChapterTitle = (chapterId: number, title: string) => {
    const next = chapters.map(ch => (ch.id === chapterId ? { ...ch, title } : ch));
    commitChapters(next);
    chapterApi.update(bookId, chapterId, { title }).catch(err => {
      console.error('Failed to update chapter title', err);
    });
  };

  const handleDeleteChapter = (chapterId: number) => {
    chapterApi.delete(bookId, chapterId).then(() => {
      const next = chapters.filter(ch => ch.id !== chapterId);
      commitChapters(next);
      const remainingScenes = next.flatMap(ch => ch.scenes || []);
      const newSignatures: Record<number, string> = {};
      remainingScenes.forEach(s => { newSignatures[s.id] = savedSignaturesRef.current[s.id]; });
      savedSignaturesRef.current = newSignatures;
      if (activeChapterId === chapterId) {
        const fallback = next[0];
        setActiveChapterId(fallback?.id || null);
        setActiveScene(fallback?.scenes?.[0] || null);
      } else if (activeScene) {
        const stillExists = next.some(ch => (ch.scenes || []).some(s => s.id === activeScene.id));
        if (!stillExists) {
          setActiveScene(null);
        }
      }
    }).catch(err => {
      console.error('Failed to delete chapter', err);
      alert('删除章节失败，请稍后再试');
    });
  };

  const activeChapter = chapters.find(c => c.id === activeChapterId) || null;

  const persistScene = async (chapterId: number, scene: Scene): Promise<boolean> => {
    const currentSig = getSignature(scene);
    if (savedSignaturesRef.current[scene.id] === currentSig) {
      setIsDirty(false);
      return false;
    }
    setIsSaving(true);
    try {
      const updated = await sceneApi.update(bookId, chapterId, scene.id, {
        index: scene.index,
        status: scene.status,
        description: scene.description,
        cameraMovement: scene.cameraMovement,
        dialogue: scene.dialogue,
        referenceImageUrl: scene.referenceImageUrl,
      });
      savedSignaturesRef.current[scene.id] = getSignature(updated);
      setIsDirty(false);
      setLastSavedAt(new Date());
      setSaveError(null);
      // 仅手动保存会触发 toast，自动保存不设置
      return true;
    } catch (err) {
      console.error('Failed to save scene', err);
      setSaveError('保存失败，请重试');
      setToast({ message: '保存失败，请重试', tone: 'error' });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const updateActiveScene = (updater: (scene: Scene) => Scene) => {
    if (!activeScene || !activeChapterId) return;
    const nextScene = updater(activeScene);
    const next = chapters.map(ch => {
      if (ch.id !== activeChapterId) return ch;
      const scenes = (ch.scenes || []).map(s => (s.id === activeScene.id ? nextScene : s));
      return { ...ch, scenes };
    });
    setActiveScene(nextScene);
    commitChapters(next);
    const sig = getSignature(nextScene);
    setIsDirty(savedSignaturesRef.current[nextScene.id] !== sig);
    setSaveError(null);
  };

  const handleSaveReference = (dataUrl: string) => {
    updateActiveScene(scene => ({ ...scene, referenceImageUrl: dataUrl }));
  };

  const handleRemoveReference = () => {
    updateActiveScene(scene => ({ ...scene, referenceImageUrl: undefined }));
  };

  useEffect(() => {
    if (!isResizingLeft) return;
    const handleMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_LEFT, Math.max(MIN_LEFT, e.clientX));
      setLeftPanelWidth(newWidth);
    };
    const handleUp = () => setIsResizingLeft(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizingLeft]);

  useEffect(() => {
    if (!isResizingRight) return;
    const handleMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_RIGHT, Math.max(MIN_RIGHT, window.innerWidth - e.clientX));
      setRightPanelWidth(newWidth);
    };
    const handleUp = () => setIsResizingRight(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizingRight]);

  // Toast 自动隐藏
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // 定时保存
  useEffect(() => {
    if (!isDirty || !activeScene || !activeChapterId) return;
    const timer = setTimeout(() => {
      persistScene(activeChapterId, activeScene);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isDirty, activeScene, activeChapterId]);

  return (
    <div className="flex h-full bg-[#121212] relative">
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
      <div style={{ width: leftPanelWidth }} className="border-r border-white/5 flex flex-col bg-[#161616]">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">章节 / 场景</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveChapterId(null);
              setActiveScene(null);
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
              {chapters.map((chapter, idx) => (
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
                          <span className="text-[11px] font-bold uppercase tracking-widest">章节</span>
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
                        {(chapter.scenes || []).length === 0 ? (
                          <div className="w-full border border-dashed border-white/10 rounded-xl py-3 text-white/40 text-sm flex items-center justify-center gap-2">
                            暂无场景，请在上方或下方插入
                          </div>
                        ) : (
                          (chapter.scenes || []).map((scene, sceneIdx) => (
                            <React.Fragment key={scene.id}>
                              <button
                                onClick={() => handleSelectScene(chapter.id, scene)}
                                className={`w-full p-4 text-left rounded-xl transition-all ${
                                  activeScene?.id === scene.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20' : 'hover:bg-white/5'
                                }`}
                              >
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${activeScene?.id === scene.id ? 'text-white' : 'text-white/20'}`}>
                                    场景 {scene.index}
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                    activeScene?.id === scene.id ? 'bg-white/20 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/20'
                                  }`}>
                                    {STATUS_MAP[scene.status]}
                                  </span>
                                </div>
                                <p className={`text-sm line-clamp-2 leading-snug font-medium transition-colors ${activeScene?.id === scene.id ? 'text-white' : 'text-white/60 group-hover:text-white'}`}>
                                  {scene.description || '点击添加描述...'}
                                </p>
                              </button>
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
              ))}
            </>
          )}
        </div>
      </div>

      {/* 左侧与中间的分隔线 */}
      <div
        className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingLeft ? 'bg-white/20' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingLeft(true);
        }}
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

                <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">镜头/运镜 (Camera Movement)</label>
                    <input 
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                      value={activeScene.cameraMovement}
                      onChange={(e) => updateActiveScene(scene => ({ ...scene, cameraMovement: e.target.value }))}
                      placeholder="特写 / 全景 / 俯视... "
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">台词/旁白 (Dialogue)</label>
                    <textarea 
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500/50 min-h-[60px] resize-none"
                      value={activeScene.dialogue}
                      onChange={(e) => updateActiveScene(scene => ({ ...scene, dialogue: e.target.value }))}
                      placeholder="角色的台词或剧情叙述..."
                    />
                  </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <ImageIcon size={14} className="text-blue-500" />
                      <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">分镜火柴人参考图</label>
                    </div>
                    <ReferenceSection 
                      initialImage={activeScene.referenceImageUrl}
                      onSave={handleSaveReference}
                      onRemove={handleRemoveReference}
                    />
                  </div>
                </div>
              </div>
              
              <div className="h-16 bg-[#1a1a1a] border-t border-white/5 flex justify-between items-center px-10">
                 <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest">
                 <div className={`w-1.5 h-1.5 rounded-full ${saveError ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : isSaving ? 'bg-yellow-400 shadow-[0_0_8px_#fbbf24]' : 'bg-green-500 shadow-[0_0_8px_#22c55e]'}`} />
                 <span className={saveError ? 'text-red-300' : 'text-white/40'}>
                   {saveError
                     ? saveError
                     : isSaving
                       ? '保存中...'
                       : `实时保存：${lastSavedAt ? `上次 ${lastSavedAt.toLocaleTimeString()}` : '尚未保存'}`}
                 </span>
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
                    <Save size={16} /> 手动保存
                 </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
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
              ) : (
                <>
                  <AlertCircle size={48} className="text-white/30" />
                  <p className="text-sm font-bold uppercase tracking-widest text-white/60">请选择或创建一个场景开始创作</p>
                  {activeChapter && (
                    <button
                      onClick={() => handleAddSceneAt(activeChapter.id, activeChapter.scenes?.length || 0)}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-colors flex items-center gap-2"
                    >
                      <Plus size={16} /> 在当前章节添加场景
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 可拖拽分隔线 */}
        <div
          className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingRight ? 'bg-white/20' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingRight(true);
          }}
        />

        {/* 右侧：反馈侧边栏 */}
        <div style={{ width: rightPanelWidth }} className="border-l border-white/5 bg-[#121212] flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">审核反馈</span>
            <MessageSquare size={16} className="text-white/20" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeScene?.comments.length ? activeScene.comments.map(c => (
              <div key={c.id} className="bg-[#1a1a1a] p-4 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all">
                <div className="flex justify-between mb-2">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">{c.author}</span>
                  <span className="text-[9px] text-white/20">{c.timestamp}</span>
                </div>
                <p className="text-sm text-white/70 leading-relaxed font-medium">{c.text}</p>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center gap-4 opacity-10">
                <MessageSquare size={48} strokeWidth={1} />
                <p className="text-[10px] font-bold uppercase tracking-widest">暂无修改意见</p>
              </div>
            )}
          </div>

          <div className="p-4 bg-[#161616] border-t border-white/5">
            <textarea 
              className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl p-4 text-sm text-white placeholder:text-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-24 mb-3 transition-all"
              placeholder="输入您的修改意见或审核回复..."
            />
            <button className="w-full py-3 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-xl border border-white/10 transition-all active:scale-95">
              发布评论
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
