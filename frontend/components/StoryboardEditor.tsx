
import React, { useEffect, useState } from 'react';
import { Episode, Scene, Status } from '../types';
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
  Music
} from 'lucide-react';

interface StoryboardEditorProps {
  episode: Episode;
}

const STATUS_MAP: Record<Status, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成'
};

export const StoryboardEditor: React.FC<StoryboardEditorProps> = ({ episode }) => {
  const sortedScenes = [...episode.scenes].sort((a, b) => a.index - b.index);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  useEffect(() => {
    if (activeSceneIndex >= sortedScenes.length) {
      setActiveSceneIndex(Math.max(0, sortedScenes.length - 1));
    }
  }, [activeSceneIndex, sortedScenes.length]);
  const activeScene = sortedScenes[activeSceneIndex];

  if (!activeScene) return null;

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      {/* 顶部场景快速切换条 */}
      <div className="h-20 border-b border-white/5 bg-[#141414] flex items-center px-4 gap-2 overflow-x-auto">
        {sortedScenes.map((scene, idx) => {
          const displayNumber = idx + 1;
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
            {scene.startFrameUrl ? (
              <img src={scene.startFrameUrl} className="w-full h-full object-cover" alt="" />
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

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：剧本参考区 */}
        <div className="w-80 border-r border-white/5 bg-[#121212] overflow-y-auto p-6 flex flex-col gap-8">
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
              <img src={activeScene.referenceImageUrl} className="w-full rounded-lg border border-white/10" alt="参考图" />
            ) : (
              <p className="text-xs text-white/40 leading-relaxed px-1">暂无参考图</p>
            )}
          </section>
        </div>

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
                    disabled={activeSceneIndex === episode.scenes.length - 1}
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
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">起始帧 / 关键帧 A</span>
                  <div className="aspect-video w-full rounded-xl border-2 border-dashed border-white/5 bg-zinc-900 overflow-hidden relative group">
                    {activeScene.startFrameUrl ? (
                      <>
                        <img src={activeScene.startFrameUrl} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg shadow-xl">更换图片</button>
                        </div>
                      </>
                    ) : (
                      <button className="absolute inset-0 flex flex-col items-center justify-center gap-3 hover:bg-white/5 transition-colors">
                        <Upload size={32} className="text-white/20" />
                        <span className="text-xs font-bold text-white/20 uppercase">点击上传首帧</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">结束帧 / 关键帧 B</span>
                  <div className="aspect-video w-full rounded-xl border-2 border-dashed border-white/5 bg-zinc-900 overflow-hidden relative group">
                    {activeScene.endFrameUrl ? (
                       <>
                        <img src={activeScene.endFrameUrl} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg shadow-xl">更换图片</button>
                        </div>
                      </>
                    ) : (
                      <button className="absolute inset-0 flex flex-col items-center justify-center gap-3 hover:bg-white/5 transition-colors">
                        <Upload size={32} className="text-white/20" />
                        <span className="text-xs font-bold text-white/20 uppercase">上传尾帧 (可选)</span>
                      </button>
                    )}
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

        {/* 右侧：实时评审交流区 */}
        <div className="w-80 border-l border-white/5 bg-[#121212] flex flex-col">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">修改历史与讨论</span>
            <MessageSquare size={16} className="text-white/20" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeScene.comments.map(c => (
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
      </div>
    </div>
  );
};
