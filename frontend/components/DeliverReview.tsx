import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  FastForward,
  Rewind,
  MessageSquare,
  Send,
  AlertCircle,
  Upload,
  History,
  Loader2,
} from 'lucide-react';
import { Comment, Episode, ChapterVideo, ChapterVideoVersion, ReviewCommentMeta, VideoStatus } from '../types';
import { chapterApi, commentApi, ensureHttpsUrl, fileApi, videoApi, normalizeFileKey, isValidMediaUrl } from '../api';
import { CommentItem } from './CommentItem';
import { Toast, useToast } from './Toast';
import { ChapterTabBar } from './ChapterTabBar';

type ChapterVideoDetail = ChapterVideo & { versionCount?: number };

interface DeliverReviewProps {
  videoUrl?: string;
  episode?: Episode;
  episodes?: Episode[];
  bookId?: number;
}

export const DeliverReview: React.FC<DeliverReviewProps> = ({ videoUrl, episode, episodes, bookId }) => {
  const chapterList = useMemo(() => {
    if (episodes && episodes.length) return episodes;
    if (episode) return [episode];
    return [];
  }, [episode, episodes]);
  const hasChapters = chapterList.length > 0;
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  useEffect(() => {
    if (activeChapterIndex >= chapterList.length) {
      setActiveChapterIndex(Math.max(0, chapterList.length - 1));
    }
  }, [activeChapterIndex, chapterList.length]);
  const activeChapter = chapterList[activeChapterIndex];

  const [videoDetail, setVideoDetail] = useState<ChapterVideoDetail | null>(null);
  const [versions, setVersions] = useState<ChapterVideoVersion[]>([]);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | undefined>();
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string | undefined>();
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [uploadingOriginal, setUploadingOriginal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const [approving, setApproving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [originalProgress, setOriginalProgress] = useState<number | null>(null);
  const [originalDragOver, setOriginalDragOver] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const originalInputRef = useRef<HTMLInputElement>(null);
  const urlCache = useRef<Record<string, string>>({});

  const hasUploadedVideo = !!(videoDetail?.videoUrl || videoDetail?.previewUrl || resolvedVideoUrl || resolvedPreviewUrl);
  const [preferPreview, setPreferPreview] = useState(true);
  // 只使用已 resolve 的 URL 或有效的原始 URL，避免使用未 resolve 的文件 key
  const previewSource = resolvedPreviewUrl || (isValidMediaUrl(videoDetail?.previewUrl) ? videoDetail?.previewUrl : '') || '';
  const originalSource = resolvedVideoUrl || (isValidMediaUrl(videoDetail?.videoUrl) ? videoDetail?.videoUrl : '') || (isValidMediaUrl(videoUrl) ? videoUrl : '') || '';
  const playbackSource = hasUploadedVideo
    ? (preferPreview && previewSource ? previewSource : originalSource || previewSource)
    : '';

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const commentDraftRef = useRef('');
  // 章节评论数映射 (chapterId -> count)
  const [chapterCommentCounts, setChapterCommentCounts] = useState<Record<number, number>>({});

  const resolveFileUrl = useCallback(
    async (raw?: string | null) => {
      if (!raw) return '';
      const normalized = ensureHttpsUrl(raw);
      const { key, externalUrl } = normalizeFileKey(normalized);
      const fallback = externalUrl || normalized;
      if (!key) return fallback;
      const cacheKey = key || fallback;
      const cached = urlCache.current[cacheKey];
      if (cached) return cached;
      try {
        const res = await fileApi.getSignedUrl(key);
        const resolved = ensureHttpsUrl(res.url || fallback);
        urlCache.current[cacheKey] = resolved;
        return resolved;
      } catch (err) {
        console.error('Resolve video url failed', err);
        return fallback;
      }
    },
    []
  );

  const fetchVideoData = useCallback(
    async (chapterId: number) => {
      setLoadingVideo(true);
      setVersionMenuOpen(false);
      try {
        const info = await videoApi.getInfo(chapterId);
        setVideoDetail(info);
        const versionRes = await videoApi.listVersions(chapterId);
        setVersions(versionRes.data || []);

        const [resolvedVideo, resolvedPreview] = await Promise.all([
          resolveFileUrl(info.videoUrl),
          resolveFileUrl(info.previewUrl),
        ]);
        setResolvedVideoUrl(resolvedVideo || undefined);
        setResolvedPreviewUrl(resolvedPreview || undefined);
      } catch (err) {
        console.error('Failed to load chapter video', err);
        showToast('章节交付视频加载失败', 'error');
      } finally {
        setLoadingVideo(false);
        setLoadError(false);
        setIsPlaying(false);
        setCurrentTime(0);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
          videoRef.current.load();
        }
      }
    },
    [resolveFileUrl]
  );

  useEffect(() => {
    if (!activeChapter?.id) {
      setVideoDetail(null);
      setVersions([]);
      setResolvedPreviewUrl(undefined);
      setResolvedVideoUrl(undefined);
      setComments([]);
      setCommentError(null);
      setCommentDraft('');
      return;
    }
    fetchVideoData(activeChapter.id);
  }, [activeChapter?.id, fetchVideoData]);

  useEffect(() => {
    if (!activeChapter?.id) return;
    let cancelled = false;
    setLoadingComments(true);
    setCommentError(null);
    setCommentDraft('');
    (async () => {
      try {
        const res = await commentApi.listChapter(activeChapter.id);
        if (!cancelled) {
          setComments(res.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : '评论加载失败';
          setCommentError(msg);
          setComments([]);
        }
      } finally {
        if (!cancelled) setLoadingComments(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeChapter?.id]);

  // 获取章节评论数
  useEffect(() => {
    if (!bookId) return;
    commentApi.getChapterCommentCounts(bookId).then(res => {
      setChapterCommentCounts(res.data || {});
    }).catch(err => {
      console.error('Failed to fetch chapter comment counts', err);
    });
  }, [bookId]);

  useEffect(() => {
    setLoadError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.load();
    }
  }, [playbackSource]);

  const handleSeek = (time: number) => {
    const duration = videoRef.current?.duration;
    if (!videoRef.current || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(time)) return;
    const clamped = Math.min(Math.max(time, 0), duration);
    videoRef.current.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '0:00';
    const total = Math.max(0, Math.floor(seconds));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
      size /= 1024;
      idx++;
    }
    return `${size.toFixed(size >= 10 ? 0 : 1)}${units[idx]}`;
  };

  const parseReviewMeta = (meta?: string): ReviewCommentMeta | null => {
    if (!meta) return null;
    try {
      const parsed = JSON.parse(meta) as ReviewCommentMeta;
      if (parsed && (typeof parsed.seconds === 'number' || typeof parsed.timecode === 'string')) {
        return parsed;
      }
    } catch (err) {
      console.warn('Invalid review meta', err);
    }
    return null;
  };

  const parseTimecodeInput = (value: string) => {
    const parts = value.split(':').map(p => Number(p));
    if (parts.some(p => Number.isNaN(p))) return null;
    if (parts.length === 2) {
      const [m, s] = parts;
      if (m < 0 || s < 0 || s >= 60) return null;
      const seconds = m * 60 + s;
      return { seconds, timecode: formatTime(seconds) };
    }
    if (parts.length === 3) {
      const [h, m, s] = parts;
      if (h < 0 || m < 0 || s < 0 || m >= 60 || s >= 60) return null;
      const seconds = h * 3600 + m * 60 + s;
      return { seconds, timecode: formatTime(seconds) };
    }
    return null;
  };

  const extractCommentPayload = (raw: string) => {
    const trimmed = raw.trim();
    const match = trimmed.match(/@(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (match) {
      const parsed = parseTimecodeInput(match[1]);
      if (parsed) {
        const cleaned = trimmed.replace(match[0], '').trim();
        return {
          content: cleaned,
          meta: JSON.stringify({ timecode: parsed.timecode, seconds: parsed.seconds }),
        };
      }
    }
    return { content: trimmed, meta: undefined as string | undefined };
  };

  type ReviewCommentView = Comment & { timeSeconds?: number; timeLabel?: string };
  const reviewComments = useMemo<ReviewCommentView[]>(
    () =>
      comments.map(c => {
        const meta = parseReviewMeta(c.meta);
        const seconds = typeof meta?.seconds === 'number' ? meta.seconds : undefined;
        const timeLabel = meta?.timecode || (typeof seconds === 'number' ? formatTime(seconds) : undefined);
        return { ...c, timeSeconds: seconds, timeLabel };
      }),
    [comments]
  );

  const handleSubmitComment = async () => {
    if (!activeChapter?.id) return;
    const { content, meta } = extractCommentPayload(commentDraft);
    if (!content) {
      showToast('请输入评论内容', 'error');
      return;
    }
    setPostingComment(true);
    try {
      const created = await commentApi.createChapter(activeChapter.id, { content, meta });
      setComments(prev => [created, ...prev]);
      setCommentDraft('');
      commentDraftRef.current = '';
      // 更新评论数
      setChapterCommentCounts(prev => ({
        ...prev,
        [activeChapter.id]: (prev[activeChapter.id] || 0) + 1
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发表评论失败';
      showToast(msg, 'error');
    } finally {
      setPostingComment(false);
    }
  };

  const handleUpdateComment = async (commentId: number, content: string) => {
    try {
      const updated = await commentApi.update(commentId, { content });
      setComments(prev => prev.map(c => (c.id === commentId ? updated : c)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '更新评论失败';
      showToast(msg, 'error');
      throw err;
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await commentApi.delete(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除评论失败';
      showToast(msg, 'error');
      throw err;
    }
  };

  const handleCommentDraftChange = (value: string) => {
    const prev = commentDraftRef.current;
    const isForwardTyping = value.length > prev.length;
    const endsWithAt = value.endsWith('@');
    const alreadyHasTimecode = /@\d{1,2}:\d{2}(?::\d{2})?/.test(value);
    // 仅在用户新增 @ 且当前草稿末尾没有时间码时自动补全
    if (isForwardTyping && endsWithAt && !alreadyHasTimecode) {
      const auto = `${value}${formatTime(currentTime)} `;
      setCommentDraft(auto);
      commentDraftRef.current = auto;
      return;
    }
    setCommentDraft(value);
    commentDraftRef.current = value;
  };

  const probeVideoMeta = (file: File) =>
    new Promise<{ duration: number; width: number; height: number }>((resolve) => {
      const url = URL.createObjectURL(file);
      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      videoEl.onloadedmetadata = () => {
        resolve({
          duration: Math.round(videoEl.duration) || 0,
          width: videoEl.videoWidth || 0,
          height: videoEl.videoHeight || 0,
        });
        URL.revokeObjectURL(url);
      };
      videoEl.onerror = () => {
        resolve({ duration: 0, width: 0, height: 0 });
        URL.revokeObjectURL(url);
      };
      videoEl.src = url;
    });

  const handleUploadOriginal = async (file?: File | null) => {
    if (!file || !activeChapter?.id) return;
    setUploadingOriginal(true);
    setOriginalProgress(0);
    try {
      const meta = await probeVideoMeta(file);
      const uploaded = await fileApi.uploadWithProgress(file, 'private', (p) => setOriginalProgress(p));
      const key = uploaded.key || uploaded.url;
      const duration = meta.duration;
      const bitrate = duration ? Math.round((file.size * 8) / duration / 1000) : 0;
      const payload = {
        videoUrl: key,
        previewUrl: videoDetail?.previewUrl || '',
        duration,
        fileSize: file.size,
        width: meta.width,
        height: meta.height,
        format: file.type?.split('/')[1] || 'mp4',
        bitrate,
      };
      const version = await videoApi.upload(activeChapter.id, payload);
      const resolved = await resolveFileUrl(key);
      // 先立刻展示播放器（使用原始视频），预览版后台生成
      setVideoDetail((prev) => ({
        ...(prev || { id: version.chapterVideoId, chapterId: activeChapter.id, status: 'READY' as VideoStatus }),
        videoUrl: key,
        videoVersion: version.version,
        duration,
        fileSize: file.size,
        width: meta.width,
        height: meta.height,
        bitrate,
      }));
      setResolvedVideoUrl(resolved || key);
      showToast(`原始视频已上传 · 新版本 #${version.version}`, 'success');
      fetchVideoData(activeChapter.id);
    } catch (err) {
      console.error('Upload original video failed', err);
      showToast('上传原始视频失败，请重试', 'error');
    } finally {
      setUploadingOriginal(false);
      setOriginalProgress(null);
      if (originalInputRef.current) originalInputRef.current.value = '';
    }
  };

  const handleOriginalDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadingOriginal) {
      setOriginalDragOver(false);
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadOriginal(file);
    }
    setOriginalDragOver(false);
  };

  const handleRevert = async (version: number) => {
    if (!activeChapter?.id) return;
    setLoadingVideo(true);
    try {
      await videoApi.revert(activeChapter.id, version);
      showToast(`已切换到版本 #${version}`, 'success');
      await fetchVideoData(activeChapter.id);
    } catch (err) {
      console.error('Revert video failed', err);
      showToast('回滚失败，请重试', 'error');
    } finally {
      setLoadingVideo(false);
      setVersionMenuOpen(false);
    }
  };

  const handleDownloadOriginal = async () => {
    const raw = videoDetail?.videoUrl || resolvedVideoUrl || videoUrl;
    if (!raw) {
      showToast('暂无可下载的原始视频', 'error');
      return;
    }
    setDownloading(true);
    try {
      const resolved = await resolveFileUrl(raw);
      // 只使用已 resolve 的 URL 或有效的原始 URL
      const downloadUrl = resolved || (isValidMediaUrl(raw) ? raw : '');
      if (!downloadUrl) {
        showToast('无法解析视频地址', 'error');
        return;
      }
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = '';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download original failed', err);
      showToast('下载失败，请稍后重试', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleApprove = async () => {
    if (!bookId || !activeChapter?.id) {
      showToast('缺少书籍或章节信息，无法批准定稿', 'error');
      return;
    }
    if (activeChapter.status === 'COMPLETED') {
      showToast('该章节已定稿，无需重复操作', 'success');
      return;
    }
    setApproving(true);
    try {
      await videoApi.updateStatus(activeChapter.id, { status: 'READY' });
      await chapterApi.update(bookId, activeChapter.id, { status: 'COMPLETED' });
      showToast('章节已批准定稿', 'success');
      await fetchVideoData(activeChapter.id);
    } catch (err) {
      console.error('Approve final failed', err);
      showToast('批准失败，请重试', 'error');
    } finally {
      setApproving(false);
    }
  };

  if (!hasChapters) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm bg-[#0a0a0a]">
        暂无章节数据，请先在前序模块创建章节与场景
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <input
        ref={originalInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleUploadOriginal(e.target.files?.[0])}
      />
      <Toast toast={toast} onClose={hideToast} />
      {/* 顶部章节切换，与其他模块保持一致 */}
      <div className="border-b border-white/5 bg-[#141414]">
        <ChapterTabBar
          chapters={chapterList}
          activeChapterId={activeChapter?.id ?? null}
          onSelectChapter={(_, idx) => {
            setActiveChapterIndex(idx);
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          commentCounts={chapterCommentCounts}
        />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {!hasUploadedVideo ? (
          <div
            className="flex-1 flex items-center justify-center p-10 bg-gradient-to-br from-[#0f172a] via-[#0a0a0a] to-black"
            onDragOver={e => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setOriginalDragOver(true);
            }}
            onDragEnter={e => {
              e.preventDefault();
              setOriginalDragOver(true);
            }}
            onDragLeave={() => setOriginalDragOver(false)}
            onDrop={handleOriginalDrop}
          >
            <div
              className={`w-full max-w-3xl bg-[#0c0c0f] border rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.45)] overflow-hidden transition-colors ${
                originalDragOver ? 'border-blue-500/60 bg-blue-900/20' : 'border-white/10'
              }`}
            >
              <div className="px-8 py-6 border-b border-white/5 flex flex-col md:flex-row md:items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-600/20 text-blue-200 w-fit">
                  <Upload size={22} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-sm text-white/60 uppercase tracking-[0.3em]">章节交付</div>
                  <div className="text-xl font-semibold text-white">尚未上传交付视频</div>
                  <div className="text-sm text-white/50">
                    上传原始 MP4 后将自动生成预览版，支持断点续传与版本管理。
                  </div>
                </div>
                <button
                  onClick={() => originalInputRef.current?.click()}
                  disabled={uploadingOriginal}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm border border-blue-500/60 transition-all disabled:opacity-60"
                >
                  {uploadingOriginal
                    ? `上传中${originalProgress !== null ? ` ${originalProgress}%` : ''}`
                    : '拖拽或选择原始视频'}
                </button>
              </div>
              <div className="px-8 py-6 grid md:grid-cols-3 gap-4 text-sm text-white/70">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="text-white font-semibold mb-1">自动预览</div>
                  <div className="text-white/60 text-[13px] leading-relaxed">上传后后台自动生成 PreviewUrl，下一次进入即可直接预览压缩版。</div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="text-white font-semibold mb-1">边下边播</div>
                  <div className="text-white/60 text-[13px] leading-relaxed">支持 Range 播放，预览不卡顿；原始文件可随时下载交付。</div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="text-white font-semibold mb-1">版本追踪</div>
                  <div className="text-white/60 text-[13px] leading-relaxed">每次上传会生成新版本，可回滚、批准定稿，流程清晰。</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 视频播放器区域 */}
            <div
              className={`flex-1 flex flex-col h-full relative transition-colors ${
                originalDragOver ? 'outline outline-2 outline-blue-500/60 outline-offset-0' : ''
              }`}
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setOriginalDragOver(true);
              }}
              onDragEnter={e => {
                e.preventDefault();
                setOriginalDragOver(true);
              }}
              onDragLeave={() => setOriginalDragOver(false)}
              onDrop={handleOriginalDrop}
            >
              {loadingVideo && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                  <div className="flex items-center gap-2 px-4 py-2 bg-[#111] border border-white/10 rounded-lg text-white/80 text-sm">
                    <Loader2 className="animate-spin" size={16} />
                    正在同步章节交付视频...
                  </div>
                </div>
              )}

              <div className="px-6 py-3 border-b border-white/5 bg-[#0f0f0f] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-white/80 font-semibold">章节交付视频</span>
                      <div className="flex items-center gap-1 text-[11px] bg-white/5 border border-white/10 rounded-lg px-1">
                        <button
                          className={`px-2 py-1 rounded-md transition-all ${
                            preferPreview
                              ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.35)]'
                              : 'text-white/60 hover:text-white'
                          } ${!previewSource ? 'opacity-50 cursor-not-allowed' : ''}`}
                          onClick={() => previewSource && setPreferPreview(true)}
                          title={previewSource ? '使用预览版播放' : '预览版缺失，正在使用原始视频播放'}
                        >
                          预览版
                        </button>
                        <button
                          className={`px-2 py-1 rounded-md transition-all ${
                            !preferPreview
                              ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.35)]'
                              : 'text-white/60 hover:text-white'
                          }`}
                          onClick={() => setPreferPreview(false)}
                          title="使用原始视频播放"
                        >
                          原始版
                        </button>
                      </div>
                    </div>
                    <span className="px-2 py-1 text-[11px] rounded bg-white/5 border border-white/10 text-white/70">
                      版本 #{videoDetail?.videoVersion ?? '—'}
                    </span>
                    {uploadingOriginal && (
                      <span className="px-2 py-1 text-[11px] rounded border border-blue-500/50 bg-blue-500/10 text-blue-100">
                        上传中 {originalProgress ?? 0}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-white/50">
                    <span>原始：{formatBytes(videoDetail?.fileSize)}</span>
                    <span>预览：{formatBytes(videoDetail?.previewSize)}</span>
                    <span>时长：{videoDetail?.duration ? `${videoDetail.duration}s` : '—'}</span>
                    <span>版本数：{videoDetail?.versionCount ?? versions.length ?? 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => originalInputRef.current?.click()}
                    disabled={uploadingOriginal}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] rounded-lg border border-blue-500/60 transition-all disabled:opacity-60 flex items-center gap-1"
                  >
                    <Upload size={14} />
                    {uploadingOriginal
                      ? `上传中${originalProgress !== null ? ` ${originalProgress}%` : ''}`
                      : videoDetail?.videoUrl
                        ? '更新原始视频'
                        : '上传原始视频'}
                  </button>
                  <span className="text-[11px] text-white/40">
                    {originalDragOver ? '释放即可上传视频' : '可拖拽原始视频到此区域'}
                  </span>
                  <div className="relative">
                    <button
                      onClick={() => setVersionMenuOpen((prev) => !prev)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[11px] rounded-lg border border-white/10 transition-all flex items-center gap-1"
                    >
                      <History size={14} /> 历史版本
                    </button>
                    {versionMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setVersionMenuOpen(false)}
                        />
                        <div className="absolute right-0 mt-2 w-80 bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
                          <div className="px-3 py-2 border-b border-white/10 text-white/60 text-[11px]">
                            <span>共 {versions.length} 个版本</span>
                          </div>
                          <div className="max-h-80 overflow-y-auto divide-y divide-white/10">
                            {versions.length === 0 && (
                              <div className="p-3 text-center text-white/40 text-[12px]">暂无历史版本</div>
                            )}
                            {versions.map((v) => {
                              const time = v.createdAt ? new Date(v.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
                              const hasPreview = !!v.previewUrl;
                              const isCurrent = videoDetail?.videoVersion === v.version;
                              return (
                                <div
                                  key={v.id}
                                  className={`p-3 space-y-1 ${isCurrent ? 'bg-blue-600/10' : 'bg-transparent hover:bg-white/5'}`}
                                >
                                  <div className="flex items-center justify-between text-white/80">
                                    <div>
                                      <p className="text-sm font-semibold flex items-center gap-2">
                                        版本 #{v.version}
                                        {hasPreview && (
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-200 border border-green-500/30">
                                            含预览
                                          </span>
                                        )}
                                      </p>
                                      <div className="text-[11px] text-white/40">{time || '时间未知'}</div>
                                    </div>
                                    <div className="text-[10px] text-white/40">ID: {v.id}</div>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[11px] text-white/50 space-x-2">
                                      <span>原始 {formatBytes(v.fileSize)}</span>
                                      <span>预览 {formatBytes(v.previewSize)}</span>
                                    </div>
                                    <button
                                      onClick={() => handleRevert(v.version)}
                                      className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50"
                                    >
                                      设为当前
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 relative group flex items-center justify-center bg-black overflow-hidden">
                {loadError ? (
                  <div className="flex flex-col items-center gap-4 text-white/40">
                    <AlertCircle size={48} className="text-red-500/50" />
                    <div className="text-center">
                      <p className="text-sm font-medium">无法加载视频源</p>
                      <p className="text-[10px] text-white/20 mt-1">资源不可用或被拦截</p>
                    </div>
                    <button
                      onClick={() => {
                        setLoadError(false);
                        if (videoRef.current) videoRef.current.load();
                      }}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-colors"
                    >
                      重试加载
                    </button>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    className="max-h-full max-w-full"
                    src={playbackSource}
                    playsInline
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onError={() => setLoadError(true)}
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onClick={() => {
                      if (videoRef.current) {
                        isPlaying ? videoRef.current.pause() : videoRef.current.play();
                      }
                    }}
                  />
                )}

                {!loadError && !isPlaying && (
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
                    onClick={() => videoRef.current?.play()}
                  >
                    <div className="p-6 rounded-full bg-blue-600 text-white shadow-2xl shadow-blue-900/40">
                      <Play size={40} fill="currentColor" />
                    </div>
                  </div>
                )}
              </div>

              {/* 自定义播放控制 */}
              <div className="p-4 bg-[#1a1a1a] border-t border-white/5">
                <div
                  className="relative w-full h-1.5 bg-white/10 rounded-full mb-4 cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const clickedPos = rect.width ? x / rect.width : 0;
                    const duration = videoRef.current?.duration;
                    if (videoRef.current && Number.isFinite(duration) && duration > 0) {
                      handleSeek(clickedPos * duration);
                    }
                  }}
                >
                  <div
                    className="absolute h-full bg-blue-500 rounded-full"
                    style={{ width: `${videoRef.current?.duration ? (currentTime / videoRef.current.duration) * 100 : 0}%` }}
                  />
                  {/* 评论标记 */}
                  {reviewComments.map(
                    (c) =>
                      typeof c.timeSeconds === 'number' && (
                        <div
                          key={c.id}
                          className="absolute w-2 h-2 bg-yellow-400 rounded-full top-1/2 -translate-y-1/2 cursor-pointer border border-black shadow-sm z-10"
                          style={{
                            left: `${videoRef.current?.duration ? (c.timeSeconds / videoRef.current.duration) * 100 : 0}%`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSeek(c.timeSeconds);
                          }}
                          title={`在 ${formatTime(c.timeSeconds)} 的评论`}
                        />
                      )
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => handleSeek(Math.max(0, currentTime - 5))}
                      className="text-white/60 hover:text-white transition-colors"
                    >
                      <Rewind size={20} />
                    </button>
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          isPlaying ? videoRef.current.pause() : videoRef.current.play();
                        }
                      }}
                      className="p-2 rounded-full bg-white text-black hover:scale-105 transition-transform"
                    >
                      {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                    </button>
                    <button
                      onClick={() => handleSeek(Math.min(videoRef.current?.duration || 0, currentTime + 5))}
                      className="text-white/60 hover:text-white transition-colors"
                    >
                      <FastForward size={20} />
                    </button>
                    <span className="text-sm font-mono text-white/60">
                      {formatTime(currentTime)} / {formatTime(videoRef.current?.duration || 0)}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleDownloadOriginal}
                      disabled={downloading}
                      className="px-4 py-1.5 border border-white/10 rounded text-xs font-bold hover:bg-white/5 disabled:opacity-60"
                    >
                      {downloading ? '准备下载...' : '下载源文件'}
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={approving || activeChapter?.status === 'COMPLETED'}
                      className="px-4 py-1.5 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-500 disabled:opacity-60"
                    >
                      {activeChapter?.status === 'COMPLETED'
                        ? '已定稿'
                        : approving
                          ? '提交中...'
                          : '批准定稿'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 评论侧边栏 */}
            <div className="w-80 border-l border-white/5 flex flex-col bg-[#111111]">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-bold text-white/40 uppercase tracking-widest">时间轴反馈</span>
                <MessageSquare size={16} className="text-white/20" />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {commentError ? (
                  <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    评论加载失败：{commentError}
                  </div>
                ) : loadingComments ? (
                  <div className="h-full flex items-center justify-center text-white/40 text-sm">
                    评论加载中...
                  </div>
                ) : reviewComments.length ? (
                  reviewComments.map((c) => (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      onUpdate={handleUpdateComment}
                      onDelete={handleDeleteComment}
                      authorColorClass="text-white/60"
                      extraBadge={
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-200 font-mono border border-amber-400/40 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]">
                          @{c.timeLabel || '—'}
                        </span>
                      }
                      onClick={typeof c.timeSeconds === 'number' ? () => handleSeek(c.timeSeconds!) : undefined}
                    />
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-3 opacity-40 italic">
                    <MessageSquare size={32} />
                    <p className="text-xs">暂无时间轴反馈</p>
                  </div>
                )}
              </div>

              <div className="p-4 bg-[#161616] border-t border-white/5">
                <div className="flex items-center gap-2 bg-[#1e1e1e] border border-white/10 rounded-xl px-3 py-2">
                  <input
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                    placeholder={`新评论 @ ${formatTime(currentTime)}`}
                    value={commentDraft}
                    onChange={(e) => handleCommentDraftChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmitComment();
                      }
                    }}
                  />
                  <button
                    onClick={handleSubmitComment}
                    disabled={postingComment || !commentDraft.trim() || !activeChapter}
                    className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-60"
                  >
                    {postingComment ? '发送中...' : <Send size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
