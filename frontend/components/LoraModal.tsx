import React, { useState, useEffect } from 'react';
import { X, Upload, Loader2, Image, FileText, File } from 'lucide-react';
import { Lora, LoraModelType, CreateLoraRequest, UpdateLoraRequest } from '../types';
import { loraApi, fileApi, getFileUrl } from '../api';
import { LORA_MODEL_OPTIONS, DEFAULT_LORA_PREVIEW } from '../constants';

// 常用标签建议
const COMMON_TAG_SUGGESTIONS = [
  // 性别
  '男', '女',
  // 年龄
  '老人', '中年', '青年', '少年', '小孩', '婴儿',
  // 风格
  '写实', '动漫', '插画', '油画', '水彩', '素描',
  // 人物特征
  '亚洲人', '欧美人', '黑人',
  // 场景
  '室内', '室外', '自然', '城市',
];

interface LoraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lora?: Lora; // 编辑模式下传入
  mode?: 'create' | 'edit';
}

export const LoraModal: React.FC<LoraModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  lora,
  mode = 'create',
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [modelType, setModelType] = useState<LoraModelType>('SD_1.5');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [configUrl, setConfigUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    file?: number;
    preview?: number;
    config?: number;
  }>({});

  // 编辑模式下初始化数据
  useEffect(() => {
    if (lora && mode === 'edit') {
      setName(lora.name);
      setDescription(lora.description || '');
      setModelType(lora.modelType);
      setTags(lora.tags || []);
      setFileUrl(lora.fileUrl || '');
      setFileSize(lora.fileSize || 0);
      setPreviewUrl(lora.previewUrl || '');
      setConfigUrl(lora.configUrl || '');
    } else {
      // 创建模式重置表单
      setName('');
      setDescription('');
      setModelType('SD_1.5');
      setTags([]);
      setFileUrl('');
      setFileSize(0);
      setPreviewUrl('');
      setConfigUrl('');
    }
    setTagInput('');
    setUploadProgress({});
  }, [lora, mode, isOpen]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleAddSuggestedTag = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'file' | 'preview' | 'config'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadProgress((prev) => ({ ...prev, [type]: 0 }));
      const result = await fileApi.uploadWithProgress(
        file,
        'public',
        (percent) => {
          setUploadProgress((prev) => ({ ...prev, [type]: percent }));
        }
      );

      if (type === 'file') {
        setFileUrl(result.key);
        setFileSize(result.size);
      } else if (type === 'preview') {
        setPreviewUrl(result.key);
      } else if (type === 'config') {
        setConfigUrl(result.key);
      }
    } catch (err) {
      console.error(`Failed to upload ${type}:`, err);
      alert(`上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setUploadProgress((prev) => ({ ...prev, [type]: undefined }));
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert('请输入 LoRA 名称');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'create') {
        const data: CreateLoraRequest = {
          name: name.trim(),
          description: description.trim(),
          modelType,
          tags,
          fileUrl: fileUrl || undefined,
          fileSize: fileSize || undefined,
          previewUrl: previewUrl || undefined,
          configUrl: configUrl || undefined,
        };
        await loraApi.create(data);
      } else if (lora) {
        const data: UpdateLoraRequest = {
          name: name.trim(),
          description: description.trim(),
          modelType,
          tags,
          fileUrl: fileUrl || undefined,
          fileSize: fileSize || undefined,
          previewUrl: previewUrl || undefined,
          configUrl: configUrl || undefined,
        };
        await loraApi.update(lora.id, data);
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save lora:', err);
      alert(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">
            {mode === 'create' ? '上传 LoRA' : '编辑 LoRA'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* 基本信息 */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider">基本信息</h3>

            <div>
              <label className="block text-sm text-white/60 mb-2">
                名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="输入 LoRA 名称"
              />
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                rows={3}
                placeholder="描述这个 LoRA 的特点、适用场景等"
              />
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">适用模型</label>
              <div className="flex gap-2 flex-wrap">
                {LORA_MODEL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setModelType(option.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      modelType === option.value
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                    } border`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">标签</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="输入标签后按 Enter 添加"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-white/10 rounded-lg text-white text-sm hover:bg-white/20 transition-colors"
                >
                  添加
                </button>
              </div>
              {/* 常用标签建议 */}
              <div className="mb-3">
                <p className="text-xs text-white/40 mb-2">常用标签：</p>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_TAG_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleAddSuggestedTag(suggestion)}
                      disabled={tags.includes(suggestion)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        tags.includes(suggestion)
                          ? 'bg-white/5 text-white/30 cursor-not-allowed'
                          : 'bg-white/5 text-white/60 hover:bg-purple-600/30 hover:text-purple-300'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
              {/* 已选标签 */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, index) => (
                    <span
                      key={index}
                      className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 border border-purple-500/30 rounded-md text-purple-300 text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-400"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 文件上传 */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider">文件上传</h3>

            {/* LoRA 文件 */}
            <div>
              <label className="block text-sm text-white/60 mb-2">LoRA 文件 (.safetensors)</label>
              <div className="relative">
                <input
                  type="file"
                  accept=".safetensors"
                  onChange={(e) => handleFileUpload(e, 'file')}
                  className="hidden"
                  id="lora-file-upload"
                />
                <label
                  htmlFor="lora-file-upload"
                  className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 border-dashed rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                >
                  <File size={20} className="text-white/40" />
                  <span className="text-sm text-white/60">
                    {fileUrl ? '已上传，点击更换' : '点击上传 LoRA 文件'}
                  </span>
                  {uploadProgress.file !== undefined && (
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${uploadProgress.file}%` }}
                        />
                      </div>
                      <span className="text-xs text-white/40">{uploadProgress.file}%</span>
                    </div>
                  )}
                </label>
              </div>
              {fileUrl && (
                <p className="mt-1 text-xs text-white/40">
                  已上传: {fileUrl.split('/').pop()}
                </p>
              )}
            </div>

            {/* 预览图 */}
            <div>
              <label className="block text-sm text-white/60 mb-2">效果图 / 预览图</label>
              <div className="flex gap-4">
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'preview')}
                    className="hidden"
                    id="lora-preview-upload"
                  />
                  <label
                    htmlFor="lora-preview-upload"
                    className="w-32 h-32 flex flex-col items-center justify-center bg-white/5 border border-white/10 border-dashed rounded-lg cursor-pointer hover:bg-white/10 transition-colors overflow-hidden"
                  >
                    {previewUrl ? (
                      <img
                        src={getFileUrl(previewUrl)}
                        className="w-full h-full object-cover"
                        alt="Preview"
                      />
                    ) : (
                      <>
                        <Image size={24} className="text-white/40 mb-1" />
                        <span className="text-xs text-white/40">上传图片</span>
                      </>
                    )}
                  </label>
                  {uploadProgress.preview !== undefined && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-xs text-white">{uploadProgress.preview}%</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 text-xs text-white/40">
                  <p>建议上传使用该 LoRA 生成的效果图</p>
                  <p className="mt-1">支持 JPG、PNG 格式</p>
                </div>
              </div>
            </div>

            {/* 配置文件 */}
            <div>
              <label className="block text-sm text-white/60 mb-2">配置文件（可选）</label>
              <div className="relative">
                <input
                  type="file"
                  accept=".json,.yaml,.yml,.txt"
                  onChange={(e) => handleFileUpload(e, 'config')}
                  className="hidden"
                  id="lora-config-upload"
                />
                <label
                  htmlFor="lora-config-upload"
                  className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 border-dashed rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                >
                  <FileText size={20} className="text-white/40" />
                  <span className="text-sm text-white/60">
                    {configUrl ? '已上传，点击更换' : '点击上传配置文件'}
                  </span>
                  {uploadProgress.config !== undefined && (
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${uploadProgress.config}%` }}
                        />
                      </div>
                      <span className="text-xs text-white/40">{uploadProgress.config}%</span>
                    </div>
                  )}
                </label>
              </div>
              {configUrl && (
                <p className="mt-1 text-xs text-white/40">
                  已上传: {configUrl.split('/').pop()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white/60 text-sm hover:bg-white/10 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 rounded-lg text-white text-sm font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            {mode === 'create' ? '上传' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoraModal;
