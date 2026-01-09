
import React, { useState, useRef } from 'react';
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
  Mic2,
  Music,
  Waves,
  Volume2,
  FileAudio,
  Type
} from 'lucide-react';

interface AudioEditorProps {
  episode: Episode;
}

const STATUS_MAP: Record<Status, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成'
};

export const AudioEditor: React.FC<AudioEditorProps> = ({ episode }) => {
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const activeScene = episode.scenes[activeSceneIndex];

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
        {episode.scenes.map((scene, idx) => (
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
                <Mic2 size={16} className="text-white/10" />
              )}
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                 <div className="p-1 rounded bg-black/40 border border-white/10">
                   <Volume2 size={10} className="text-blue-400" />
                 </div>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] py-0.5 px-1 text-white/70 font-mono">
              #{scene.index}
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：参考区（剧本 + 分镜） */}
        <div className="w-80 border-r border-white/5 bg-[#121212] overflow-y-auto p-5 flex flex-col gap-6">
          <section>
            <div className="flex items-center gap-2 mb-3 text-blue-400">
              <Info size={14} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">画面与剧本参考</h3>
            </div>
            <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black mb-3">
               {activeScene.startFrameUrl && <img src={activeScene.startFrameUrl} className="w-full h-full object-cover opacity-50" />}
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/5 text-[12px] text-white/70 leading-relaxed mb-4">
              <span className="text-blue-400 font-bold">需求:</span> "{activeScene.description}"
            </div>
            <div className="bg-purple-600/10 rounded-lg p-3 border border-purple-500/20 text-[13px] text-white/90 font-medium">
              <div className="flex items-center gap-2 mb-1">
                <Type size={12} className="text-purple-400" />
                <span className="text-[9px] font-bold uppercase text-purple-400">台词内容</span>
              </div>
              {activeScene.dialogue || <span className="text-white/20 italic">（此镜头无台词）</span>}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3 text-green-400">
              <Waves size={14} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">音频备注</h3>
            </div>
            <p className="text-xs text-white/50 leading-relaxed px-1 italic">
              {activeScene.dialogue || '主编暂无额外备注'}
            </p>
          </section>
        </div>

        {/* 中间：动画预览与音频上传区 */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a]">
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  场景 {activeScene.index} 音频后期
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${
                    activeScene.status === 'COMPLETED' ? 'bg-green-600 text-white border-green-500' : 'bg-green-600/20 text-green-400 border-green-600/30'
                  }`}>
                    {STATUS_MAP[activeScene.status]}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white transition-all"><ChevronLeft size={20} /></button>
                  <button className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white transition-all"><ChevronRight size={20} /></button>
                </div>
              </div>

              {/* 动画预览（对口型、合音效用） */}
              <div className="aspect-video w-full rounded-2xl border border-white/5 bg-zinc-900 overflow-hidden relative group shadow-2xl mb-8">
                {activeScene.clipUrl ? (
                  <>
                    <video 
                      ref={videoRef}
                      src={activeScene.clipUrl}
                      className="w-full h-full object-contain"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                    />
                    {!isPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer" onClick={togglePlay}>
                        <div className="p-4 rounded-full bg-white/10 text-white backdrop-blur-md border border-white/20">
                          <Play fill="currentColor" size={24} />
                        </div>
                      </div>
                    )}
                    <div className="absolute top-4 left-4">
                      <span className="px-2 py-1 bg-black/60 rounded text-[9px] font-bold text-white/50 uppercase tracking-widest backdrop-blur-md">动画参考视图</span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white/10">
                    <AlertCircle size={40} />
                    <p className="text-xs uppercase font-bold tracking-widest">暂无动画片段，请先完成动画制作</p>
                  </div>
                )}
              </div>

              {/* 音频轨道上传区 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1a1a1a] rounded-xl p-6 border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer group">
                   <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                         <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
                            <Mic2 size={20} />
                         </div>
                         <div>
                            <h4 className="text-sm font-bold text-white">干声/配音</h4>
                            <p className="text-[10px] text-white/30 uppercase">Voice Over Track</p>
                         </div>
                      </div>
                      <Upload size={16} className="text-white/20 group-hover:text-blue-400 transition-colors" />
                   </div>
                   <div className="h-10 rounded bg-black/40 border border-white/5 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white/10 uppercase tracking-widest">点击上传 WAV/MP3</span>
                   </div>
                </div>

                <div className="bg-[#1a1a1a] rounded-xl p-6 border border-white/5 hover:border-green-500/30 transition-all cursor-pointer group">
                   <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                         <div className="p-2 rounded-lg bg-green-600/20 text-green-400">
                            <Music size={20} />
                         </div>
                         <div>
                            <h4 className="text-sm font-bold text-white">环境音/音效</h4>
                            <p className="text-[10px] text-white/30 uppercase">SFX / Ambience</p>
                         </div>
                      </div>
                      <Upload size={16} className="text-white/20 group-hover:text-green-400 transition-colors" />
                   </div>
                   <div className="h-10 rounded bg-black/40 border border-white/5 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white/10 uppercase tracking-widest">点击上传音频资产</span>
                   </div>
                </div>
              </div>

              {/* 已上传音频预览列表（模拟） */}
              <div className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden">
                <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
                   <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">已关联音频资产 (公开审核)</span>
                   <FileAudio size={14} className="text-white/20" />
                </div>
                <div className="p-4 flex flex-col gap-2">
                   <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 group hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                         <Play size={12} fill="currentColor" className="text-blue-500" />
                         <span className="text-xs text-white/80">主角_觉醒_台词_V1.wav</span>
                      </div>
                      <span className="text-[9px] text-white/20">1.2 MB / 0:04</span>
                   </div>
                   <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 group hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                         <Play size={12} fill="currentColor" className="text-green-500" />
                         <span className="text-xs text-white/80">灵力爆发_低频冲击.wav</span>
                      </div>
                      <span className="text-[9px] text-white/20">840 KB / 0:02</span>
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
