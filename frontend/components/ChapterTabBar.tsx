import React from 'react';
import { MessageSquare } from 'lucide-react';
import { Episode } from '../types';

interface ChapterTabBarProps {
  chapters: Episode[];
  activeChapterId: number | null;
  onSelectChapter: (chapterId: number, index: number) => void;
  showSceneCount?: boolean;
  commentCounts?: Record<number, number>;
  className?: string;
}

/**
 * 章节选项卡组件
 * 横向滚动的章节选择器，用于各个编辑器顶部
 */
export const ChapterTabBar: React.FC<ChapterTabBarProps> = ({
  chapters,
  activeChapterId,
  onSelectChapter,
  showSceneCount = true,
  commentCounts,
  className = '',
}) => {
  return (
    <div className={`px-4 py-3 flex gap-2 overflow-x-auto border-b border-white/10 ${className}`}>
      {chapters.map((ch, cIdx) => {
        const isActive = activeChapterId === ch.id;
        const commentCount = commentCounts?.[ch.id] ?? 0;
        return (
          <button
            key={ch.id}
            onClick={() => onSelectChapter(ch.id, cIdx)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl border transition-all text-left min-w-[180px] relative ${
              isActive
                ? 'bg-blue-600/20 border-blue-500/40 text-white shadow-[0_0_20px_rgba(59,130,246,0.35)]'
                : 'bg-[#0f0f0f] border-white/10 text-white/60 hover:border-white/30 hover:text-white'
            }`}
          >
            {commentCount > 0 && (
              <span
                className="absolute top-2 right-2 flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300/90"
                title={`${commentCount} 条评论`}
              >
                <MessageSquare size={9} />
                {commentCount}
              </span>
            )}
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">
              章节 {cIdx + 1}
            </div>
            <div className="text-sm font-semibold line-clamp-1">
              {ch.title || '未命名章节'}
            </div>
            {showSceneCount && (
              <div className="text-[11px] text-white/40 mt-1">
                场景 {ch.scenes?.length || 0} 个
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
