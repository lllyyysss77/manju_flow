
import React, { useEffect, useState, useRef } from 'react';
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
  Pause,
  Film,
  MonitorPlay,
  Layout,
  Type
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
  const sortedScenes = [...episode.scenes].sort((a, b) => a.index - b.index);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  useEffect(() => {
    if (activeSceneIndex >= sortedScenes.length) {
      setActiveSceneIndex(Math.max(0, sortedScenes.length - 1));
    }
  }, [activeSceneIndex, sortedScenes.length]);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const activeScene = sortedScenes[activeSceneIndex];

  if (!activeScene) return null;

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      {/* 顶部场景快速切换 */}
      <div className="h-20 border-b border-white/5 bg-[#141414] flex items-center px-4 gap-2 overflow-x-auto">
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
          </button>
        );
        })}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：参考区（剧本 + 首尾帧） */}
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
        </div>

        {/* 中间：动画制作/预览区 */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a]">
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  场景 {activeSceneIndex + 1} 动画制作
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${
                    activeScene.status === 'COMPLETED' ? 'bg-green-600 text-white border-green-500' : 'bg-blue-600/20 text-blue-400 border-blue-600/30'
                  }`}>
                    {STATUS_MAP[activeScene.status]}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white transition-all"><ChevronLeft size={20} /></button>
                  <button className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white transition-all"><ChevronRight size={20} /></button>
                </div>
              </div>

              {/* 动画播放器 */}
              <div className="aspect-video w-full rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden relative group shadow-2xl">
                {activeScene.clipUrl ? (
                  <>
                    <video 
                      ref={videoRef}
                      src={activeScene.clipUrl}
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
                    <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button className="px-3 py-1.5 bg-black/60 hover:bg-black text-white text-[10px] font-bold rounded-lg border border-white/10 flex items-center gap-2 backdrop-blur-md">
                         <Upload size={12} /> 重新上传片段
                       </button>
                    </div>
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

              {/* 剧本台词遮罩预览（模拟最终效果） */}
              <div className="bg-[#1a1a1a] rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Type size={14} className="text-purple-400" />
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">同步台词预览</span>
                </div>
                <p className="text-lg font-medium text-white/90 text-center py-2">
                   {activeScene.dialogue || <span className="text-white/10 italic">（此镜头无台词）</span>}
                </p>
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

        {/* 右侧：审核互动区 */}
        <div className="w-80 border-l border-white/5 bg-[#121212] flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">修改反馈 (动画阶段)</span>
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
