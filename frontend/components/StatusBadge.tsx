import React from 'react';
import { Status } from '../types';
import { STATUS_MAP } from '../constants';

interface StatusBadgeProps {
  status: Status;
  /** 是否高亮显示（用于选中状态） */
  highlighted?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * 状态徽章组件
 * 显示场景/章节的状态（草稿/进行中/已完成）
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  highlighted = false,
  size = 'sm',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'text-[9px] px-1.5 py-0.5',
    md: 'text-[10px] px-2 py-0.5',
  };

  const statusColors = {
    DRAFT: highlighted
      ? 'bg-zinc-500/30 border-zinc-400/40 text-zinc-200'
      : 'bg-zinc-600/20 border-zinc-500/30 text-zinc-400',
    IN_PROGRESS: highlighted
      ? 'bg-orange-500/30 border-orange-400/40 text-orange-200'
      : 'bg-orange-600/20 border-orange-500/30 text-orange-400',
    COMPLETED: highlighted
      ? 'bg-green-500/30 border-green-400/40 text-green-200'
      : 'bg-green-600/20 border-green-500/30 text-green-400',
  };

  return (
    <span
      className={`rounded border font-medium ${sizeClasses[size]} ${statusColors[status]} ${className}`}
    >
      {STATUS_MAP[status]}
    </span>
  );
};
