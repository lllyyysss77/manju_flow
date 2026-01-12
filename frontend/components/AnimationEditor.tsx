
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Episode, Scene, Status } from '../types';
import { fileApi, animationApi, AnimationVersion } from '../api';
import { 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight,
  Info,
  Play,
  Film,
  MonitorPlay,
  Layout,
  Type,
  History,
  Send
} from 'lucide-react';

interface AnimationEditorProps {
  episode?: Episode;
  episodes?: Episode[];
}

const STATUS_MAP: Record<Status, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成'
};

export const AnimationEditor: React.FC<AnimationEditorProps> = ({ episode, episodes }) => {
  const sourceChapters = useMemo(() => {
    if (episodes && episodes.length) return episodes;
    if (episode) return [episode];
    return [];
  }, [episode, episodes]);

  const normalizedChapters = useMemo<Episode[]>(() => {
    const normalizeScenes = (scenes: Scene[]) =>
      (scenes || []).map((scene, idx) => ({
        ...scene,
        comments: scene.comments || [],
        dialogue: scene.dialogue || '此处补充对白与情绪提示',
        description: scene.description || '此镜头暂无描述，请补充。',
        index: scene.index || idx + 1,
        cameraMovement: scene.cameraMovement || '平移',
        status: scene.status || 'IN_PROGRESS',
        animationUrl: scene.animationUrl || scene.clipUrl,
        clipUrl: scene.clipUrl || scene.animationUrl,
        animationVersion: scene.animationVersion,
      }));

    return (sourceChapters || []).map(ch => ({
      ...ch,
      title: ch.title || `第 ${ch.index || 1} 章`,
      scenes: normalizeScenes(ch.scenes || []),
    }));
  }, [episode, sourceChapters]);

  const hasChapters = normalizedChapters.length > 0;
  const [activeChapterId, setActiveChapterId] = useState<number | null>(normalizedChapters[0]?.id || null);
  const activeChapter = useMemo(
    () => normalizedChapters.find(c => c.id === activeChapterId) || normalizedChapters[0],
    [activeChapterId, normalizedChapters]
  );
  useEffect(() => {
    setActiveChapterId(normalizedChapters[0]?.id || null);
  }, [normalizedChapters]);

  const sortedScenes = useMemo(
    () => (activeChapter ? [...(activeChapter.scenes || [])].sort((a, b) => a.index - b.index) : []),
    [activeChapter]
  );
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  useEffect(() => {
    setActiveSceneIndex(0);
  }, [activeChapterId]);
  useEffect(() => {
    if (activeSceneIndex >= sortedScenes.length) {
      setActiveSceneIndex(Math.max(0, sortedScenes.length - 1));
    }
  }, [activeSceneIndex, sortedScenes.length]);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [animationMap, setAnimationMap] = useState<Record<number, { url?: string; version?: number }>>({});
  const [versionMap, setVersionMap] = useState<Record<number, AnimationVersion[]>>({});
  const [loadingAnimation, setLoadingAnimation] = useState(false);
  const [animationError, setAnimationError] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [urlCache, setUrlCache] = useState<Record<string, string>>({});
  const [framePreviewCache, setFramePreviewCache] = useState<Record<number, { start?: string; end?: string }>>({});
  const [sceneThumbCache, setSceneThumbCache] = useState<Record<number, string>>({});
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | undefined>();
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [resolvingVersion, setResolvingVersion] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [previewSource, setPreviewSource] = useState<{ url?: string; version?: number } | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [rightPanelWidth, setRightPanelWidth] = useState(300);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const MIN_LEFT = 220;
  const MAX_LEFT = 420;
  const MIN_RIGHT = 260;
  const MAX_RIGHT = 520;
  
  const activeScene = sortedScenes[activeSceneIndex];
  const hasScene = sortedScenes.length > 0;

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
    const isApiFile = raw.startsWith('http') && raw.includes('/api/files/');
    if (raw.startsWith('http') && !isApiFile) return raw;
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

  const resolveVersions = useCallback(
    async (sceneId: number, versions: AnimationVersion[]) => {
      setResolvingVersion(true);
      try {
        const resolved = await Promise.all(
          versions.map(async v => ({
            ...v,
            videoUrl: await resolveFileUrl(v.videoUrl),
          }))
        );
        setVersionMap(prev => ({ ...prev, [sceneId]: resolved }));
        return resolved;
      } finally {
        setResolvingVersion(false);
      }
    },
    [resolveFileUrl]
  );

  useEffect(() => {
    if (!activeScene?.id) {
      setAnimationMap({});
      setVersionMap({});
      setResolvedVideoUrl(undefined);
      setPreviewSource(null);
      setAnimationError(null);
      setLoadingAnimation(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingAnimation(true);
      setAnimationError(null);
      try {
        const [info, versionsRes] = await Promise.all([
          animationApi.getInfo(activeScene.id),
          animationApi.listVersions(activeScene.id),
        ]);
        if (cancelled) return;
        const resolvedUrl = await resolveFileUrl(info.animationUrl || activeScene.clipUrl);
        if (cancelled) return;
        setAnimationMap(prev => ({
          ...prev,
          [activeScene.id]: { url: resolvedUrl || activeScene.clipUrl, version: info.animationVersion },
        }));
        const versions = await resolveVersions(activeScene.id, versionsRes.data || []);
        if (!versions.length) setVersionMap(prev => ({ ...prev, [activeScene.id]: versions }));
        setPreviewSource(null);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load animation info', err);
        setAnimationError(err instanceof Error ? err.message : '加载动画信息失败');
      } finally {
        if (!cancelled) setLoadingAnimation(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id, resolveFileUrl, resolveVersions]);

  useEffect(() => {
    if (!activeScene?.id) return;
    let cancelled = false;
    (async () => {
      const [start, end] = await Promise.all([
        resolveFileUrl(activeScene.startFrameUrl),
        resolveFileUrl(activeScene.endFrameUrl),
      ]);
      if (cancelled) return;
      setFramePreviewCache(prev => ({
        ...prev,
        [activeScene.id]: { start: start || undefined, end: end || undefined },
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id, activeScene?.startFrameUrl, activeScene?.endFrameUrl, resolveFileUrl]);

  useEffect(() => {
    sortedScenes.forEach(scene => {
      const raw = scene.startFrameUrl;
      if (!raw) return;
      if (sceneThumbCache[scene.id]) return;
      resolveFileUrl(raw).then(url => {
        setSceneThumbCache(prev => (prev[scene.id] ? prev : { ...prev, [scene.id]: url }));
      });
    });
  }, [sortedScenes, sceneThumbCache, resolveFileUrl]);

  useEffect(() => {
    if (!activeScene?.id) {
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
        previewVideoRef.current.currentTime = 0;
      }
      setPreviewSource(null);
      return;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      previewVideoRef.current.currentTime = 0;
    }
    setPreviewSource(null);
  }, [activeScene?.id]);

  const sceneOverlay = activeScene ? animationMap[activeScene.id] || {} : {};
  const activeSceneData = activeScene
    ? {
        ...activeScene,
        animationUrl: sceneOverlay.url || activeScene.animationUrl || activeScene.clipUrl,
        clipUrl: sceneOverlay.url || activeScene.clipUrl || activeScene.animationUrl,
        animationVersion: sceneOverlay.version ?? activeScene.animationVersion,
      }
    : null;
  const currentVersions = activeScene ? versionMap[activeScene.id] || [] : [];
  const currentVersionLabel =
    (activeSceneData?.animationVersion ?? currentVersions[0]?.version ?? undefined) ?? '—';
  const currentVersionData =
    (activeSceneData && currentVersions.find(v => v.version === activeSceneData.animationVersion)) ||
    currentVersions.find(v => v.version === currentVersions[0]?.version) ||
    undefined;
  const displayClipUrl = currentVersionData?.videoUrl || activeSceneData?.animationUrl || activeSceneData?.clipUrl;
  useEffect(() => {
    if (!displayClipUrl) {
      setResolvedVideoUrl(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const url = await resolveFileUrl(displayClipUrl);
      if (!cancelled) setResolvedVideoUrl(url || displayClipUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [displayClipUrl, resolveFileUrl]);

  const startFrameResolved = activeScene?.id
    ? framePreviewCache[activeScene.id]?.start || activeSceneData?.startFrameUrl
    : undefined;
  const endFrameResolved = activeScene?.id
    ? framePreviewCache[activeScene.id]?.end || activeSceneData?.endFrameUrl
    : undefined;
  const playbackUrl = resolvedVideoUrl || displayClipUrl;
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.load();
    setIsPlaying(false);
  }, [playbackUrl]);

  const handleUploadVideo = async (file?: File | null) => {
    if (!file || !activeSceneData?.id) return;
    setUploadingVideo(true);
    setAnimationError(null);
    try {
      const uploaded = await fileApi.upload(file, 'private');
      const rawUrl = uploaded.key || uploaded.url;
      const resolvedUploadUrl = await resolveFileUrl(rawUrl);
      const version = await animationApi.update(activeSceneData.id, rawUrl || '');
      const resolvedVersionUrl = await resolveFileUrl(version.videoUrl);
      setAnimationMap(prev => ({
        ...prev,
        [activeSceneData.id]: { url: resolvedVersionUrl || resolvedUploadUrl, version: version.version },
      }));
      const versionsRes = await animationApi.listVersions(activeSceneData.id);
      await resolveVersions(activeSceneData.id, versionsRes.data || []);
      setToast({ message: '新动画版本已上传', tone: 'success' });
      setPreviewSource(null);
    } catch (err) {
      console.error('Upload animation failed', err);
      setAnimationError(err instanceof Error ? err.message : '上传失败，请重试');
      setToast({ message: '上传失败，请重试', tone: 'error' });
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handlePreviewVersion = (version: number) => {
    if (!activeSceneData?.id) return;
    const versionData = currentVersions.find(v => v.version === version);
    if (!versionData?.videoUrl) {
      setToast({ message: '该版本缺少视频链接，无法预览', tone: 'error' });
      return;
    }
    setPreviewSource({ url: versionData.videoUrl, version: versionData.version });
    setVersionMenuOpen(false);
  };

  const handleRevertVersion = async (version: number) => {
    if (!activeSceneData?.id) return;
    setLoadingAnimation(true);
    setAnimationError(null);
    try {
      const scene = await animationApi.revert(activeSceneData.id, version);
      const resolvedSceneUrl = await resolveFileUrl(scene.animationUrl || activeSceneData.animationUrl);
      setAnimationMap(prev => ({
        ...prev,
        [activeSceneData.id]: { url: resolvedSceneUrl || scene.animationUrl, version: scene.animationVersion },
      }));
      const versionsRes = await animationApi.listVersions(activeSceneData.id);
      setVersionMap(prev => ({ ...prev, [activeSceneData.id]: versionsRes.data || [] }));
      setToast({ message: `已回滚到版本 #${version}`, tone: 'success' });
      setPreviewSource(null);
    } catch (err) {
      console.error('Revert animation failed', err);
      setAnimationError(err instanceof Error ? err.message : '回滚失败，请重试');
      setToast({ message: '回滚失败，请重试', tone: 'error' });
    } finally {
      setLoadingAnimation(false);
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current || !playbackUrl) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(err => {
        console.error('Video play failed', err);
        setToast({ message: '无法播放该视频，请检查链接', tone: 'error' });
      });
    }
    setIsPlaying(prev => !prev);
  };

  const closePreview = () => {
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      previewVideoRef.current.currentTime = 0;
    }
    setPreviewSource(null);
  };

  if (!hasChapters) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm bg-[#0f0f0f]">
        暂无章节数据，请先在剧本阶段创建章节与场景
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] relative">
      {previewSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closePreview} />
          <div className="relative w-full max-w-4xl bg-[#0b0b0b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 text-white">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MonitorPlay size={16} className="text-blue-400" />
                <span>版本 #{previewSource.version ?? '—'} 预览</span>
              </div>
              <button
                onClick={closePreview}
                className="text-white/60 hover:text-white rounded-full p-1 hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video bg-black">
              {previewSource.url ? (
                <video
                  ref={previewVideoRef}
                  src={previewSource.url}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">无预览链接</div>
              )}
            </div>
          </div>
        </div>
      )}
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
      {/* 顶部：章节选择 + 场景切换（与分镜风格保持一致） */}
      <div className="border-b border-white/5 bg-[#141414]">
        <div className="px-4 py-3 flex gap-2 overflow-x-auto border-b border-white/10">
          {normalizedChapters.map((ch, cIdx) => (
            <button
              key={ch.id}
              onClick={() => {
                setActiveChapterId(ch.id);
                setActiveSceneIndex(0);
                setIsPlaying(false);
              }}
              className={`flex-shrink-0 px-4 py-2 rounded-xl border transition-all text-left min-w-[180px] ${
                activeChapterId === ch.id
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
          {sortedScenes.length === 0 ? (
            <div className="text-white/30 text-xs px-2">该章节暂无场景</div>
          ) : (
            sortedScenes.map((scene, idx) => {
              const displayNumber = idx + 1;
              const sceneClip = animationMap[scene.id]?.url || scene.animationUrl || scene.clipUrl;
              const thumb = sceneThumbCache[scene.id] || scene.startFrameUrl;
              return (
              <button
                key={scene.id}
                onClick={() => {
                  setActiveSceneIndex(idx);
                  setIsPlaying(false);
                }}
                className={`flex-shrink-0 w-32 h-14 rounded border transition-all relative overflow-hidden group ${
                  activeSceneIndex === idx 
                    ? 'border-blue-500 ring-1 ring-blue-500' 
                    : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'
                }`}
                >
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center relative">
                  {thumb ? (
                    <img src={thumb} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Film size={16} className="text-white/10" />
                  )}
                  {sceneClip && (
                    <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                      <Play size={12} fill="currentColor" className="text-white" />
                    </div>
                  )}
                </div>
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
            })
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {hasScene && animationError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
            <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-100 text-sm shadow-xl">
              动画数据加载失败：{animationError}
            </div>
          </div>
        )}
        {hasScene && loadingAnimation && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-2 bg-black/60 border border-white/10 rounded-lg text-white/70 text-sm backdrop-blur-sm">
              正在同步动画数据...
            </div>
          </div>
        )}
        {!hasScene ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
            该章节暂无场景，先去剧本阶段创建场景后再上传动画
          </div>
        ) : (
          <>
        {/* 左侧：剧本参考区（与分镜风格统一） */}
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
                "{activeSceneData?.description || '暂无描述'}"
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-orange-400">
              <Layout size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">镜头/运镜</h3>
            </div>
            <p className="text-sm text-white/60 font-medium px-1">
              {activeSceneData?.cameraMovement || '未指定镜头类型'}
            </p>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-green-400">
              <Layout size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">分镜参考</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-white/40 font-semibold mb-1">首帧 (Keyframe A)</div>
                <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black">
                  {startFrameResolved ? (
                    <img src={startFrameResolved} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-white/10">未上传</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/40 font-semibold mb-1">尾帧 (Keyframe B)</div>
                <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black">
                  {endFrameResolved ? (
                    <img src={endFrameResolved} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-white/10">未上传</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-purple-400">
              <Type size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">台词/旁白</h3>
            </div>
            <div className="bg-blue-600/5 border-l-2 border-blue-500 p-3">
              <p className="text-sm text-white/80 leading-snug">
                {activeSceneData?.dialogue || <span className="text-white/20 italic">（无台词）</span>}
              </p>
            </div>
          </section>
        </div>

        <div
          className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingLeft ? 'bg-white/20' : ''}`}
          onMouseDown={e => {
            e.preventDefault();
            setIsResizingLeft(true);
          }}
        />

        {/* 中间：动画制作/预览区 */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a]">
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  场景 {activeSceneIndex + 1} 动画制作
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    activeSceneData?.status === 'COMPLETED' ? 'bg-green-600 text-white' : 'bg-orange-600/20 text-orange-400 border border-orange-600/30'
                  }`}>
                    {activeSceneData ? STATUS_MAP[activeSceneData.status] : '—'}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button 
                    disabled={activeSceneIndex === 0}
                    onClick={() => setActiveSceneIndex(prev => Math.max(0, prev - 1))}
                    className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white disabled:opacity-10 transition-all"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    disabled={activeSceneIndex === sortedScenes.length - 1}
                    onClick={() => setActiveSceneIndex(prev => Math.min(sortedScenes.length - 1, prev + 1))}
                    className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white disabled:opacity-10 transition-all"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">动画片段</span>
                    <span className="px-2 py-1 text-[11px] rounded bg-white/5 border border-white/10 text-white/70">
                      当前版本：版本 #{currentVersionLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 relative">
                    <div className="relative">
                      <button
                        onClick={() => setVersionMenuOpen(prev => !prev)}
                        className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all"
                      >
                        <History size={12} /> 历史版本
                      </button>
                      {versionMenuOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setVersionMenuOpen(false)}
                          />
                          <div className="absolute right-0 mt-2 w-72 bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
                            <div className="px-3 py-2 border-b border-white/10 text-white/60 text-[11px]">
                              <span>共 {currentVersions.length} 个版本</span>
                            </div>
                            <div className="max-h-80 overflow-y-auto divide-y divide-white/10">
                              {currentVersions.length === 0 && (
                                <div className="p-3 text-center text-white/40 text-[12px]">暂无历史版本</div>
                              )}
                              {currentVersions.map(version => {
                                const time = version.createdAt ? new Date(version.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
                                const isActive = activeSceneData?.animationVersion === version.version;
                                const isPreviewing = previewSource?.version === version.version;
                                return (
                                  <div
                                    key={version.id}
                                    className={`p-3 space-y-1 ${isActive ? 'bg-blue-600/10' : 'bg-transparent hover:bg-white/5'}`}
                                  >
                                    <div className="flex items-center justify-between text-white/80">
                                      <div>
                                        <p className="text-sm font-semibold">版本 #{version.version}</p>
                                        <div className="text-[11px] text-white/40">{time || '时间未知'}</div>
                                      </div>
                                      <div className="text-[10px] text-white/40">ID: {version.id}</div>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                      <button
                                        onClick={() => {
                                          handlePreviewVersion(version.version);
                                        }}
                                        className={`text-[11px] px-2 py-1 rounded-lg border flex items-center gap-1 transition-all ${
                                          isPreviewing
                                            ? 'bg-blue-600/20 border-blue-500/50 text-white'
                                            : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/80'
                                        }`}
                                      >
                                        <MonitorPlay size={12} />
                                        {isPreviewing ? '预览中' : '预览'}
                                      </button>
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => handleRevertVersion(version.version)}
                                          className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50"
                                          disabled={loadingAnimation}
                                        >
                                          设为当前
                                        </button>
                                        <div className="relative group">
                                          <Info size={14} className="text-white/30" />
                                          <div className="absolute right-0 top-6 w-48 p-2 rounded-md bg-black/80 border border-white/10 text-[11px] text-white/70 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                            将预览中的版本设为交付版本（默认最新）
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      disabled={uploadingVideo}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg border border-blue-500/60 transition-all disabled:opacity-50"
                    >
                      {uploadingVideo ? '上传中...' : '上传新版本'}
                    </button>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={e => handleUploadVideo(e.target.files?.[0])}
                    />
                  </div>
                </div>
                <div className="aspect-video w-full rounded-2xl border-2 border-dashed border-white/5 bg-zinc-900 overflow-hidden relative group shadow-lg">
                  {displayClipUrl ? (
                    <>
                      <video 
                        ref={videoRef}
                        src={playbackUrl}
                        className="w-full h-full object-contain"
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onClick={togglePlay}
                      />
                      {!isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer" onClick={togglePlay}>
                          <div className="p-5 rounded-full bg-blue-600 text-white shadow-xl scale-100 group-hover:scale-110 transition-transform">
                            <Play fill="currentColor" size={32} />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      className="w-full h-full flex flex-col items-center justify-center gap-4 group-hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => videoInputRef.current?.click()}
                    >
                      <div className="p-6 rounded-full bg-white/5 text-white/20 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <MonitorPlay size={48} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white/40 mb-1">点击上传动画片段</p>
                        <p className="text-[10px] text-white/20 uppercase tracking-widest">上传后全组成员均可即时查看</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-[#1a1a1a] border-t border-white/5 flex justify-end items-center px-10">
            <div className="flex items-center gap-2 text-white/30">
              <CheckCircle2 size={14} className="text-green-500/50" />
              <span className="text-[10px] font-bold uppercase tracking-widest">动画片段已发布 (实时审核模式已开启)</span>
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

        {/* 右侧：审核互动区 */}
        <div
          style={{ width: rightPanelWidth }}
          className="border-l border-white/5 bg-[#121212] flex flex-col min-w-[260px] max-w-[520px]"
        >
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">修改历史与讨论</span>
            <MessageSquare size={16} className="text-white/20" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeSceneData?.comments?.length ? activeSceneData.comments.map(c => (
              <div key={c.id} className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5 border-l-4 border-l-red-500/50">
                <div className="flex justify-between mb-2">
                  <span className="text-[10px] font-bold text-red-400 uppercase">{c.author}</span>
                  <span className="text-[9px] text-white/20">{c.timestamp}</span>
                </div>
                <p className="text-sm text-white/70 leading-relaxed">{c.text}</p>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 opacity-20 italic">
                <AlertCircle size={32} />
                <p className="text-xs">暂无审核反馈</p>
              </div>
            )}
          </div>

          <div className="p-4 bg-[#161616] border-t border-white/5">
            <div className="flex items-center gap-2 bg-[#1e1e1e] border border-white/10 rounded-xl px-3 py-2">
              <input
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                placeholder="添加修改意见或反馈..."
              />
              <button className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors">
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
};
