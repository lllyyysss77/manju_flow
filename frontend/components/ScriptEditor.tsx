
import React, { useState, useRef, useEffect } from 'react';
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
  Image as ImageIcon
} from 'lucide-react';

interface ScriptEditorProps {
  episode: Episode;
}

const STATUS_MAP: Record<Status, string> = {
  PENDING: '待处理',
  IN_PROGRESS: '进行中',
  REVIEWING: '审核中',
  REVISING: '修改中',
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

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ episode }) => {
  const [activeScene, setActiveScene] = useState<Scene | null>(episode.scenes[0] || null);

  const handleSaveReference = (dataUrl: string) => {
    if (activeScene) {
      activeScene.referenceImageUrl = dataUrl;
    }
  };

  const handleRemoveReference = () => {
    if (activeScene) {
      activeScene.referenceImageUrl = undefined;
      setActiveScene({...activeScene});
    }
  };

  const renderAddSceneDivider = (index: number) => (
    <div className="relative group/divider h-4 flex items-center justify-center my-1">
      <div className="absolute inset-x-0 h-[1px] bg-blue-500/0 group-hover/divider:bg-blue-500/40 transition-all" />
      <button className="relative z-10 opacity-0 group-hover/divider:opacity-100 bg-blue-600 text-white px-3 py-1 rounded-full text-[9px] font-bold flex items-center gap-1 shadow-lg transition-all scale-90 group-hover/divider:scale-100 hover:bg-blue-500">
        <Plus size={10} /> 在此处添加场景
      </button>
    </div>
  );

  return (
    <div className="flex h-full bg-[#121212]">
      {/* 1. 左侧：场景导航 */}
      <div className="w-64 border-r border-white/5 flex flex-col bg-[#161616]">
        <div className="p-4 border-b border-white/5">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">场景索引</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          {renderAddSceneDivider(0)}
          {episode.scenes.map((scene, idx) => (
            <React.Fragment key={scene.id}>
              <button
                onClick={() => setActiveScene(scene)}
                className={`w-full p-4 text-left rounded-xl transition-all group mb-1 ${
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
              {renderAddSceneDivider(idx + 1)}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 2. 中间：创作核心区 */}
      <div className="flex-1 flex flex-col h-full bg-[#0f0f0f]">
        {activeScene ? (
          <>
            <div className="flex-1 overflow-y-auto p-12">
              <div className="max-w-4xl mx-auto space-y-12">
                <div className="space-y-4">
                  <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">画面描述 (Action & Visuals)</label>
                  <textarea 
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-h-[140px] resize-none leading-relaxed transition-all placeholder:text-white/5 shadow-inner"
                    defaultValue={activeScene.description}
                    placeholder="详细描述画面内容，包括角色动作、环境变化等..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-10">
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">镜头规格 (Shot)</label>
                    <input 
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                      defaultValue={activeScene.shotType}
                      placeholder="特写 / 全景 / 俯视..."
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">台词/旁白 (Dialogue)</label>
                    <textarea 
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500/50 min-h-[60px] resize-none"
                      defaultValue={activeScene.dialogue}
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
               <div className="flex items-center gap-3 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e]" />
                  <span>实时保存中：所有创作已即时同步</span>
               </div>
               <button className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 active:scale-95">
                  <Save size={16} /> 保存剧本
               </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-10">
            <AlertCircle size={64} strokeWidth={1} />
            <p className="mt-4 text-sm font-bold uppercase tracking-widest italic">请从左侧选择一个场景开始编辑</p>
          </div>
        )}
      </div>

      {/* 3. 右侧：反馈侧边栏 */}
      <div className="w-80 border-l border-white/5 bg-[#121212] flex flex-col">
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
  );
};
