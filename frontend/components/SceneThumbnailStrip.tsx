import React from 'react';
import { Scene } from '../types';
import { CheckCircle2 } from 'lucide-react';
import { DEFAULT_SCENE_THUMB } from '../constants';
import { isValidMediaUrl } from '../api';

interface SceneThumbnailStripProps {
  scenes: Scene[];
  activeSceneId: number | null;
  onSelectScene: (sceneId: number, index: number) => void;
  /** 缩略图缓存：sceneId -> url */
  thumbnailCache?: Record<number, string>;
  /** 场景图标（不同模块可自定义） */
  icon?: React.ReactNode;
  className?: string;
}

/**
 * 场景缩略图条组件
 * 显示横向滚动的场景缩略图列表
 */
export const SceneThumbnailStrip: React.FC<SceneThumbnailStripProps> = ({
  scenes,
  activeSceneId,
  onSelectScene,
  thumbnailCache = {},
  icon,
  className = '',
}) => {
  const sortedScenes = [...scenes].sort((a, b) => a.index - b.index);

  return (
    <div className={`px-4 py-2 flex gap-2 overflow-x-auto border-b border-white/10 bg-[#0a0a0a] ${className}`}>
      {sortedScenes.map((scene, idx) => {
        const isActive = activeSceneId === scene.id;
        const cachedUrl = thumbnailCache[scene.id];
        const preview = cachedUrl || (isValidMediaUrl(scene.thumbnailUrl) ? scene.thumbnailUrl : DEFAULT_SCENE_THUMB);
        const displayNumber = idx + 1;

        return (
          <button
            key={scene.id}
            onClick={() => onSelectScene(scene.id, idx)}
            className={`flex-shrink-0 w-32 h-14 rounded-lg overflow-hidden border-2 relative transition-all group ${
              isActive
                ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.35)]'
                : 'border-white/10 hover:border-white/30'
            }`}
          >
            {preview && (
              <img
                src={preview}
                alt={`场景 ${displayNumber}`}
                className="w-full h-full object-cover"
              />
            )}
            {/* 场景编号 */}
            <div
              className={`absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded ${
                isActive ? 'bg-blue-600/80 text-white' : 'bg-black/60 text-white/80'
              }`}
            >
              {icon && <span className="mr-1">{icon}</span>}
              {displayNumber}
            </div>
            {/* 完成状态 */}
            {scene.status === 'COMPLETED' && (
              <div className="absolute top-1 right-1">
                <CheckCircle2 size={14} className="text-green-400 drop-shadow-md" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
