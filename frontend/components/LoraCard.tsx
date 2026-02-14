import React from 'react';
import { Download, Trash2, Eye } from 'lucide-react';
import { Lora } from '../types';
import { getFileUrl } from '../api';
import { DEFAULT_LORA_PREVIEW } from '../constants';

interface LoraCardProps {
  lora: Lora;
  onView: (lora: Lora) => void;
  onDownload: (lora: Lora) => void;
  onDelete: (lora: Lora) => void;
  isDeleting?: boolean;
}

const MODEL_TYPE_LABELS: Record<string, string> = {
  'SD_1.5': 'SD 1.5',
  'SDXL': 'SDXL',
};

export const LoraCard: React.FC<LoraCardProps> = ({
  lora,
  onView,
  onDownload,
  onDelete,
  isDeleting = false,
}) => {
  const previewUrl = lora.previewUrl ? getFileUrl(lora.previewUrl) : DEFAULT_LORA_PREVIEW;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="group relative flex flex-col">
      <div className="aspect-square rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 relative shadow-2xl transition-all duration-500 group-hover:-translate-y-2 group-hover:border-blue-500/50">
        <img
          src={previewUrl}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          alt={lora.name}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(lora);
              }}
              className="flex-1 h-10 bg-white text-black rounded-xl flex items-center justify-center font-bold text-sm gap-2 hover:bg-blue-100 transition-colors"
            >
              <Eye size={16} /> 查看
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(lora);
              }}
              className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/20 hover:bg-white/20 transition-colors"
            >
              <Download size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(lora);
              }}
              disabled={isDeleting}
              className="w-10 h-10 bg-red-500/20 backdrop-blur-md rounded-xl flex items-center justify-center text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              {isDeleting ? (
                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 size={18} />
              )}
            </button>
          </div>
        </div>
        {/* 模型类型标签 */}
        <div className="absolute top-3 left-3">
          <span className="px-2 py-0.5 rounded-md bg-purple-600/80 backdrop-blur-md border border-purple-400/30 text-[10px] font-black uppercase text-white tracking-wider">
            {MODEL_TYPE_LABELS[lora.modelType] || lora.modelType}
          </span>
        </div>
        {/* 文件大小标签 */}
        {lora.fileSize > 0 && (
          <div className="absolute top-3 right-3">
            <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white/80">
              {formatFileSize(lora.fileSize)}
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 px-1">
        <h4 className="text-white font-bold text-base group-hover:text-blue-400 transition-colors truncate">
          {lora.name}
        </h4>
        <p className="text-white/30 text-xs mt-1 line-clamp-2">{lora.description || '暂无描述'}</p>
        {/* 标签 */}
        {lora.tags && lora.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lora.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="px-1.5 py-0.5 rounded bg-white/5 text-white/50 text-[10px] font-medium"
              >
                {tag}
              </span>
            ))}
            {lora.tags.length > 3 && (
              <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/30 text-[10px]">
                +{lora.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoraCard;
