import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Character } from '../types';
import {
  Plus,
  Save,
  AlertCircle,
  Upload,
  X,
  Trash2,
  Users,
  BookOpen,
  Image as ImageIcon,
  ChevronDown,
  GripVertical,
  Download,
  Mic,
  Play,
  Pause
} from 'lucide-react';
import { bookApi, characterApi, fileApi, ensureHttpsUrl, normalizeFileKey, isValidMediaUrl, downloadFile } from '../api';

interface OutlineEditorProps {
  bookId: number;
  initialOutline?: string;
  initialCharacters?: Character[];
  onOutlineChange?: (outline: string) => void;
  onCharactersChange?: (characters: Character[]) => void;
}

// 参考图组件（与分镜模块保持一致的交互）
const ReferenceImageSection: React.FC<{
  initialImage?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
  isUploading?: boolean;
}> = ({ initialImage, onUpload, onRemove, isUploading = false }) => {
  const [localUploading, setLocalUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = isUploading || localUploading;

  // ESC 键关闭预览
  useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagePreview(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview]);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('只支持上传图片文件');
      return;
    }
    setError(null);
    setLocalUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败，请重试';
      setError(msg);
    } finally {
      setLocalUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleUpload(file);
        }
        return;
      }
    }
  };

  if (initialImage) {
    return (
      <>
        <div className="relative">
          <div className="flex items-center justify-center p-4 bg-black/20 rounded-xl border border-white/10 min-h-[200px]">
            <img
              src={initialImage}
              className="max-w-full max-h-[300px] object-contain rounded-lg shadow-lg cursor-zoom-in"
              alt="角色参考图"
              onClick={() => setImagePreview({ url: initialImage, title: '角色参考图' })}
            />
          </div>
          {/* 右上角工具栏（与分镜模块一致） */}
          <div className="absolute top-2 right-2 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); downloadFile(initialImage); }}
              className="p-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80"
              title="下载图片"
            >
              <Download size={14} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-[11px] rounded-lg bg-black/70 text-white/90 border border-white/10 shadow disabled:opacity-60 hover:bg-black/80"
              disabled={busy}
            >
              {busy ? '上传中...' : '重新上传'}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded-lg bg-black/70 text-red-400 border border-white/10 shadow hover:bg-black/80 hover:text-red-300"
              title="移除图片"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*"
          />
        </div>
        {/* 图片预览弹窗（与分镜模块一致） */}
        {imagePreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setImagePreview(null)}
            />
            <div className="relative z-10 max-w-5xl w-full px-6">
              <div className="bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="text-sm font-semibold text-white">{imagePreview.title}</div>
                  <button
                    onClick={() => setImagePreview(null)}
                    className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="bg-black p-4 flex items-center justify-center">
                  <img
                    src={imagePreview.url}
                    alt={imagePreview.title}
                    className="max-h-[70vh] max-w-full object-contain rounded-lg border border-white/5"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={`relative bg-[#1a1a1a] border rounded-xl overflow-hidden transition-all ${
        isDragOver ? 'border-blue-500 bg-blue-900/10' : 'border-white/10'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        <div className="p-3 rounded-full bg-white/5 text-white/40">
          <ImageIcon size={24} />
        </div>
        <div className="text-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="text-sm font-medium text-white/60 hover:text-white transition-colors disabled:opacity-60"
          >
            {busy ? '上传中...' : '点击上传或拖拽图片到此处'}
          </button>
          <p className="text-[10px] text-white/30 mt-1">支持拖拽或 Ctrl+V 粘贴</p>
        </div>
      </div>

      {isDragOver && (
        <div className="absolute inset-0 bg-blue-900/30 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-blue-200">
            <Upload size={32} />
            <span className="text-sm font-bold">释放以上传图片</span>
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 pb-3">
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
      />
    </div>
  );
};

// 格式化时间 (秒 -> mm:ss)
const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// 音色音频组件（样式与 AudioEditor 保持一致）
const VoiceAudioSection: React.FC<{
  audioUrl?: string;
  onUpload: (file: File) => Promise<void>;
  isUploading?: boolean;
}> = ({ audioUrl, onUpload, isUploading = false }) => {
  const [localUploading, setLocalUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const busy = isUploading || localUploading;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // 当 audioUrl 变化时（切换角色），停止播放并重置状态
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [audioUrl]);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      setError('只支持上传音频文件');
      return;
    }
    setError(null);
    setLocalUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败，请重试';
      setError(msg);
    } finally {
      setLocalUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  // 点击进度条跳转
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  if (audioUrl) {
    return (
      <div className="bg-[#0b0b0b] border border-white/5 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {/* 圆形播放按钮 */}
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-blue-600/80 hover:bg-blue-500 text-white flex items-center justify-center transition-all shadow-lg flex-shrink-0"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
          </button>

          {/* 音频信息和进度条 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-white/70 text-sm">
              <span className="flex items-center gap-2">
                <Mic size={14} className="text-blue-400" />
                角色音色样本
              </span>
              {/* 时长显示 */}
              <span className="text-[11px] text-white/50 tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            {/* 可点击的进度条 */}
            <div
              className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden cursor-pointer"
              onClick={handleProgressClick}
            >
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-white/40">用于配音时参考角色音色特征</div>
          </div>

          {/* 下载和重新上传按钮 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => downloadFile(audioUrl)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white flex items-center justify-center transition-all border border-white/10"
              title="下载音频"
            >
              <Download size={16} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="px-3 py-1.5 text-[11px] rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/10 transition-all disabled:opacity-60"
            >
              {busy ? '上传中...' : '重新上传'}
            </button>
          </div>
        </div>

        {/* 隐藏的原生音频控件 */}
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
          className="hidden"
        />

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="audio/*"
        />
      </div>
    );
  }

  // 空状态：上传区域
  return (
    <div
      className={`bg-[#0b0b0b] border border-dashed rounded-xl p-6 flex flex-col items-center text-center gap-4 transition-all ${
        isDragOver ? 'border-blue-500/60 bg-blue-900/20' : 'border-white/10'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
      tabIndex={0}
    >
      <div className="p-4 rounded-full bg-blue-600/15 text-blue-400 shadow-inner">
        <Mic size={26} />
      </div>
      <div className="space-y-1">
        <p className="text-white font-semibold text-sm">上传角色音色样本</p>
        <p className="text-white/50 text-[12px]">为该角色配置参考音色，便于配音时保持一致</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-bold border border-blue-500/60 shadow-lg transition-all disabled:opacity-50"
        >
          {busy ? '上传中...' : '上传音频'}
        </button>
        <div className="text-[11px] text-white/50 bg-white/5 border border-white/10 rounded-full px-3 py-1">
          支持 mp3 / wav / aac
        </div>
      </div>

      {isDragOver && (
        <div className="absolute inset-0 bg-blue-900/30 backdrop-blur-sm flex items-center justify-center pointer-events-none rounded-xl">
          <div className="flex flex-col items-center gap-2 text-blue-200">
            <Upload size={32} />
            <span className="text-sm font-bold">释放以上传音频</span>
          </div>
        </div>
      )}

      {error && (
        <div className="w-full text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="audio/*"
      />
    </div>
  );
};

export const OutlineEditor: React.FC<OutlineEditorProps> = ({
  bookId,
  initialOutline = '',
  initialCharacters = [],
  onOutlineChange,
  onCharactersChange,
}) => {
  const [outline, setOutline] = useState(initialOutline);
  const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [activeCharacterId, setActiveCharacterId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 保存状态
  const [isSavingOutline, setIsSavingOutline] = useState(false);
  const [isOutlineDirty, setIsOutlineDirty] = useState(false);
  const [isSavingCharacter, setIsSavingCharacter] = useState(false);
  const [isCharacterDirty, setIsCharacterDirty] = useState(false);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [resolvedReferenceUrl, setResolvedReferenceUrl] = useState<string | undefined>(undefined);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [resolvedVoiceUrl, setResolvedVoiceUrl] = useState<string | undefined>(undefined);

  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ characterId: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 面板宽度
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [isResizingLeft, setIsResizingLeft] = useState(false);

  const MIN_LEFT = 220;
  const MAX_LEFT = 400;

  const savedOutlineRef = useRef(initialOutline);
  const savedCharactersRef = useRef<Record<number, string>>({});
  const referenceUrlCache = useRef<Record<string, string>>({});
  const voiceUrlCache = useRef<Record<string, string>>({});

  const activeCharacter = characters.find(c => c.id === activeCharacterId) || null;

  const getCharacterSignature = (char: Character) =>
    JSON.stringify({
      name: char.name,
      description: char.description,
      referenceImageUrl: char.referenceImageUrl,
      voiceAudioUrl: char.voiceAudioUrl,
      index: char.index,
    });

  // 加载数据
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [bookRes, charRes] = await Promise.all([
        bookApi.getById(bookId),
        characterApi.list(bookId),
      ]);

      setOutline(bookRes.outline || '');
      savedOutlineRef.current = bookRes.outline || '';

      const sortedChars = (charRes.data || []).sort((a, b) => a.index - b.index);
      setCharacters(sortedChars);
      sortedChars.forEach(c => {
        savedCharactersRef.current[c.id] = getCharacterSignature(c);
      });

      // 默认选中第一个角色
      if (sortedChars.length > 0) {
        setActiveCharacterId(sortedChars[0].id);
      }

      setIsOutlineDirty(false);
      setIsCharacterDirty(false);
      onOutlineChange?.(bookRes.outline || '');
      onCharactersChange?.(sortedChars);
    } catch (err) {
      console.error('Failed to load data', err);
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [bookId, onOutlineChange, onCharactersChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 解析参考图 URL
  const resolveReferenceImage = useCallback(async (raw?: string | null) => {
    if (!raw) {
      setResolvedReferenceUrl(undefined);
      return;
    }
    const ref = ensureHttpsUrl(typeof raw === 'string' ? raw : String(raw));
    if (ref.startsWith('data:') || ref.startsWith('blob:')) {
      setResolvedReferenceUrl(ref);
      return;
    }
    const { key, externalUrl } = normalizeFileKey(ref);
    const fallback = externalUrl && isValidMediaUrl(externalUrl) ? externalUrl : undefined;
    if (!key) {
      setResolvedReferenceUrl(fallback);
      return;
    }
    if (referenceUrlCache.current[key]) {
      setResolvedReferenceUrl(referenceUrlCache.current[key]);
      return;
    }
    try {
      const signed = await fileApi.getSignedUrl(key);
      const resolved = ensureHttpsUrl(signed.url);
      if (resolved && isValidMediaUrl(resolved)) {
        referenceUrlCache.current[key] = resolved;
        setResolvedReferenceUrl(resolved);
      } else {
        setResolvedReferenceUrl(fallback);
      }
    } catch (e) {
      console.error('Failed to resolve reference image', e);
      setResolvedReferenceUrl(fallback);
    }
  }, []);

  useEffect(() => {
    resolveReferenceImage(activeCharacter?.referenceImageUrl);
  }, [activeCharacter?.referenceImageUrl, resolveReferenceImage]);

  // 解析音色音频 URL
  const resolveVoiceAudio = useCallback(async (raw?: string | null) => {
    if (!raw) {
      setResolvedVoiceUrl(undefined);
      return;
    }
    const ref = ensureHttpsUrl(typeof raw === 'string' ? raw : String(raw));
    if (ref.startsWith('data:') || ref.startsWith('blob:')) {
      setResolvedVoiceUrl(ref);
      return;
    }
    const { key, externalUrl } = normalizeFileKey(ref);
    const fallback = externalUrl && isValidMediaUrl(externalUrl) ? externalUrl : undefined;
    if (!key) {
      setResolvedVoiceUrl(fallback);
      return;
    }
    if (voiceUrlCache.current[key]) {
      setResolvedVoiceUrl(voiceUrlCache.current[key]);
      return;
    }
    try {
      const signed = await fileApi.getSignedUrl(key);
      const resolved = ensureHttpsUrl(signed.url);
      if (resolved && isValidMediaUrl(resolved)) {
        voiceUrlCache.current[key] = resolved;
        setResolvedVoiceUrl(resolved);
      } else {
        setResolvedVoiceUrl(fallback);
      }
    } catch (e) {
      console.error('Failed to resolve voice audio', e);
      setResolvedVoiceUrl(fallback);
    }
  }, []);

  useEffect(() => {
    resolveVoiceAudio(activeCharacter?.voiceAudioUrl);
  }, [activeCharacter?.voiceAudioUrl, resolveVoiceAudio]);

  // 保存大纲
  const saveOutline = async () => {
    if (outline === savedOutlineRef.current) {
      setIsOutlineDirty(false);
      return;
    }
    setIsSavingOutline(true);
    try {
      await bookApi.updateOutline(bookId, outline);
      savedOutlineRef.current = outline;
      setIsOutlineDirty(false);
      setToast({ message: '大纲已保存', tone: 'success' });
      onOutlineChange?.(outline);
    } catch (err) {
      console.error('Failed to save outline', err);
      setToast({ message: '保存大纲失败', tone: 'error' });
    } finally {
      setIsSavingOutline(false);
    }
  };

  // 自动保存大纲
  useEffect(() => {
    if (!isOutlineDirty) return;
    const timer = setTimeout(() => {
      saveOutline();
    }, 3000);
    return () => clearTimeout(timer);
  }, [isOutlineDirty, outline]);

  // 保存角色
  const saveCharacter = async (char: Character) => {
    const currentSig = getCharacterSignature(char);
    if (savedCharactersRef.current[char.id] === currentSig) {
      setIsCharacterDirty(false);
      return;
    }
    setIsSavingCharacter(true);
    try {
      await characterApi.update(bookId, char.id, {
        name: char.name,
        description: char.description,
        referenceImageUrl: char.referenceImageUrl,
        voiceAudioUrl: char.voiceAudioUrl,
        index: char.index,
      });
      savedCharactersRef.current[char.id] = currentSig;
      setIsCharacterDirty(false);
      setToast({ message: '角色已保存', tone: 'success' });
    } catch (err) {
      console.error('Failed to save character', err);
      setToast({ message: '保存角色失败', tone: 'error' });
    } finally {
      setIsSavingCharacter(false);
    }
  };

  // 自动保存角色
  useEffect(() => {
    if (!isCharacterDirty || !activeCharacter) return;
    const timer = setTimeout(() => {
      saveCharacter(activeCharacter);
    }, 3000);
    return () => clearTimeout(timer);
  }, [isCharacterDirty, activeCharacter]);

  // 添加角色
  const handleAddCharacter = async () => {
    const maxIndex = characters.length > 0 ? Math.max(...characters.map(c => c.index)) : 0;
    try {
      const newChar = await characterApi.create(bookId, {
        name: '新角色',
        description: '',
        index: maxIndex + 1,
      });
      const updated = [...characters, newChar].sort((a, b) => a.index - b.index);
      setCharacters(updated);
      savedCharactersRef.current[newChar.id] = getCharacterSignature(newChar);
      setActiveCharacterId(newChar.id);
      onCharactersChange?.(updated);
    } catch (err) {
      console.error('Failed to create character', err);
      setToast({ message: '创建角色失败', tone: 'error' });
    }
  };

  // 删除角色
  const executeDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await characterApi.delete(bookId, confirmDelete.characterId);
      const updated = characters.filter(c => c.id !== confirmDelete.characterId);
      delete savedCharactersRef.current[confirmDelete.characterId];
      setCharacters(updated);
      if (activeCharacterId === confirmDelete.characterId) {
        setActiveCharacterId(null);
      }
      onCharactersChange?.(updated);
      setToast({ message: '角色已删除', tone: 'success' });
    } catch (err) {
      console.error('Failed to delete character', err);
      setToast({ message: '删除角色失败', tone: 'error' });
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  // 更新角色
  const updateActiveCharacter = (updater: (char: Character) => Character) => {
    if (!activeCharacter) return;
    const updated = updater(activeCharacter);
    const newList = characters.map(c => (c.id === updated.id ? updated : c));
    setCharacters(newList);
    const sig = getCharacterSignature(updated);
    setIsCharacterDirty(savedCharactersRef.current[updated.id] !== sig);
    onCharactersChange?.(newList);
  };

  // 上传参考图
  const handleUploadReference = async (file: File) => {
    setIsUploadingReference(true);
    try {
      const res = await fileApi.upload(file, 'private');
      const signed = await fileApi.getSignedUrl(res.key);
      referenceUrlCache.current[res.key] = signed.url;
      updateActiveCharacter(c => ({ ...c, referenceImageUrl: res.key }));
      setResolvedReferenceUrl(signed.url);
      setToast({ message: '参考图已上传', tone: 'success' });
    } catch (err) {
      console.error('Failed to upload reference', err);
      throw err;
    } finally {
      setIsUploadingReference(false);
    }
  };

  const handleRemoveReference = () => {
    updateActiveCharacter(c => ({ ...c, referenceImageUrl: undefined }));
    setResolvedReferenceUrl(undefined);
  };

  // 上传音色音频
  const handleUploadVoice = async (file: File) => {
    setIsUploadingVoice(true);
    try {
      const res = await fileApi.upload(file, 'private');
      const signed = await fileApi.getSignedUrl(res.key);
      voiceUrlCache.current[res.key] = signed.url;
      updateActiveCharacter(c => ({ ...c, voiceAudioUrl: res.key }));
      setResolvedVoiceUrl(signed.url);
      setToast({ message: '音色音频已上传', tone: 'success' });
    } catch (err) {
      console.error('Failed to upload voice audio', err);
      throw err;
    } finally {
      setIsUploadingVoice(false);
    }
  };

  // 选择角色
  const handleSelectCharacter = async (char: Character) => {
    // 保存当前角色
    if (activeCharacter && isCharacterDirty) {
      await saveCharacter(activeCharacter);
    }
    setActiveCharacterId(char.id);
    const sig = getCharacterSignature(char);
    setIsCharacterDirty(savedCharactersRef.current[char.id] !== sig);
  };

  // 拖拽面板
  useEffect(() => {
    if (!isResizingLeft) return;
    const handleMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_LEFT, Math.max(MIN_LEFT, e.clientX));
      setLeftPanelWidth(newWidth);
    };
    const handleUp = () => setIsResizingLeft(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizingLeft]);

  // Toast 自动隐藏
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="flex h-full bg-[#121212] relative">
      {/* 删除确认弹窗 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-[380px] shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-200">
                <Trash2 size={16} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/40 font-bold">删除角色</p>
                <h3 className="text-lg font-bold text-white mt-0.5">{confirmDelete.name}</h3>
              </div>
            </div>
            <p className="text-sm text-white/70 mb-6">该操作不可恢复，确认要删除吗？</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-colors"
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                onClick={executeDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-500 transition-colors disabled:opacity-60"
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
          <div
            className={`px-5 py-2 rounded-lg border text-sm shadow-xl ${
              toast.tone === 'success'
                ? 'bg-green-500/20 border-green-500/40 text-green-100'
                : toast.tone === 'error'
                ? 'bg-red-500/20 border-red-500/40 text-red-100'
                : 'bg-white/10 border-white/20 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm">加载中...</div>
        </div>
      )}

      {/* 错误状态 */}
      {loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="px-6 py-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200">
            加载失败：{loadError}
          </div>
        </div>
      )}

      {/* 左侧：角色列表 */}
      <div style={{ width: leftPanelWidth }} className="border-r border-white/5 flex flex-col bg-[#161616]">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-white/40" />
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">角色人设</span>
          </div>
          <button
            onClick={handleAddCharacter}
            className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
            title="添加角色"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-4">
          {characters.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-white/30">
              <Users size={32} />
              <p className="text-xs font-semibold">暂无角色</p>
              <button
                onClick={handleAddCharacter}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 transition-colors flex items-center gap-2"
              >
                <Plus size={14} /> 添加角色
              </button>
            </div>
          )}

          {characters.map((char, idx) => (
            <div
              key={char.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectCharacter(char)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectCharacter(char);
                }
              }}
              className={`mb-2 p-3 rounded-xl transition-all cursor-pointer ${
                activeCharacterId === char.id
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20'
                  : 'bg-black/30 border border-white/5 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <GripVertical size={12} className={activeCharacterId === char.id ? 'text-white/60' : 'text-white/20'} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${activeCharacterId === char.id ? 'text-white' : 'text-white/20'}`}>
                    #{idx + 1}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete({ characterId: char.id, name: char.name });
                  }}
                  className="p-1 rounded-md text-red-300 hover:text-red-100 hover:bg-red-500/20 transition-colors"
                  title="删除角色"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className={`text-sm font-semibold truncate ${activeCharacterId === char.id ? 'text-white' : 'text-white/60'}`}>
                {char.name || '未命名角色'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 拖拽分隔线 */}
      <div
        className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingLeft ? 'bg-white/20' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizingLeft(true);
        }}
      />

      {/* 中间：大纲和角色编辑区 */}
      <div className="flex-1 flex flex-col h-full bg-[#0f0f0f] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-10">
            {/* 大纲编辑区 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen size={16} className="text-blue-500" />
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">故事大纲</label>
                </div>
                <button
                  onClick={saveOutline}
                  disabled={isSavingOutline || !isOutlineDirty}
                  className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 transition-all disabled:opacity-60"
                >
                  <Save size={14} /> {isSavingOutline ? '保存中...' : '保存大纲'}
                </button>
              </div>
              <textarea
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-h-[200px] resize-none leading-relaxed transition-all placeholder:text-white/20 shadow-inner"
                value={outline}
                onChange={(e) => {
                  setOutline(e.target.value);
                  setIsOutlineDirty(e.target.value !== savedOutlineRef.current);
                }}
                placeholder="在这里撰写故事大纲，包括主要情节、世界观设定、故事背景等..."
              />
              {isOutlineDirty && (
                <p className="text-[10px] text-yellow-400/60">* 有未保存的更改（将在 3 秒后自动保存）</p>
              )}
            </div>

            {/* 分隔线 */}
            <div className="border-t border-white/5" />

            {/* 角色编辑区 */}
            {activeCharacter ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users size={16} className="text-green-500" />
                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">角色详情</label>
                  </div>
                  <button
                    onClick={() => saveCharacter(activeCharacter)}
                    disabled={isSavingCharacter || !isCharacterDirty}
                    className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-500 transition-all disabled:opacity-60"
                  >
                    <Save size={14} /> {isSavingCharacter ? '保存中...' : '保存角色'}
                  </button>
                </div>

                {/* 角色名字 */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">角色名字</label>
                  <input
                    type="text"
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white text-lg font-semibold focus:outline-none focus:border-blue-500/50 transition-all"
                    value={activeCharacter.name}
                    onChange={(e) => updateActiveCharacter(c => ({ ...c, name: e.target.value }))}
                    placeholder="输入角色名字..."
                  />
                </div>

                {/* 角色描述 */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">角色描述</label>
                  <textarea
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-blue-500/50 min-h-[150px] resize-none leading-relaxed transition-all"
                    value={activeCharacter.description}
                    onChange={(e) => updateActiveCharacter(c => ({ ...c, description: e.target.value }))}
                    placeholder="描述角色的性格、背景、外貌特征、行为习惯等..."
                  />
                </div>

                {/* 参考图 */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">角色参考图</label>
                  <ReferenceImageSection
                    initialImage={resolvedReferenceUrl || (isValidMediaUrl(activeCharacter.referenceImageUrl) ? activeCharacter.referenceImageUrl : undefined)}
                    onUpload={handleUploadReference}
                    onRemove={handleRemoveReference}
                    isUploading={isUploadingReference}
                  />
                </div>

                {/* 音色音频 */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">角色音色</label>
                  <VoiceAudioSection
                    audioUrl={resolvedVoiceUrl || (isValidMediaUrl(activeCharacter.voiceAudioUrl) ? activeCharacter.voiceAudioUrl : undefined)}
                    onUpload={handleUploadVoice}
                    isUploading={isUploadingVoice}
                  />
                </div>

                {isCharacterDirty && (
                  <p className="text-[10px] text-yellow-400/60">* 有未保存的更改（将在 3 秒后自动保存）</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-white/30">
                <Users size={48} className="mb-4" />
                <p className="text-sm font-bold uppercase tracking-widest">请选择或创建一个角色</p>
                <button
                  onClick={handleAddCharacter}
                  className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-colors flex items-center gap-2"
                >
                  <Plus size={16} /> 添加角色
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
