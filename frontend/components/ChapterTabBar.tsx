import React from 'react';
import { Episode } from '../types';

interface ChapterTabBarProps {
  chapters: Episode[];
  activeChapterId: number | null;
  onSelectChapter: (chapterId: number, index: number) => void;
  showSceneCount?: boolean;
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
  className = '',
}) => {
  return (
    <div className={`px-4 py-3 flex gap-2 overflow-x-auto border-b border-white/10 ${className}`}>
      {chapters.map((ch, cIdx) => {
        const isActive = activeChapterId === ch.id;
        return (
          <button
            key={ch.id}
            onClick={() => onSelectChapter(ch.id, cIdx)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl border transition-all text-left min-w-[180px] ${
              isActive
                ? 'bg-blue-600/20 border-blue-500/40 text-white shadow-[0_0_20px_rgba(59,130,246,0.35)]'
                : 'bg-[#0f0f0f] border-white/10 text-white/60 hover:border-white/30 hover:text-white'
            }`}
          >
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
