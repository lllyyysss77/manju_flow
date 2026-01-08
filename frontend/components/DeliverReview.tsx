
import React, { useState, useRef } from 'react';
import { Play, Pause, FastForward, Rewind, MessageSquare, Send, AlertCircle } from 'lucide-react';
import { Comment } from '../types';

interface DeliverReviewProps {
  videoUrl?: string;
}

export const DeliverReview: React.FC<DeliverReviewProps> = ({ videoUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const defaultVideo = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
  const source = videoUrl || defaultVideo;

  const [comments, setComments] = useState<Comment[]>([
    { id: 'v1', author: '导演', text: '0:05处的过渡太突兀了。', timestamp: '2024-05-21', timecode: 5 },
    { id: 'v2', author: '音频负责人', text: '背景音效在这里有爆音。', timestamp: '2024-05-22', timecode: 12 }
  ]);

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-full bg-[#0a0a0a]">
      {/* 视频播放器区域 */}
      <div className="flex-1 flex flex-col h-full">
        <div className="flex-1 relative group flex items-center justify-center bg-black overflow-hidden">
          {loadError ? (
            <div className="flex flex-col items-center gap-4 text-white/40">
              <AlertCircle size={48} className="text-red-500/50" />
              <div className="text-center">
                <p className="text-sm font-medium">无法加载视频源</p>
                <p className="text-[10px] text-white/20 mt-1">资源不可用或被拦截</p>
              </div>
              <button 
                onClick={() => { setLoadError(false); if(videoRef.current) videoRef.current.load(); }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-colors"
              >
                重试加载
              </button>
            </div>
          ) : (
            <video 
              ref={videoRef}
              className="max-h-full max-w-full"
              src={source}
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => setLoadError(true)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onClick={() => {
                if (videoRef.current) {
                  isPlaying ? videoRef.current.pause() : videoRef.current.play();
                }
              }}
            />
          )}
          
          {!loadError && !isPlaying && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
              onClick={() => videoRef.current?.play()}
            >
              <div className="p-6 rounded-full bg-blue-600 text-white shadow-2xl shadow-blue-900/40">
                <Play size={40} fill="currentColor" />
              </div>
            </div>
          )}
        </div>

        {/* 自定义播放控制 */}
        <div className="p-4 bg-[#1a1a1a] border-t border-white/5">
           <div 
             className="relative w-full h-1.5 bg-white/10 rounded-full mb-4 cursor-pointer"
             onClick={(e) => {
               const rect = e.currentTarget.getBoundingClientRect();
               const x = e.clientX - rect.left;
               const clickedPos = x / rect.width;
               if (videoRef.current) {
                 handleSeek(clickedPos * (videoRef.current.duration || 0));
               }
             }}
           >
              <div 
                className="absolute h-full bg-blue-500 rounded-full" 
                style={{ width: `${videoRef.current?.duration ? (currentTime / videoRef.current.duration) * 100 : 0}%` }}
              />
              {/* 评论标记 */}
              {comments.map(c => c.timecode !== undefined && (
                <div 
                  key={c.id}
                  className="absolute w-2 h-2 bg-yellow-400 rounded-full top-1/2 -translate-y-1/2 cursor-pointer border border-black shadow-sm z-10"
                  style={{ left: `${videoRef.current?.duration ? (c.timecode / videoRef.current.duration) * 100 : 0}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSeek(c.timecode!);
                  }}
                  title={`在 ${formatTime(c.timecode)} 的评论`}
                />
              ))}
           </div>
           
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-6">
                <button 
                  onClick={() => handleSeek(Math.max(0, currentTime - 5))}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <Rewind size={20} />
                </button>
                <button 
                  onClick={() => {
                    if (videoRef.current) {
                      isPlaying ? videoRef.current.pause() : videoRef.current.play();
                    }
                  }}
                  className="p-2 rounded-full bg-white text-black hover:scale-105 transition-transform"
                >
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                <button 
                  onClick={() => handleSeek(Math.min(videoRef.current?.duration || 0, currentTime + 5))}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <FastForward size={20} />
                </button>
                <span className="text-sm font-mono text-white/60">
                  {formatTime(currentTime)} / {formatTime(videoRef.current?.duration || 0)}
                </span>
             </div>
             
             <div className="flex items-center gap-4">
                <button className="px-4 py-1.5 border border-white/10 rounded text-xs font-bold hover:bg-white/5">下载源文件</button>
                <button className="px-4 py-1.5 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-500">批准定稿</button>
             </div>
           </div>
        </div>
      </div>

      {/* 评论侧边栏 */}
      <div className="w-80 border-l border-white/5 flex flex-col bg-[#111111]">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <span className="text-xs font-bold text-white/40 uppercase tracking-widest">时间轴反馈</span>
          <MessageSquare size={16} className="text-white/20" />
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {comments.map(c => (
            <div 
              key={c.id} 
              className="bg-[#1a1a1a] p-3 rounded-lg border border-white/5 cursor-pointer hover:border-blue-500/50 transition-all group"
              onClick={() => c.timecode !== undefined && handleSeek(c.timecode)}
            >
              <div className="flex justify-between mb-1">
                <span className="text-[10px] px-1.5 bg-blue-600/30 text-blue-400 font-mono rounded group-hover:bg-blue-600 group-hover:text-white transition-colors">{formatTime(c.timecode || 0)}</span>
                <span className="text-[10px] font-bold text-white/40 uppercase">{c.author}</span>
              </div>
              <p className="text-sm text-white/80 leading-snug">{c.text}</p>
            </div>
          ))}
        </div>

        <div className="p-4 bg-[#161616] border-t border-white/5">
           <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30 uppercase font-bold">新评论 @ {formatTime(currentTime)}</span>
              </div>
              <div className="relative">
                <textarea 
                  className="w-full bg-[#1e1e1e] border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-20"
                  placeholder="描述问题内容..."
                />
                <button className="absolute bottom-2 right-2 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-500 transition-colors">
                  <Send size={14} />
                </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
