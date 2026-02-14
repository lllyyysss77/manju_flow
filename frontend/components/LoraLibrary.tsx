import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  PlusCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  Filter,
} from 'lucide-react';
import { Lora, LoraModelType } from '../types';
import { loraApi, downloadFile, getFileUrl } from '../api';
import { LORA_MODEL_OPTIONS } from '../constants';
import { LoraCard } from './LoraCard';
import { LoraModal } from './LoraModal';
import { LoraDetail } from './LoraDetail';

interface LoraLibraryProps {
  onBack?: () => void;
}

export const LoraLibrary: React.FC<LoraLibraryProps> = ({ onBack }) => {
  const [loras, setLoras] = useState<Lora[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 筛选状态
  const [modelFilter, setModelFilter] = useState<'ALL' | LoraModelType>('ALL');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');

  // 可用标签列表
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // 弹窗状态
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLora, setSelectedLora] = useState<Lora | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // 防抖处理搜索关键词
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // 加载 LoRA 列表
  const loadLoras = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: {
        modelType?: LoraModelType;
        tag?: string;
        keyword?: string;
        size?: number;
      } = { size: 100 };
      if (modelFilter !== 'ALL') {
        params.modelType = modelFilter;
      }
      if (tagFilter) {
        params.tag = tagFilter;
      }
      if (debouncedKeyword.trim()) {
        params.keyword = debouncedKeyword.trim();
      }
      const response = await loraApi.list(params);
      // 转换 tags 从 JSON 字符串到数组（如果后端返回的是字符串）
      const processedLoras = response.data.map((lora) => ({
        ...lora,
        tags: typeof lora.tags === 'string' ? JSON.parse(lora.tags as unknown as string) : lora.tags,
      }));
      setLoras(processedLoras);
    } catch (err) {
      console.error('Failed to load loras:', err);
      setError(err instanceof Error ? err.message : '加载失败，请检查网络连接');
    } finally {
      setIsLoading(false);
    }
  }, [modelFilter, tagFilter, debouncedKeyword]);

  // 加载标签列表
  const loadTags = useCallback(async () => {
    try {
      const response = await loraApi.getTags();
      setAvailableTags(response.tags || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadLoras();
    loadTags();
  }, [loadLoras, loadTags]);

  // 查看详情
  const handleView = (lora: Lora) => {
    setSelectedLora(lora);
    setIsDetailOpen(true);
  };

  // 下载文件
  const handleDownload = (lora: Lora) => {
    if (lora.fileUrl) {
      const filename = `${lora.name}.safetensors`;
      downloadFile(getFileUrl(lora.fileUrl), filename);
    }
  };

  // 删除 LoRA
  const handleDelete = async (lora: Lora) => {
    if (!window.confirm(`确定删除「${lora.name}」吗？此操作不可撤销。`)) return;
    setDeletingId(lora.id);
    try {
      await loraApi.delete(lora.id);
      await loadLoras();
      await loadTags();
    } catch (err) {
      console.error('Failed to delete lora:', err);
      alert('删除失败，请稍后再试');
    } finally {
      setDeletingId(null);
    }
  };

  // 创建/编辑成功后刷新
  const handleSuccess = async () => {
    await loadLoras();
    await loadTags();
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* LoRA 子筛选栏 - 移到内容区内部 */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a] px-12 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* 模型类型筛选 */}
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setModelFilter('ALL')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  modelFilter === 'ALL'
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                全部
              </button>
              {LORA_MODEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setModelFilter(option.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    modelFilter === option.value
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-white/40 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* 标签筛选 */}
            {availableTags.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-white/40" />
                <select
                  value={tagFilter || ''}
                  onChange={(e) => setTagFilter(e.target.value || null)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">全部标签</option>
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
              <input
                className="bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 w-56"
                placeholder="搜索 LoRA..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-500 transition-all"
            >
              <PlusCircle size={16} /> 上传 LoRA
            </button>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-12">
          <header className="mb-10">
            <h2 className="text-3xl font-bold text-white mb-2">LoRA 模型库</h2>
            <p className="text-white/30 text-sm">
              {isLoading ? '正在加载...' : `共有 ${loras.length} 个 LoRA`}
            </p>
          </header>

          {/* 加载状态 */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={40} className="text-purple-500 animate-spin mb-4" />
              <p className="text-white/40 text-sm">正在加载 LoRA 列表...</p>
            </div>
          )}

          {/* 错误状态 */}
          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle size={40} className="text-red-400 mb-4" />
              <p className="text-red-400 text-sm mb-4">{error}</p>
              <button
                onClick={loadLoras}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg text-sm hover:bg-white/10 transition-all"
              >
                <RefreshCw size={16} /> 重新加载
              </button>
            </div>
          )}

          {/* 空状态 */}
          {!isLoading && !error && loras.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <BookOpen size={40} className="text-white/20 mb-4" />
              <p className="text-white/40 text-sm mb-4">
                {searchKeyword || tagFilter || modelFilter !== 'ALL'
                  ? '没有找到匹配的 LoRA'
                  : '暂无 LoRA，点击上方按钮上传'}
              </p>
              {!searchKeyword && !tagFilter && modelFilter === 'ALL' && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-500 transition-all"
                >
                  <PlusCircle size={16} /> 上传 LoRA
                </button>
              )}
            </div>
          )}

          {/* LoRA 列表 */}
          {!isLoading && !error && loras.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
              {loras.map((lora) => (
                <LoraCard
                  key={lora.id}
                  lora={lora}
                  onView={handleView}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  isDeleting={deletingId === lora.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 */}
      <LoraModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleSuccess}
        mode="create"
      />

      {selectedLora && (
        <>
          <LoraModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setSelectedLora(null);
            }}
            onSuccess={handleSuccess}
            lora={selectedLora}
            mode="edit"
          />
          <LoraDetail
            lora={selectedLora}
            onClose={() => {
              setIsDetailOpen(false);
              setSelectedLora(null);
            }}
          />
        </>
      )}
    </div>
  );
};

export default LoraLibrary;
