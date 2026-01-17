import { useEffect, useState } from 'react';

interface PanelResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  /** 'left' 从左侧计算 (e.clientX)，'right' 从右侧计算 (window.innerWidth - e.clientX) */
  side: 'left' | 'right';
}

/**
 * 面板拖拽调整大小 Hook
 * 统一处理面板宽度拖拽调整的逻辑
 */
export function usePanelResize({ initialWidth, minWidth, maxWidth, side }: PanelResizeOptions) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent) => {
      const newWidth =
        side === 'left'
          ? Math.min(maxWidth, Math.max(minWidth, e.clientX))
          : Math.min(maxWidth, Math.max(minWidth, window.innerWidth - e.clientX));
      setWidth(newWidth);
    };

    const handleUp = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing, maxWidth, minWidth, side]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return { width, isResizing, startResizing, setWidth };
}
