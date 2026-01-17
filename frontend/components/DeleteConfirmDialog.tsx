import React from 'react';
import { Trash2 } from 'lucide-react';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  itemName?: string;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 删除确认对话框组件
 * 用于确认删除操作，防止误操作
 */
export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  itemName,
  isDeleting = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[360px] rounded-2xl border border-white/10 bg-[#111111] shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-white">
          <div className="p-2 rounded-full bg-red-500/10 border border-red-500/30 text-red-300">
            <Trash2 size={16} />
          </div>
          <div>
            <p className="text-sm font-bold">{title}</p>
            <p className="text-xs text-white/50">
              {itemName ? message.replace('{name}', itemName) : message}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold border border-red-500/60 shadow-md disabled:opacity-50"
          >
            {isDeleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
};
