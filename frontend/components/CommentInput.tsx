import React, { useState, useRef, useCallback } from 'react';
import { Send, Image, X, Loader2 } from 'lucide-react';
import { fileApi } from '../api';
import { CommentMeta } from '../types';

export interface CommentInputProps {
  onSubmit: (content: string, meta?: string) => Promise<void>;
  disabled?: boolean;
  posting?: boolean;
  placeholder?: string;
  /** 额外的 meta 数据（如审核交付的时间点），会与图片 meta 合并 */
  extraMeta?: Partial<CommentMeta>;
  /** 受控模式：外部传入的值 */
  value?: string;
  /** 受控模式：值变化时的回调 */
  onChange?: (value: string) => void;
  /** 提交成功后的回调（用于清空受控模式下的外部状态） */
  onSubmitSuccess?: () => void;
}

export const CommentInput: React.FC<CommentInputProps> = ({
  onSubmit,
  disabled = false,
  posting = false,
  placeholder = '输入您的修改意见或审核回复...',
  extraMeta,
  value,
  onChange,
  onSubmitSuccess,
}) => {
  const [internalContent, setInternalContent] = useState('');

  // 支持受控和非受控模式
  const isControlled = value !== undefined;
  const content = isControlled ? value : internalContent;
  const setContent = isControlled ? (onChange || (() => {})) : setInternalContent;
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const preview = URL.createObjectURL(file);
          setPendingImage({ file, preview });
          setUploadError(null);
        }
        break;
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const preview = URL.createObjectURL(file);
      setPendingImage({ file, preview });
      setUploadError(null);
    }
    // 清空 input 以便可以选择同一文件
    e.target.value = '';
  }, []);

  const handleRemoveImage = useCallback(() => {
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.preview);
      setPendingImage(null);
      setUploadError(null);
    }
  }, [pendingImage]);

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent && !pendingImage) return;

    let meta: CommentMeta = { ...extraMeta };

    // 如果有图片，先上传
    if (pendingImage) {
      setUploading(true);
      setUploadError(null);
      try {
        const res = await fileApi.upload(pendingImage.file, 'public');
        meta.imageUrl = res.url;
        meta.imageName = pendingImage.file.name;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '图片上传失败';
        setUploadError(msg);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    // 提交评论
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : undefined;
    await onSubmit(trimmedContent || '（图片）', metaStr);

    // 清空状态
    if (isControlled) {
      // 受控模式：通知外部清空
      onSubmitSuccess?.();
    } else {
      setInternalContent('');
    }
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.preview);
      setPendingImage(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !uploading && !posting) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isDisabled = disabled || posting || uploading;
  const canSubmit = (content.trim() || pendingImage) && !isDisabled;

  return (
    <div className="p-4 bg-[#161616] border-t border-white/5">
      {/* 图片预览区 */}
      {pendingImage && (
        <div className="mb-3 relative inline-block">
          <img
            src={pendingImage.preview}
            alt="待上传图片"
            className="max-h-32 rounded-lg border border-white/10"
          />
          <button
            onClick={handleRemoveImage}
            className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-white hover:bg-red-400 transition-colors"
            title="移除图片"
          >
            <X size={12} />
          </button>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
              <Loader2 size={20} className="animate-spin text-white" />
            </div>
          )}
        </div>
      )}

      {/* 上传错误提示 */}
      {uploadError && (
        <div className="mb-2 text-xs text-red-400">
          {uploadError}
        </div>
      )}

      {/* 输入区 */}
      <div className="flex items-center gap-2 bg-[#1e1e1e] border border-white/10 rounded-xl px-3 py-2">
        {/* 图片按钮 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isDisabled}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
          title="添加图片"
        >
          <Image size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* 文字输入 */}
        <input
          ref={inputRef}
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          placeholder={placeholder}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={isDisabled}
        />

        {/* 发送按钮 */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-60"
        >
          {posting || uploading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>

      {/* 提示文字 */}
      <p className="mt-1.5 text-[10px] text-white/20">
        支持粘贴图片 · Enter 发送
      </p>
    </div>
  );
};
