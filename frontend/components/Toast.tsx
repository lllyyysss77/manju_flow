import React, { useEffect, useState, useCallback } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  message: string;
  tone: ToastTone;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
  duration?: number;
}

/**
 * Toast 通知组件
 * 显示临时消息提示，自动消失
 */
export const Toast: React.FC<ToastProps> = ({ toast, onClose, duration = 3000 }) => {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [toast, onClose, duration]);

  if (!toast) return null;

  const toneClasses = {
    success: 'bg-green-500/20 border-green-500/40 text-green-100',
    error: 'bg-red-500/20 border-red-500/40 text-red-100',
    info: 'bg-blue-500/20 border-blue-500/40 text-blue-100',
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
      <div className={`px-5 py-2 rounded-lg border text-sm shadow-xl ${toneClasses[toast.tone]}`}>
        {toast.message}
      </div>
    </div>
  );
};

/**
 * Toast Hook - 提供 toast 状态管理
 */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ message, tone });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, hideToast };
}
