import React from 'react';
import { X, Download, FileText, Calendar, HardDrive, Tag } from 'lucide-react';
import { Lora } from '../types';
import { getFileUrl, downloadFile } from '../api';
import { LORA_MODEL_OPTIONS, DEFAULT_LORA_PREVIEW } from '../constants';

interface LoraDetailProps {
  lora: Lora;
  onClose: () => void;
}

const MODEL_TYPE_LABELS: Record<string, string> = {
  'SD_1.5': 'SD 1.5',
  'SDXL': 'SDXL',
};

export const LoraDetail: React.FC<LoraDetailProps> = ({ lora, onClose }) => {
  const previewUrl = lora.previewUrl ? getFileUrl(lora.previewUrl) : DEFAULT_LORA_PREVIEW;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const handleDownload = (url: string, filename: string) => {
    const fullUrl = getFileUrl(url);
    downloadFile(fullUrl, filename);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* 头部 */}
        <div className="relative h-64 bg-zinc-900 overflow-hidden">
          <img
            src={previewUrl}
            className="w-full h-full object-cover"
            alt={lora.name}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-md rounded-lg text-white/60 hover:text-white hover:bg-black/70 transition-all"
          >
            <X size={20} />
          </button>
          {/* 模型类型标签 */}
          <div className="absolute top-4 left-4">
            <span className="px-3 py-1 rounded-lg bg-purple-600/80 backdrop-blur-md border border-purple-400/30 text-sm font-bold text-white">
              {MODEL_TYPE_LABELS[lora.modelType] || lora.modelType}
            </span>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 标题 */}
          <div>
            <h2 className="text-2xl font-bold text-white">{lora.name}</h2>
            {lora.description && (
              <p className="mt-2 text-white/60 text-sm leading-relaxed">{lora.description}</p>
            )}
          </div>

          {/* 元信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg">
              <Calendar size={18} className="text-white/40" />
              <div>
                <div className="text-xs text-white/40">上传时间</div>
                <div className="text-sm text-white">{formatDate(lora.createdAt)}</div>
              </div>
            </div>
            {lora.fileSize > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg">
                <HardDrive size={18} className="text-white/40" />
                <div>
                  <div className="text-xs text-white/40">文件大小</div>
                  <div className="text-sm text-white">{formatFileSize(lora.fileSize)}</div>
                </div>
              </div>
            )}
          </div>

          {/* 标签 */}
          {lora.tags && lora.tags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag size={16} className="text-white/40" />
                <span className="text-sm text-white/60">标签</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {lora.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-lg text-blue-300 text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 下载按钮 */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider">文件下载</h3>

            {lora.fileUrl && (
              <button
                onClick={() => handleDownload(lora.fileUrl, `${lora.name}.safetensors`)}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Download size={20} />
                  <div className="text-left">
                    <div className="font-bold">下载 LoRA 文件</div>
                    <div className="text-xs text-white/60">{lora.fileUrl.split('/').pop()}</div>
                  </div>
                </div>
                {lora.fileSize > 0 && (
                  <span className="text-sm text-white/60">{formatFileSize(lora.fileSize)}</span>
                )}
              </button>
            )}

            {lora.configUrl && (
              <button
                onClick={() => handleDownload(lora.configUrl, lora.configUrl.split('/').pop() || 'config')}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-white/60" />
                  <div className="text-left">
                    <div className="font-medium">配置文件</div>
                    <div className="text-xs text-white/40">{lora.configUrl.split('/').pop()}</div>
                  </div>
                </div>
                <Download size={16} className="text-white/40" />
              </button>
            )}

            {!lora.fileUrl && !lora.configUrl && (
              <p className="text-white/40 text-sm text-center py-4">暂无可下载的文件</p>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white/60 text-sm hover:bg-white/10 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoraDetail;
