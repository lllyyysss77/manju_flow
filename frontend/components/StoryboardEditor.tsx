
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Episode, Status } from '../types';
import { fileApi, storyboardApi, StoryboardVersion } from '../api';
import { 
  MessageSquare, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight,
  Info,
  Type,
  Camera,
  Music,
  History,
  Clock
} from 'lucide-react';

interface StoryboardEditorProps {
  episodes?: Episode[];
  episode?: Episode; // backward compatibility
}

const STATUS_MAP: Record<Status, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成'
};
export const StoryboardEditor: React.FC<StoryboardEditorProps> = ({ episodes = [], episode }) => {
  const chapterList = useMemo(() => {
    if (episodes.length > 0) return episodes;
    return episode ? [episode] : [];
  }, [episodes, episode]);
  const hasChapters = chapterList.length > 0;

  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const activeEpisode = chapterList[activeChapterIndex];
  const normalizedScenes = useMemo(
    () => (activeEpisode?.scenes || []).map(scene => ({ ...scene, comments: scene.comments || [] })),
    [activeEpisode]
  );
  const sortedScenes = useMemo(
    () => [...normalizedScenes].sort((a, b) => a.index - b.index),
    [normalizedScenes]
  );

  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  useEffect(() => {
    if (activeSceneIndex >= sortedScenes.length) {
      setActiveSceneIndex(Math.max(0, sortedScenes.length - 1));
    }
  }, [activeSceneIndex, sortedScenes.length]);
  const activeScene = sortedScenes[activeSceneIndex];
  const hasScene = sortedScenes.length > 0;

  const [sceneFrames, setSceneFrames] = useState<Record<number, { startUrl?: string; endUrl?: string; startVersion?: number; endVersion?: number }>>({});
  const [versionsMap, setVersionsMap] = useState<Record<number, { start: StoryboardVersion[]; end: StoryboardVersion[] }>>({});
  const [previewCache, setPreviewCache] = useState<Record<number, string>>({});
  const [scenePreviewCache, setScenePreviewCache] = useState<Record<number, string>>({});
  const [urlCache, setUrlCache] = useState<Record<string, string>>({});
  const [loadingStoryboard, setLoadingStoryboard] = useState(false);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [historyPanel, setHistoryPanel] = useState<{ type: 'start' | 'end'; open: boolean }>({ type: 'start', open: false });
  const [historySelection, setHistorySelection] = useState<{ start?: string; end?: string }>({});
  const [resolvedReference, setResolvedReference] = useState<string | undefined>();
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [rightPanelWidth, setRightPanelWidth] = useState(300);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const MIN_LEFT = 220;
  const MAX_LEFT = 420;
  const MIN_RIGHT = 260;
  const MAX_RIGHT = 520;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

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
  }, [isResizingLeft, MAX_LEFT, MIN_LEFT]);

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
  }, [isResizingRight, MAX_RIGHT, MIN_RIGHT]);

  const resolveFileUrl = useCallback(async (raw?: string | null) => {
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    const cached = urlCache[raw];
    if (cached) return cached;
    try {
      const res = await fileApi.getSignedUrl(raw);
      const resolved = res.url || raw;
      setUrlCache(prev => ({ ...prev, [raw]: resolved }));
      return resolved;
    } catch (err) {
      console.error('Failed to resolve file url', err);
      return raw;
    }
  }, [urlCache]);

  useEffect(() => {
    if (!activeScene?.referenceImageUrl) {
      setResolvedReference(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const url = await resolveFileUrl(activeScene.referenceImageUrl);
      if (!cancelled) setResolvedReference(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.referenceImageUrl, resolveFileUrl]);

  const primeVersionCache = useCallback(async (items: StoryboardVersion[]) => {
    const entries = await Promise.all(
      items.map(async item => {
        const resolved = await resolveFileUrl(item.imageUrl);
        return [item.id, resolved] as const;
      })
    );
    const mapped = Object.fromEntries(entries);
    setPreviewCache(prev => ({ ...prev, ...mapped }));
  }, [resolveFileUrl]);

  const refreshStoryboard = useCallback(async (sceneId: number) => {
    const info = await storyboardApi.getInfo(sceneId);
    const [startVersionsRes, endVersionsRes] = await Promise.all([
      storyboardApi.listStartVersions(sceneId),
      storyboardApi.listEndVersions(sceneId),
    ]);
    const [resolvedStart, resolvedEnd] = await Promise.all([
      info.startFrameUrl ? resolveFileUrl(info.startFrameUrl) : Promise.resolve(''),
      info.endFrameUrl ? resolveFileUrl(info.endFrameUrl) : Promise.resolve(''),
    ]);
    setSceneFrames(prev => ({
      ...prev,
      [sceneId]: {
        startUrl: resolvedStart || undefined,
        endUrl: resolvedEnd || undefined,
        startVersion: info.startFrameVersion,
        endVersion: info.endFrameVersion,
      },
    }));
    const startVersions = startVersionsRes.data || [];
    const endVersions = endVersionsRes.data || [];
    setVersionsMap(prev => ({
      ...prev,
      [sceneId]: {
        start: startVersions,
        end: endVersions,
      },
    }));
    await primeVersionCache([...startVersions, ...endVersions]);
  }, [primeVersionCache, resolveFileUrl]);

  useEffect(() => {
    if (!activeScene?.id) return;
    let cancelled = false;
    const load = async () => {
      setLoadingStoryboard(true);
      setStoryboardError(null);
      try {
        await refreshStoryboard(activeScene.id);
        if (!cancelled) setHistorySelection({});
      } catch (err) {
        if (!cancelled) setStoryboardError(err instanceof Error ? err.message : '加载分镜失败');
      } finally {
        if (!cancelled) setLoadingStoryboard(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id, refreshStoryboard]);

  const handleUploadFrame = async (type: 'start' | 'end', file?: File | null) => {
    if (!file || !activeScene?.id) return;
    setUploading(prev => ({ ...prev, [type]: true }));
    try {
      const uploaded = await fileApi.upload(file, 'private');
      const key = uploaded.key || uploaded.url;
      if (type === 'start') {
        await storyboardApi.updateStartFrame(activeScene.id, key);
      } else {
        await storyboardApi.updateEndFrame(activeScene.id, key);
      }
      await refreshStoryboard(activeScene.id);
      setToast({ message: `${type === 'start' ? '起始帧' : '结束帧'}已保存`, tone: 'success' });
      setHistorySelection({});
    } catch (err) {
      console.error('Upload frame failed', err);
      setToast({ message: '保存失败，请重试', tone: 'error' });
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
      if (type === 'start' && startInputRef.current) startInputRef.current.value = '';
      if (type === 'end' && endInputRef.current) endInputRef.current.value = '';
    }
  };

  const applyVersion = async (type: 'start' | 'end', version: number) => {
    if (!activeScene?.id) return;
    setUploading(prev => ({ ...prev, [type]: true }));
    try {
      if (type === 'start') {
        await storyboardApi.revertStartFrame(activeScene.id, version);
      } else {
        await storyboardApi.revertEndFrame(activeScene.id, version);
      }
      setToast({ message: '已切换到该版本', tone: 'success' });
      setHistorySelection({});
      await refreshStoryboard(activeScene.id);
    } catch (err) {
      console.error('Failed to apply version', err);
      setToast({ message: '切换失败，请重试', tone: 'error' });
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  const frameData = activeScene ? sceneFrames[activeScene.id] : undefined;
  const currentVersions = activeScene ? versionsMap[activeScene.id] || { start: [], end: [] } : { start: [], end: [] };
  const startDisplayUrl = historySelection.start || frameData?.startUrl || activeScene?.startFrameUrl || '';
  const endDisplayUrl = historySelection.end || frameData?.endUrl || activeScene?.endFrameUrl || '';
  const sceneComments = activeScene?.comments || [];

  useEffect(() => {
    sortedScenes.forEach(scene => {
      const raw = sceneFrames[scene.id]?.startUrl || scene.startFrameUrl;
      if (!raw) return;
      if (scenePreviewCache[scene.id]) return;
      resolveFileUrl(raw).then(url => {
        setScenePreviewCache(prev => (prev[scene.id] ? prev : { ...prev, [scene.id]: url }));
      });
    });
  }, [sortedScenes, sceneFrames, resolveFileUrl, scenePreviewCache]);

  if (!hasChapters) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm bg-[#0f0f0f]">
        暂无章节数据，请先在剧本阶段创建章节与场景
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] relative">
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
          <div
            className={`px-5 py-2 rounded-lg border text-sm shadow-xl ${
              toast.tone === 'success'
                ? 'bg-green-500/20 border-green-500/40 text-green-100'
                : 'bg-red-500/20 border-red-500/40 text-red-100'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
      {/* 顶部章节/场景切换条 */}
      <div className="border-b border-white/5 bg-[#141414]">
        <div className="px-4 py-3 flex gap-2 overflow-x-auto border-b border-white/10">
          {chapterList.map((ch, cIdx) => (
            <button
              key={ch.id}
              onClick={() => {
                setActiveChapterIndex(cIdx);
                setActiveSceneIndex(0);
              }}
              className={`flex-shrink-0 px-4 py-2 rounded-xl border transition-all text-left min-w-[180px] ${
                activeChapterIndex === cIdx
                  ? 'bg-blue-600/20 border-blue-500/40 text-white shadow-[0_0_20px_rgba(59,130,246,0.35)]'
                  : 'bg-[#0f0f0f] border-white/10 text-white/60 hover:border-white/30 hover:text-white'
              }`}
            >
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">章节 {cIdx + 1}</div>
              <div className="text-sm font-semibold line-clamp-1">{ch.title || '未命名章节'}</div>
              <div className="text-[11px] text-white/40 mt-1">场景 {ch.scenes?.length || 0} 个</div>
            </button>
          ))}
        </div>
        <div className="h-20 border-t border-white/10 bg-[#161616] flex items-center px-4 gap-2 overflow-x-auto">
          {sortedScenes.map((scene, idx) => {
            const displayNumber = idx + 1;
            const preview = scenePreviewCache[scene.id] || sceneFrames[scene.id]?.startUrl || scene.startFrameUrl;
            return (
            <button
              key={scene.id}
              onClick={() => setActiveSceneIndex(idx)}
              className={`flex-shrink-0 w-32 h-14 rounded border transition-all relative overflow-hidden group ${
                activeSceneIndex === idx 
                  ? 'border-blue-500 ring-1 ring-blue-500' 
                  : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'
              }`}
            >
              {preview ? (
                <img src={preview} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-[10px] text-white/20 font-bold">
                  SCENE {displayNumber}
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] py-0.5 px-1 text-white/70 font-mono">
                #{displayNumber}
              </div>
              {scene.status === 'COMPLETED' && (
                <div className="absolute top-1 right-1">
                  <CheckCircle2 size={10} className="text-green-500 shadow-sm" />
                </div>
              )}
            </button>
          );
          })}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {!hasScene ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm bg-[#0a0a0a]">
            当前章节暂无场景，可切换章节查看或在剧本阶段先添加场景
          </div>
        ) : (
        <>
        {storyboardError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
            <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-100 text-sm shadow-xl">
              分镜数据加载失败：{storyboardError}
            </div>
          </div>
        )}
        {loadingStoryboard && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-2 bg-black/60 border border-white/10 rounded-lg text-white/70 text-sm backdrop-blur-sm">
              正在同步分镜数据...
            </div>
          </div>
        )}
        {/* 左侧：剧本参考区 */}
        <div
          style={{ width: leftPanelWidth }}
          className="border-r border-white/5 bg-[#121212] overflow-y-auto p-6 flex flex-col gap-8 min-w-[220px] max-w-[420px]"
        >
          <section>
            <div className="flex items-center gap-2 mb-4 text-blue-400">
              <Info size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">画面需求</h3>
            </div>
            <div className="bg-white/5 rounded-lg p-4 border border-white/5">
              <p className="text-sm text-white/90 leading-relaxed italic">
                "{activeScene.description}"
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-orange-400">
              <Camera size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">镜头/构图</h3>
            </div>
            <p className="text-sm text-white/60 font-medium px-1">
              {activeScene.cameraMovement || '未指定镜头类型'}
            </p>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-purple-400">
              <Type size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">台词/旁白</h3>
            </div>
            <div className="bg-blue-600/5 border-l-2 border-blue-500 p-3">
              <p className="text-sm text-white/80 leading-snug">
                {activeScene.dialogue || <span className="text-white/20 italic">（无台词）</span>}
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-green-400">
              <Music size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">参考图</h3>
            </div>
            {activeScene.referenceImageUrl ? (
              <img src={resolvedReference || activeScene.referenceImageUrl} className="w-full rounded-lg border border-white/10" alt="参考图" />
            ) : (
              <p className="text-xs text-white/40 leading-relaxed px-1">暂无参考图</p>
            )}
          </section>
        </div>

        <div
          className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingLeft ? 'bg-white/20' : ''}`}
          onMouseDown={e => {
            e.preventDefault();
            setIsResizingLeft(true);
          }}
        />

        {/* 中间：画布展示区 */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a] relative">
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  场景 {activeSceneIndex + 1} 画稿绘制
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    activeScene.status === 'COMPLETED' ? 'bg-green-600 text-white' : 'bg-orange-600/20 text-orange-400 border border-orange-600/30'
                  }`}>
                    {STATUS_MAP[activeScene.status]}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button 
                    disabled={activeSceneIndex === 0}
                    onClick={() => setActiveSceneIndex(prev => prev - 1)}
                    className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white disabled:opacity-10 transition-all"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    disabled={activeSceneIndex === sortedScenes.length - 1}
                    onClick={() => setActiveSceneIndex(prev => prev + 1)}
                    className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white disabled:opacity-10 transition-all"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* 主画稿卡片 */}
              <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">起始帧 / 关键帧 A</span>
                <button
                  onClick={() => setHistoryPanel({ type: 'start', open: true })}
                  className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all"
                >
                  <History size={12} /> 查看历史版本
                </button>
              </div>
              <div className="aspect-video w-full rounded-xl border-2 border-dashed border-white/5 bg-zinc-900 overflow-hidden relative group">
                {startDisplayUrl ? (
                  <>
                    <img src={startDisplayUrl} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button
                        onClick={() => startInputRef.current?.click()}
                        className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg shadow-xl"
                        disabled={uploading.start}
                      >
                        {uploading.start ? '上传中...' : '更换图片'}
                      </button>
                    </div>
                    {frameData?.startVersion ? (
                      <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-black/60 text-white/70 border border-white/10">
                        版本 #{frameData.startVersion}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <button
                    onClick={() => startInputRef.current?.click()}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 hover:bg-white/5 transition-colors"
                    disabled={uploading.start}
                  >
                    <Upload size={32} className="text-white/20" />
                    <span className="text-xs font-bold text-white/20 uppercase">
                      {uploading.start ? '上传中...' : '点击上传首帧'}
                    </span>
                  </button>
                )}
                <input
                  type="file"
                  accept="image/*"
                  ref={startInputRef}
                  className="hidden"
                  onChange={e => handleUploadFrame('start', e.target.files?.[0])}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">结束帧 / 关键帧 B</span>
                <button
                  onClick={() => setHistoryPanel({ type: 'end', open: true })}
                  className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all"
                >
                  <History size={12} /> 查看历史版本
                </button>
              </div>
              <div className="aspect-video w-full rounded-xl border-2 border-dashed border-white/5 bg-zinc-900 overflow-hidden relative group">
                {endDisplayUrl ? (
                   <>
                    <img src={endDisplayUrl} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button
                        onClick={() => endInputRef.current?.click()}
                        className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg shadow-xl"
                        disabled={uploading.end}
                      >
                        {uploading.end ? '上传中...' : '更换图片'}
                      </button>
                    </div>
                    {frameData?.endVersion ? (
                      <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-black/60 text-white/70 border border-white/10">
                        版本 #{frameData.endVersion}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <button
                    onClick={() => endInputRef.current?.click()}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 hover:bg-white/5 transition-colors"
                    disabled={uploading.end}
                  >
                    <Upload size={32} className="text-white/20" />
                    <span className="text-xs font-bold text-white/20 uppercase">
                      {uploading.end ? '上传中...' : '上传尾帧 (可选)'}
                    </span>
                  </button>
                )}
                <input
                  type="file"
                  accept="image/*"
                  ref={endInputRef}
                  className="hidden"
                  onChange={e => handleUploadFrame('end', e.target.files?.[0])}
                />
              </div>
            </div>
          </div>

              {/* 审核反馈摘要（快捷查看） */}
              {activeScene.comments.length > 0 && (
                <div className="bg-red-900/10 border border-red-500/20 rounded-xl p-4 flex gap-4 items-start">
                  <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-500 mb-1">主编修改意见</h4>
                    <p className="text-sm text-white/70">"{activeScene.comments[activeScene.comments.length - 1].text}"</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-[#1a1a1a] border-t border-white/5 flex justify-end items-center px-10">
            <div className="flex items-center gap-2 text-white/30">
              <CheckCircle2 size={14} className="text-green-500/50" />
              <span className="text-[10px] font-bold uppercase tracking-widest">画稿资产已同步至云端 (可实时审核)</span>
            </div>
          </div>
        </div>

        <div
          className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingRight ? 'bg-white/20' : ''}`}
          onMouseDown={e => {
            e.preventDefault();
            setIsResizingRight(true);
          }}
        />

        {/* 历史版本侧滑面板 */}
        {historyPanel.open && (
          <div className="fixed inset-0 z-30">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setHistoryPanel({ ...historyPanel, open: false })}
            />
            <div className="absolute right-0 top-0 bottom-0 w-[360px] bg-[#0f0f0f] border-l border-white/10 shadow-2xl animate-in fade-in slide-in-from-right">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History size={16} className="text-blue-400" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">历史版本</p>
                    <p className="text-sm text-white/80">{historyPanel.type === 'start' ? '起始帧' : '结束帧'}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto h-full">
                {(historyPanel.type === 'start' ? currentVersions.start : currentVersions.end).map(item => {
                  const url = previewCache[item.id] || item.imageUrl;
                  const label = `版本 #${item.version}`;
                  const time = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) : '时间未知';
                  return (
                    <div
                      key={`${item.frameType}-${item.id}`}
                      className="w-full text-left bg-white/5 border border-white/10 rounded-xl overflow-hidden transition-all hover:border-white/30"
                    >
                      <div className="aspect-video bg-black overflow-hidden">
                        <img src={url} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-3 flex items-center justify-between gap-2 text-white/80">
                        <div>
                          <p className="text-sm font-semibold">{label}</p>
                          <div className="flex items-center gap-1 text-xs text-white/40">
                            <Clock size={12} /> {time}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => applyVersion(historyPanel.type, item.version)}
                            className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50"
                            disabled={uploading[historyPanel.type]}
                          >
                            设为当前
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(historyPanel.type === 'start' ? currentVersions.start : currentVersions.end).length === 0 && (
                  <div className="text-center text-white/40 text-sm py-10 border border-dashed border-white/10 rounded-xl">
                    暂无历史版本
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 右侧：实时评审交流区 */}
        <div
          style={{ width: rightPanelWidth }}
          className="border-l border-white/5 bg-[#121212] flex flex-col min-w-[260px] max-w-[520px]"
        >
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">修改历史与讨论</span>
            <MessageSquare size={16} className="text-white/20" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sceneComments.map(c => (
              <div key={c.id} className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5">
                <div className="flex justify-between mb-2">
                  <span className="text-[10px] font-bold text-blue-400 uppercase">{c.author}</span>
                  <span className="text-[9px] text-white/20">{c.timestamp}</span>
                </div>
                <p className="text-sm text-white/70 leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>

          <div className="p-4 bg-[#161616] border-t border-white/5">
            <textarea 
              className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-24 mb-3"
              placeholder="添加修改意见或反馈..."
            />
            <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all">发布评论</button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
};
