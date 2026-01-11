import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Episode, Scene, Status } from '../types';
import { fileApi } from '../api';
import { 
  MessageSquare, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  Info,
  Play,
  Pause,
  Mic2,
  Waves,
  Volume2,
  Type,
  History,
  Clock3,
  Headphones,
  Film,
  MonitorPlay
} from 'lucide-react';

interface AudioEditorProps {
  episode: Episode;
}

interface AudioVersion {
  id: number;
  sceneId: number;
  version: number;
  fileUrl: string;
  createdAt: string;
  note?: string;
  engineer?: string;
  name?: string;
}

const AUDIO_SAMPLES = [
  'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
  'https://samplelib.com/lib/preview/mp3/sample-6s.mp3',
  'https://samplelib.com/lib/preview/mp3/sample-15s.mp3'
];

const STATUS_MAP: Record<Status, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成'
};

export const AudioEditor: React.FC<AudioEditorProps> = ({ episode }) => {
  const normalizeScenes = useMemo(() => {
    const fallback: Scene[] = episode.scenes.length
      ? episode.scenes
      : [
          {
            id: 1,
            index: 1,
            description: '夜幕下的街头，女主孤身前行，霓虹在雨水中被拉出拖影。',
            cameraMovement: '跟拍 + 缓推',
            dialogue: '“我知道，这条路只能我自己走完。”',
            status: 'IN_PROGRESS',
            comments: []
          },
          {
            id: 2,
            index: 2,
            description: '街角灯箱映出她的剪影，一辆车疾驰掠过，镜头快速摇移切入车内。',
            cameraMovement: '摇移 + 切入',
            dialogue: '“别回头，风暴还在后面。”',
            status: 'IN_PROGRESS',
            comments: []
          }
        ];
    return fallback.map((scene, idx) => ({
      ...scene,
      comments: scene.comments || [],
      dialogue: scene.dialogue || '此处补充对白与情绪提示',
      description: scene.description || '此镜头暂无描述，请补充。',
      index: scene.index || idx + 1,
      cameraMovement: scene.cameraMovement || '平移',
      status: scene.status || 'IN_PROGRESS',
      animationUrl: scene.animationUrl || scene.clipUrl,
      clipUrl: scene.clipUrl || scene.animationUrl,
      audioUrl: scene.audioUrl,
    }));
  }, [episode.scenes]);

  const mockChapters = useMemo<Episode[]>(() => {
    const baseIndex = episode.index || 1;
    return [
      {
        ...episode,
        title: episode.title || `第 ${baseIndex} 章 • 声音草稿`,
        index: baseIndex,
        scenes: normalizeScenes
      },
      {
        id: 8001,
        title: '第 2 章 • 城市追逐 · 音效加强版',
        index: baseIndex + 1,
        status: 'IN_PROGRESS',
        synopsis: '高速街区中的追逐戏，强调速度与失控感。',
        scenes: normalizeScenes.map(scene => ({
          ...scene,
          id: Number(`${scene.id}1`),
          dialogue: scene.dialogue + '（低频强化）',
          cameraMovement: '车载跟拍 + 航拍切换'
        }))
      },
      {
        id: 8002,
        title: '第 3 章 • 终局对峙 · 静谧版',
        index: baseIndex + 2,
        status: 'DRAFT',
        synopsis: '废弃仓库中的光影对峙，强调空间感与压迫。',
        scenes: normalizeScenes.map(scene => ({
          ...scene,
          id: Number(`${scene.id}2`),
          dialogue: scene.dialogue.replace('。', '。 （语气更克制）'),
          cameraMovement: '推轨 + 特写摇入'
        }))
      }
    ];
  }, [episode, normalizeScenes]);

  const allScenesForVersion = useMemo(
    () => mockChapters.flatMap(ch => ch.scenes || []),
    [mockChapters]
  );

  const [activeChapterId, setActiveChapterId] = useState<number>(mockChapters[0]?.id || episode.id);
  const activeChapter = useMemo(
    () => mockChapters.find(c => c.id === activeChapterId) || mockChapters[0],
    [activeChapterId, mockChapters]
  );
  useEffect(() => {
    setActiveChapterId(mockChapters[0]?.id || episode.id);
  }, [episode.id, mockChapters]);

  const sortedScenes = useMemo(
    () => (activeChapter ? [...activeChapter.scenes].sort((a, b) => a.index - b.index) : []),
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

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | undefined>();
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | undefined>();
  const [urlCache, setUrlCache] = useState<Record<string, string>>({});
  const [sceneThumbCache, setSceneThumbCache] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const resolveFileUrl = useCallback(async (raw?: string | null) => {
    if (!raw) return '';
    if (raw.startsWith('blob:')) return raw;
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

  const mockVersionMap = useMemo<Record<number, AudioVersion[]>>(() => {
    const now = Date.now();
    return allScenesForVersion.reduce((acc, scene, idx) => {
      const primary = AUDIO_SAMPLES[idx % AUDIO_SAMPLES.length];
      const alt = AUDIO_SAMPLES[(idx + 1) % AUDIO_SAMPLES.length];
      acc[scene.id] = [
        {
          id: Number(`${scene.id}03`),
          sceneId: scene.id,
          version: 3,
          fileUrl: primary,
          createdAt: new Date(now - idx * 42 * 60 * 1000).toISOString(),
          name: '混音定稿 v3',
          note: '对白压限 + 空间感微调',
          engineer: 'Lena'
        },
        {
          id: Number(`${scene.id}02`),
          sceneId: scene.id,
          version: 2,
          fileUrl: alt,
          createdAt: new Date(now - (idx + 1) * 90 * 60 * 1000).toISOString(),
          name: '粗混方案 v2',
          note: '人声均衡 + 音效平衡',
          engineer: 'Lena'
        },
        {
          id: Number(`${scene.id}01`),
          sceneId: scene.id,
          version: 1,
          fileUrl: primary,
          createdAt: new Date(now - (idx + 2) * 120 * 60 * 1000).toISOString(),
          name: '原始口播',
          note: '未压缩的参考音',
          engineer: 'Lena'
        }
      ];
      return acc;
    }, {} as Record<number, AudioVersion[]>);
  }, [allScenesForVersion]);

  const [versionMap, setVersionMap] = useState<Record<number, AudioVersion[]>>(() => mockVersionMap);
  const [selectedVersionByScene, setSelectedVersionByScene] = useState<Record<number, number | null>>(() => {
    const init: Record<number, number | null> = {};
    Object.entries(mockVersionMap).forEach(([sceneId, versions]) => {
      init[Number(sceneId)] = versions?.[0]?.version ?? null;
    });
    return init;
  });

  useEffect(() => {
    setVersionMap(mockVersionMap);
    setSelectedVersionByScene(prev => {
      const next: Record<number, number | null> = {};
      Object.entries(mockVersionMap).forEach(([sceneId, versions]) => {
        const idNum = Number(sceneId);
        next[idNum] = prev[idNum] ?? versions?.[0]?.version ?? null;
      });
      return next;
    });
  }, [mockVersionMap]);

  const activeScene = sortedScenes[activeSceneIndex];
  if (!activeScene) return null;

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

  const currentVersions = versionMap[activeScene.id] || [];
  const selectedVersion = selectedVersionByScene[activeScene.id] ?? currentVersions[0]?.version ?? null;
  const selectedVersionData = currentVersions.find(v => v.version === selectedVersion) || currentVersions[0];
  const displayAudioUrl = selectedVersionData?.fileUrl || activeScene.audioUrl;
  const displayVideoUrl = activeScene.animationUrl || activeScene.clipUrl;
  const currentVersionLabel = selectedVersion ?? selectedVersionData?.version ?? activeScene.audioVersion ?? '—';

  useEffect(() => {
    if (!displayVideoUrl) {
      setResolvedVideoUrl(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const resolved = await resolveFileUrl(displayVideoUrl);
      if (!cancelled) setResolvedVideoUrl(resolved || displayVideoUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [displayVideoUrl, resolveFileUrl]);

  useEffect(() => {
    if (!displayAudioUrl) {
      setResolvedAudioUrl(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const resolved = await resolveFileUrl(displayAudioUrl);
      if (!cancelled) setResolvedAudioUrl(resolved || displayAudioUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [displayAudioUrl, resolveFileUrl, activeScene.id]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.load();
    setIsVideoPlaying(false);
  }, [resolvedVideoUrl, activeScene.id]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.load();
    setIsAudioPlaying(false);
  }, [resolvedAudioUrl, activeScene.id]);

  const playbackVideoUrl = resolvedVideoUrl || displayVideoUrl;
  const playbackAudioUrl = resolvedAudioUrl || displayAudioUrl;

  const handlePreviewVersion = (version: number) => {
    if (!activeScene?.id) return;
    const versionData = currentVersions.find(v => v.version === version);
    if (!versionData?.fileUrl) {
      setToast({ message: '该版本缺少音频链接，无法预览', tone: 'error' });
      return;
    }
    setSelectedVersionByScene(prev => ({ ...prev, [activeScene.id]: version }));
    setIsAudioPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleSetCurrentVersion = (version: number) => {
    if (!activeScene?.id) return;
    handlePreviewVersion(version);
    setVersionMap(prev => {
      const list = prev[activeScene.id] || [];
      const sorted = [...list].sort((a, b) => {
        if (a.version === version) return -1;
        if (b.version === version) return 1;
        return b.version - a.version;
      });
      return { ...prev, [activeScene.id]: sorted };
    });
    setToast({ message: `版本 #${version} 已设为交付版本`, tone: 'success' });
    setVersionMenuOpen(false);
  };

  const handleUploadAudio = (file?: File | null) => {
    if (!file || !activeScene?.id) return;
    const objectUrl = URL.createObjectURL(file);
    const versions = versionMap[activeScene.id] || [];
    const currentMax = versions.reduce((max, v) => Math.max(max, v.version), 0);
    const nextVersion = currentMax + 1;
    const newVersion: AudioVersion = {
      id: Number(`${activeScene.id}${Date.now().toString().slice(-4)}`),
      sceneId: activeScene.id,
      version: nextVersion,
      fileUrl: objectUrl,
      createdAt: new Date().toISOString(),
      name: `${file.name} (上传)`,
      note: '本地上传版本',
      engineer: '你'
    };
    setVersionMap(prev => ({ ...prev, [activeScene.id]: [newVersion, ...versions] }));
    setSelectedVersionByScene(prev => ({ ...prev, [activeScene.id]: nextVersion }));
    setToast({ message: '已上传新音频版本（本地预览）', tone: 'success' });
    setVersionMenuOpen(false);
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const toggleVideoPlay = () => {
    if (!videoRef.current || !playbackVideoUrl) return;
    if (isVideoPlaying) {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsVideoPlaying(true)).catch(err => {
        console.error('Video play failed', err);
        setToast({ message: '无法播放参考动画，请检查链接', tone: 'error' });
      });
    }
  };

  const toggleAudioPlay = () => {
    if (!audioRef.current || !playbackAudioUrl) return;
    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsAudioPlaying(true)).catch(err => {
        console.error('Audio play failed', err);
        setToast({ message: '无法播放该音频版本', tone: 'error' });
      });
    }
  };

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

      {/* 顶部：章节选择 + 场景切换（与动画保持一致） */}
      <div className="border-b border-white/5 bg-[#141414]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-white/60 text-sm font-semibold">
            <Waves size={14} className="text-amber-300" />
            <span>音频后期 · 章节选择</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-white/40">
            <span>共 {mockChapters.length} 章</span>
            <span className="hidden md:flex items-center gap-1">
              <Headphones size={12} className="text-green-400" /> 实时监听
            </span>
            <span className="hidden md:flex items-center gap-1">
              <Clock3 size={12} className="text-white/30" /> 自动保存 04:58
            </span>
          </div>
        </div>
        <div className="px-4 py-3 flex gap-2 overflow-x-auto">
          {mockChapters.map((ch, cIdx) => (
            <button
              key={ch.id}
              onClick={() => {
                setActiveChapterId(ch.id);
                setActiveSceneIndex(0);
                setIsVideoPlaying(false);
                setIsAudioPlaying(false);
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
          {sortedScenes.map((scene, idx) => {
            const displayNumber = idx + 1;
            const thumb = sceneThumbCache[scene.id] || scene.startFrameUrl;
            return (
            <button
              key={scene.id}
              onClick={() => {
                setActiveSceneIndex(idx);
                setIsVideoPlaying(false);
                setIsAudioPlaying(false);
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
                  <Mic2 size={16} className="text-white/10" />
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="p-1 rounded bg-black/50 border border-white/10">
                    <Volume2 size={10} className="text-amber-300" />
                  </div>
                </div>
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
          })}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧：剧本与台词参考 */}
        <div className="w-80 border-r border-white/5 bg-[#121212] overflow-y-auto p-5 flex flex-col gap-6">
          <section>
            <div className="flex items-center gap-2 mb-3 text-blue-400">
              <Info size={14} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">剧本需求参考</h3>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/5 text-[13px] text-white/70 leading-relaxed italic mb-4">
              "{activeScene.description}"
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex justify-between items-center text-[10px] font-bold text-white/30 uppercase">
                <span>镜头: {activeScene.cameraMovement}</span>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-purple-300">
              <Type size={14} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">台词 / 情绪提示</h3>
            </div>
            <div className="bg-blue-600/5 border-l-2 border-blue-500 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-white/60 font-semibold">
                <span>当前镜头 #{activeSceneIndex + 1}</span>
                <span className="text-[10px] uppercase text-white/30">{activeScene.cameraMovement}</span>
              </div>
              <p className="text-sm text-white/80 leading-snug">
                {activeScene.dialogue || <span className="text-white/30 italic">（无台词）</span>}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              {sortedScenes.map((scene, idx) => (
                <button
                  key={scene.id}
                  onClick={() => setActiveSceneIndex(idx)}
                  className={`w-full text-left p-3 border-b border-white/5 last:border-b-0 transition-colors ${
                    idx === activeSceneIndex ? 'bg-blue-500/10 border-l-2 border-l-blue-500 text-white' : 'text-white/70 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span>镜头 #{idx + 1}</span>
                    <span className="text-[10px] uppercase text-white/30">{scene.cameraMovement}</span>
                  </div>
                  <p className="text-[13px] text-white/70 leading-relaxed mt-1 line-clamp-2">
                    {scene.dialogue || '此镜头暂无台词'}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* 中间：动画参考 + 音频版本管理 */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a]">
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  场景 {activeSceneIndex + 1} 音频后期
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    activeScene.status === 'COMPLETED' ? 'bg-green-600 text-white' : 'bg-orange-600/20 text-orange-400 border border-orange-600/30'
                  }`}>
                    {STATUS_MAP[activeScene.status]}
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
                    <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">动画参考</span>
                    <span className="px-2 py-1 text-[11px] rounded bg-white/5 border border-white/10 text-white/70 flex items-center gap-2">
                      <Film size={12} /> 对口型 / 氛围对齐
                    </span>
                  </div>
                </div>
                <div className="aspect-video w-full rounded-2xl border-2 border-dashed border-white/5 bg-zinc-900 overflow-hidden relative group shadow-lg">
                  {playbackVideoUrl ? (
                    <>
                      <video 
                        ref={videoRef}
                        src={playbackVideoUrl}
                        className="w-full h-full object-contain"
                        onPlay={() => setIsVideoPlaying(true)}
                        onPause={() => setIsVideoPlaying(false)}
                        onClick={toggleVideoPlay}
                      />
                      {!isVideoPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer" onClick={toggleVideoPlay}>
                          <div className="p-5 rounded-full bg-blue-600 text-white shadow-xl scale-100 group-hover:scale-110 transition-transform">
                            <Play fill="currentColor" size={32} />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      className="w-full h-full flex flex-col items-center justify-center gap-4 group-hover:bg-white/5 transition-colors cursor-default"
                    >
                      <div className="p-6 rounded-full bg-white/5 text-white/20 transition-all">
                        <MonitorPlay size={48} />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white/40 mb-1">暂无动画片段，请先完成动画制作</p>
                        <p className="text-[10px] text-white/20 uppercase tracking-widest">上传动画后可对齐口型节奏</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#111111] rounded-2xl border border-white/5 p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
                      <Waves size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">音频版本管理</h4>
                      <p className="text-[11px] text-white/40">当前版本 #{currentVersionLabel} · {selectedVersionData?.name || '未命名'}</p>
                    </div>
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
                          <div className="absolute right-0 mt-2 w-80 bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
                            <div className="px-3 py-2 border-b border-white/10 text-white/60 text-[11px]">
                              <span>共 {currentVersions.length} 个版本</span>
                            </div>
                            <div className="max-h-80 overflow-y-auto divide-y divide-white/10">
                              {currentVersions.length === 0 && (
                                <div className="p-3 text-center text-white/40 text-[12px]">暂无历史版本</div>
                              )}
                              {currentVersions.map(version => {
                                const time = version.createdAt ? new Date(version.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
                                const isActive = selectedVersion === version.version;
                                return (
                                  <div
                                    key={version.id}
                                    className={`p-3 space-y-2 ${isActive ? 'bg-blue-600/10' : 'bg-transparent hover:bg-white/5'}`}
                                  >
                                    <div className="flex items-center justify-between text-white/80">
                                      <div>
                                        <p className="text-sm font-semibold">版本 #{version.version} · {version.name || '音频版本'}</p>
                                        <div className="text-[11px] text-white/40">{time || '时间未知'}</div>
                                      </div>
                                      <div className="text-[10px] text-white/40">{version.engineer ? `工程师 ${version.engineer}` : ''}</div>
                                    </div>
                                    <div className="text-[12px] text-white/60">{version.note}</div>
                                    <div className="flex items-center justify-between gap-2">
                                      <button
                                        onClick={() => {
                                          handlePreviewVersion(version.version);
                                          setVersionMenuOpen(false);
                                        }}
                                        className="text-[11px] px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white/80"
                                      >
                                        预览
                                      </button>
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => handleSetCurrentVersion(version.version)}
                                          className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50"
                                        >
                                          设为当前
                                        </button>
                                        <div className="relative group">
                                          <Info size={14} className="text-white/30" />
                                          <div className="absolute right-0 top-6 w-60 p-2 rounded-md bg-black/80 border border-white/10 text-[11px] text-white/70 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                            将预览中的版本设为交付版本（默认最新）<br/>交付版本将进入审核流程
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
                      onClick={() => audioInputRef.current?.click()}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg border border-blue-500/60 transition-all"
                    >
                      上传新版本
                    </button>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={e => handleUploadAudio(e.target.files?.[0])}
                    />
                  </div>
                </div>

                <div className="bg-[#0b0b0b] border border-white/5 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleAudioPlay}
                      className="w-10 h-10 rounded-full bg-blue-600/80 hover:bg-blue-500 text-white flex items-center justify-center transition-all shadow-lg"
                    >
                      {isAudioPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-white/70 text-sm">
                        <span>{selectedVersionData?.name || '未命名音频'}</span>
                        <span className="text-[11px] text-white/40">版本 #{selectedVersionData?.version || '—'}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full w-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 animate-pulse [animation-duration:2.5s]" />
                      </div>
                      <div className="mt-1 text-[11px] text-white/40">
                        {selectedVersionData?.note || '等待录音或导入混音文件'}
                      </div>
                    </div>
                  </div>
                  <audio
                    ref={audioRef}
                    src={playbackAudioUrl}
                    onPlay={() => setIsAudioPlaying(true)}
                    onPause={() => setIsAudioPlaying(false)}
                    className="hidden"
                    controls
                  />
                  <div className="grid grid-cols-3 gap-3 text-[11px] text-white/50">
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                      <Headphones size={14} className="text-green-400" />
                      <span>参考监听</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                      <Mic2 size={14} className="text-amber-300" />
                      <span>对白清晰</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                      <Waves size={14} className="text-blue-400" />
                      <span>动效衔接</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-[#1a1a1a] border-t border-white/5 flex justify-end items-center px-10">
            <div className="flex items-center gap-2 text-white/30">
              <CheckCircle2 size={14} className="text-green-500/50" />
              <span className="text-[10px] font-bold uppercase tracking-widest">音频已就绪 (审核组可实时监听反馈)</span>
            </div>
          </div>
        </div>

        {/* 右侧：修改意见 */}
        <div className="w-80 border-l border-white/5 bg-[#121212] flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">音频修正意见</span>
            <MessageSquare size={16} className="text-white/20" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="h-full flex flex-col items-center justify-center gap-3 opacity-20 italic">
              <Volume2 size={32} />
              <p className="text-xs">暂无音频反馈</p>
            </div>
          </div>

          <div className="p-4 bg-[#161616] border-t border-white/5">
            <textarea 
              className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-24 mb-3"
              placeholder="添加修改意见或反馈..."
            />
            <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg">发布评论</button>
          </div>
        </div>
      </div>
    </div>
  );
};
