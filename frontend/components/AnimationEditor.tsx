
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Episode, Scene, Status } from '../types';
import { 
  MessageSquare, 
  Upload, 
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
  Clock3
} from 'lucide-react';

interface AnimationEditorProps {
  episode: Episode;
}

const STATUS_MAP: Record<Status, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成'
};

export const AnimationEditor: React.FC<AnimationEditorProps> = ({ episode }) => {
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
      status: scene.status || 'IN_PROGRESS'
    }));
  }, [episode.scenes]);

  const mockChapters = useMemo<Episode[]>(() => {
    const baseIndex = episode.index || 1;
    return [
      {
        ...episode,
        title: episode.title || `第 ${baseIndex} 章 • 初版方案`,
        index: baseIndex,
        scenes: normalizeScenes
      },
      {
        id: 9001,
        title: '第 2 章 • 城市追逐',
        index: baseIndex + 1,
        status: 'IN_PROGRESS',
        synopsis: '高速街区中的追逐戏，强调速度与失控感。',
        scenes: normalizeScenes.map(scene => ({
          ...scene,
          id: Number(`${scene.id}1`),
          dialogue: scene.dialogue + '（对口型调整版）',
          cameraMovement: '车载跟拍 + 航拍切换'
        }))
      },
      {
        id: 9002,
        title: '第 3 章 • 终局对峙',
        index: baseIndex + 2,
        status: 'DRAFT',
        synopsis: '废弃仓库中的光影对峙，强调空间感与压迫。',
        scenes: normalizeScenes.map(scene => ({
          ...scene,
          id: Number(`${scene.id}2`),
          dialogue: scene.dialogue.replace('。', '。 （情绪更克制）'),
          cameraMovement: '推轨 + 特写摇入'
        }))
      }
    ];
  }, [episode, normalizeScenes]);

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
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const activeScene = sortedScenes[activeSceneIndex];

  const versionHistory = useMemo(
    () => [
      {
        id: 'v3',
        label: 'v3 · 质感加强',
        url: activeScene?.clipUrl,
        uploadedAt: '今天 18:42',
        size: '48 MB',
        notes: '镜头跟焦优化，加入雾效和蓝色冷光。',
        reviewer: '陈导'
      },
      {
        id: 'v2',
        label: 'v2 · 节奏校准',
        url: activeScene?.clipUrl,
        uploadedAt: '昨天 22:10',
        size: '46 MB',
        notes: '节奏压缩 8%，口型提前 2 帧。',
        reviewer: '梁审片'
      },
      {
        id: 'v1',
        label: 'v1 · 初版出片',
        url: activeScene?.clipUrl,
        uploadedAt: '周一 11:05',
        size: '52 MB',
        notes: '基础动作走位，未加灯光特效。',
        reviewer: '自动生成'
      }
    ],
    [activeScene?.clipUrl]
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string>(versionHistory[0]?.id || 'v3');
  useEffect(() => {
    setSelectedVersionId(versionHistory[0]?.id || 'v3');
  }, [activeSceneIndex, activeChapterId, versionHistory.length, versionHistory]);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);

  if (!activeScene) return null;

  const currentVersion = versionHistory.find(v => v.id === selectedVersionId) || versionHistory[0];
  const displayClipUrl = currentVersion?.url || activeScene.clipUrl;

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      {/* 顶部：章节选择 + 场景切换（与分镜风格保持一致） */}
      <div className="border-b border-white/5 bg-[#141414]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-white/60 text-sm font-semibold">
            <Film size={14} className="text-blue-400" />
            <span>动画制作 · 章节选择</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-white/40">
            <span>共 {mockChapters.length} 章</span>
            <span className="hidden md:flex items-center gap-1">
              <CheckCircle2 size={12} className="text-green-400" /> 实时审核
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
          {sortedScenes.map((scene, idx) => {
            const displayNumber = idx + 1;
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
                {scene.startFrameUrl ? (
                  <img src={scene.startFrameUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <Film size={16} className="text-white/10" />
                )}
                {scene.clipUrl && (
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
          })}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：参考区（剧本 + 首尾帧 + 台词） */}
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
            <div className="flex items-center gap-2 text-orange-400">
              <Layout size={14} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">分镜绘制参考</h3>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-[9px] text-white/30 font-bold uppercase">首帧 (Keyframe A)</span>
                <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black">
                  {activeScene.startFrameUrl ? (
                    <img src={activeScene.startFrameUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-white/10">未上传</div>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-white/30 font-bold uppercase">尾帧 (Keyframe B)</span>
                <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black">
                  {activeScene.endFrameUrl ? (
                    <img src={activeScene.endFrameUrl} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-white/10">未上传</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-purple-300">
              <Type size={14} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">台词 / 口型提示</h3>
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

        {/* 中间：动画制作/预览区 */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a]">
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  场景 {activeSceneIndex + 1} 动画制作
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
                    <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">动画片段</span>
                    <span className="px-2 py-1 text-[11px] rounded bg-white/5 border border-white/10 text-white/70">
                      当前版本：{currentVersion?.label || '未上传'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setHistoryPanelOpen(true)}
                      className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all"
                    >
                      <History size={12} /> 查看历史版本
                    </button>
                    <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg border border-blue-500/60 transition-all">
                      上传新版本
                    </button>
                  </div>
                </div>
                <div className="aspect-video w-full rounded-2xl border-2 border-dashed border-white/5 bg-zinc-900 overflow-hidden relative group shadow-lg">
                  {displayClipUrl ? (
                    <>
                      <video 
                        ref={videoRef}
                        src={displayClipUrl}
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
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 group-hover:bg-white/5 transition-colors cursor-pointer">
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

        {/* 历史版本侧滑面板 */}
        {historyPanelOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 flex justify-end">
            <div className="w-[360px] h-full bg-[#0f0f0f] border-l border-white/10 shadow-2xl animate-in fade-in slide-in-from-right">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History size={16} className="text-blue-400" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">历史版本</p>
                    <p className="text-sm text-white/80">动画片段</p>
                  </div>
                </div>
                <button
                  onClick={() => setHistoryPanelOpen(false)}
                  className="px-3 py-1 text-[11px] font-bold rounded-lg bg-white/5 hover:bg-white/10 text-white/60"
                >
                  关闭
                </button>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto h-full">
                {versionHistory.map(version => (
                  <div
                    key={version.id}
                    className="w-full text-left bg-white/5 border border-white/10 rounded-xl overflow-hidden transition-all hover:border-white/30"
                  >
                    <div className="p-3 flex items-center justify-between gap-2 text-white/80">
                      <div>
                        <p className="text-sm font-semibold">{version.label}</p>
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <span>{version.uploadedAt}</span>
                          <span>{version.size}</span>
                          <span>审核人：{version.reviewer}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedVersionId(version.id)}
                          className="text-[11px] px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white/80"
                        >
                          预览
                        </button>
                        <button
                          onClick={() => {
                            setSelectedVersionId(version.id);
                            setHistoryPanelOpen(false);
                            setIsPlaying(false);
                          }}
                          className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50"
                        >
                          设为当前
                        </button>
                      </div>
                    </div>
                    <div className="px-3 pb-3 text-[12px] text-white/60">{version.notes}</div>
                  </div>
                ))}
                {versionHistory.length === 0 && (
                  <div className="text-center text-white/40 text-sm py-10 border border-dashed border-white/10 rounded-xl">
                    暂无历史版本
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 右侧：审核互动区 */}
        <div className="w-80 border-l border-white/5 bg-[#121212] flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">修改历史与讨论</span>
            <MessageSquare size={16} className="text-white/20" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeScene.comments.length > 0 ? activeScene.comments.map(c => (
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
