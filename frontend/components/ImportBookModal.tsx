import React, { useEffect, useState } from 'react';
import { X, BookOpen, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import { BookType, CreateBookRequest } from '../api';

interface ImportBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateBookRequest) => Promise<void>;
  initialData?: CreateBookRequest;
  mode?: 'create' | 'edit';
  isLoading?: boolean;
}

export const ImportBookModal: React.FC<ImportBookModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  mode = 'create',
  isLoading = false,
}) => {
  const defaultFormData: CreateBookRequest = {
    title: '',
    author: '',
    cover: '',
    type: 'NOVEL',
    description: '',
  };
  const [formData, setFormData] = useState<CreateBookRequest>(initialData || defaultFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = mode === 'edit';

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData || defaultFormData);
      setError(null);
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('请输入作品名称');
      return;
    }
    if (!formData.author.trim()) {
      setError('请输入作者名称');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      // 重置表单
      setFormData(defaultFormData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
              <Upload size={20} className="text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-white">{isEditMode ? '编辑作品' : '导入新作品'}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* 表单 */}
        {isLoading ? (
          <div className="p-6 flex items-center justify-center gap-3 text-white/60">
            <Loader2 size={20} className="animate-spin" />
            <span>加载作品信息...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* 作品类型 */}
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                作品类型
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'NOVEL' }))}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                    formData.type === 'NOVEL'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                      : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
                  }`}
                >
                  <BookOpen size={18} />
                  <span className="font-semibold">小说</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'COMIC' }))}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                    formData.type === 'COMIC'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                      : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
                  }`}
                >
                  <ImageIcon size={18} />
                  <span className="font-semibold">漫画</span>
                </button>
              </div>
            </div>

            {/* 作品名称 */}
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                作品名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="请输入作品名称"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
            </div>

            {/* 作者 */}
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                作者 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="author"
                value={formData.author}
                onChange={handleInputChange}
                placeholder="请输入作者名称"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
            </div>

            {/* 封面 URL */}
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                封面图片 URL
              </label>
              <input
                type="text"
                name="cover"
                value={formData.cover}
                onChange={handleInputChange}
                placeholder="https://example.com/cover.jpg（可选）"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
            </div>

            {/* 简介 */}
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">
                作品简介
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="请输入作品简介（可选）"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none"
              />
            </div>

            {/* 提交按钮 */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 font-semibold hover:bg-white/5 transition-all"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>{isEditMode ? '保存中...' : '创建中...'}</span>
                  </>
                ) : (
                  <span>{isEditMode ? '保存修改' : '确认导入'}</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
