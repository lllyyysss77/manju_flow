
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Episode, Scene, SceneAnimation, SceneAnimationVersion } from '../types';
import { fileApi, animationApi, storyboardApi, commentApi, getFileUrl, downloadFile } from '../api';
import {
  MessageSquare,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Info,
  Play,
  Film,
  MonitorPlay,
  Layout,
  Type,
  History,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Download
} from 'lucide-react';
import { useSceneComments } from './useSceneComments';
import { CommentItem } from './CommentItem';
import { CommentInput } from './CommentInput';
import { DEFAULT_SCENE_THUMB, STATUS_MAP } from '../constants';
import { Toast, useToast } from './Toast';
import { ChapterTabBar } from './ChapterTabBar';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { useImageOrientation } from './useImageOrientation';

interface AnimationEditorProps {
  bookId?: number;
  episode?: Episode;
  episodes?: Episode[];
  // 跨模块状态同步
  initialChapterId?: number | null;
  initialSceneId?: number | null;
  onActiveChapterChange?: (chapterId: number | null) => void;
  onActiveSceneChange?: (sceneId: number | null) => void;
}

export const AnimationEditor: React.FC<AnimationEditorProps> = ({
  bookId,
  episode,
  episodes,
  initialChapterId,
  initialSceneId,
  onActiveChapterChange,
  onActiveSceneChange,
}) => {
  const sourceChapters = useMemo(() => {
    if (episodes && episodes.length) return episodes;
    if (episode) return [episode];
    return [];
  }, [episode, episodes]);

  const normalizedChapters = useMemo<Episode[]>(() => {
    const normalizeScenes = (scenes: Scene[]) =>
      (scenes || []).map((scene, idx) => ({
        ...scene,
        comments: scene.comments || [],
        dialogue: scene.dialogue || '此处补充对白与情绪提示',
        description: scene.description || '此镜头暂无描述，请补充。',
        index: scene.index || idx + 1,
        cameraMovement: scene.cameraMovement || '平移',
        status: scene.status || 'IN_PROGRESS',
      }));

    return (sourceChapters || []).map(ch => ({
      ...ch,
      title: ch.title || `第 ${ch.index || 1} 章`,
      scenes: normalizeScenes(ch.scenes || []),
    }));
  }, [episode, sourceChapters]);

  const hasChapters = normalizedChapters.length > 0;

  // 使用 ref 存储回调，避免作为依赖
  const onActiveChapterChangeRef = useRef(onActiveChapterChange);
  const onActiveSceneChangeRef = useRef(onActiveSceneChange);
  useEffect(() => {
    onActiveChapterChangeRef.current = onActiveChapterChange;
    onActiveSceneChangeRef.current = onActiveSceneChange;
  }, [onActiveChapterChange, onActiveSceneChange]);

  // 计算初始章节ID
  const computeInitialChapterId = () => {
    if (initialChapterId != null) {
      const exists = normalizedChapters.some(ch => ch.id === initialChapterId);
      if (exists) return initialChapterId;
    }
    return normalizedChapters[0]?.id || null;
  };

  const [activeChapterId, setActiveChapterId] = useState<number | null>(() => computeInitialChapterId());
  const activeChapter = useMemo(
    () => normalizedChapters.find(c => c.id === activeChapterId) || normalizedChapters[0],
    [activeChapterId, normalizedChapters]
  );

  const sortedScenes = useMemo(
    () => (activeChapter ? [...(activeChapter.scenes || [])].sort((a, b) => a.index - b.index) : []),
    [activeChapter]
  );

  // 计算初始场景索引
  const [activeSceneIndex, setActiveSceneIndex] = useState(() => {
    if (initialSceneId != null && activeChapter) {
      const scenes = [...(activeChapter.scenes || [])].sort((a, b) => a.index - b.index);
      const idx = scenes.findIndex(s => s.id === initialSceneId);
      if (idx >= 0) return idx;
    }
    return 0;
  });

  // 使用 ref 存储当前场景列表，供回调使用
  const sortedScenesRef = useRef(sortedScenes);
  useEffect(() => {
    sortedScenesRef.current = sortedScenes;
  }, [sortedScenes]);

  // 同步章节变化到父组件
  useEffect(() => {
    onActiveChapterChangeRef.current?.(activeChapterId);
  }, [activeChapterId]);

  // 同步场景变化到父组件
  useEffect(() => {
    const scene = sortedScenesRef.current[activeSceneIndex];
    onActiveSceneChangeRef.current?.(scene?.id ?? null);
  }, [activeSceneIndex]);

  useEffect(() => {
    if (activeSceneIndex >= sortedScenes.length) {
      setActiveSceneIndex(Math.max(0, sortedScenes.length - 1));
    }
  }, [activeSceneIndex, sortedScenes.length]);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [animations, setAnimations] = useState<SceneAnimation[]>([]);
  const [selectedAnimationId, setSelectedAnimationId] = useState<number | null>(null);
  const [versionMap, setVersionMap] = useState<Record<number, SceneAnimationVersion[]>>({});
  const [loadingAnimation, setLoadingAnimation] = useState(false);
  const [animationError, setAnimationError] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoDragOver, setVideoDragOver] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const [framePreviewCache, setFramePreviewCache] = useState<Record<number, { start?: string; end?: string }>>({});
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [resolvingVersion, setResolvingVersion] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [previewSource, setPreviewSource] = useState<{ url?: string; version?: number } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creatingClip, setCreatingClip] = useState(false);
  const [newClipName, setNewClipName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SceneAnimation | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [rightPanelWidth, setRightPanelWidth] = useState(300);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  // 场景评论数映射 (sceneId -> count)
  const [sceneCommentCounts, setSceneCommentCounts] = useState<Record<number, number>>({});
  // 场景未解决评论数映射 (sceneId -> count)
  const [sceneUnresolvedCounts, setSceneUnresolvedCounts] = useState<Record<number, number>>({});
  const MIN_LEFT = 220;
  const MAX_LEFT = 420;
  const MIN_RIGHT = 260;
  const MAX_RIGHT = 520;
  
  const activeScene = sortedScenes[activeSceneIndex];
  const {
    comments: sceneCommentList,
    loading: loadingComments,
    posting: postingComment,
    error: commentError,
    addComment,
    updateComment,
    deleteComment,
    resolveComment,
    unresolveComment,
  } = useSceneComments(activeScene?.id, 'animation');
  const activeSceneComments = activeScene?.id ? sceneCommentList : [];
  const hasScene = sortedScenes.length > 0;

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
  }, [isResizingLeft, MAX_LEFT, MIN_LEFT]);

  useEffect(() => {
    if (!isResizingRight) return;
    const handleMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_RIGHT, Math.max(MIN_RIGHT, window.innerWidth - e.clientX));
      setRightPanelWidth(newWidth);
    };
    const handleUp = () => setIsResizingRight(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizingRight, MAX_RIGHT, MIN_RIGHT]);

  const resolveVersions = useCallback(
    async (animationId: number, versions: SceneAnimationVersion[]) => {
      setResolvingVersion(true);
      try {
        const resolved = versions.map(v => ({
          ...v,
          videoUrl: getFileUrl(v.videoUrl),
        }));
        setVersionMap(prev => ({ ...prev, [animationId]: resolved }));
        return resolved;
      } finally {
        setResolvingVersion(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!activeScene?.id) {
      setAnimations([]);
      setSelectedAnimationId(null);
      setVersionMap({});
      setPreviewSource(null);
      setAnimationError(null);
      setLoadingAnimation(false);
      setRenameDraft('');
      setCreatingClip(false);
      setNewClipName('');
      return;
    }
    setVersionMap({});
    setSelectedAnimationId(null);
    setPreviewSource(null);
    setVersionMenuOpen(false);
    setDeleteTarget(null);
    setRenameDraft('');
    setCreatingClip(false);
    setNewClipName('');
    let cancelled = false;
    const load = async () => {
      setLoadingAnimation(true);
      setAnimationError(null);
      try {
        const res = await animationApi.list(activeScene.id);
        if (cancelled) return;
        const list = (res.data || []).sort((a, b) => a.index - b.index);
        setAnimations(list);
        const firstId = list[0]?.id ?? null;
        setSelectedAnimationId(firstId);
        setRenameDraft(firstId ? list[0]?.name || '' : '');
        setVersionMenuOpen(false);
        setPreviewSource(null);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load animation info', err);
        setAnimationError(err instanceof Error ? err.message : '加载动画信息失败');
      } finally {
        if (!cancelled) setLoadingAnimation(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id]);

  useEffect(() => {
    if (!activeScene?.id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await storyboardApi.list(activeScene.id);
        if (cancelled) return;
        const firstSet = (res.data || []).sort((a, b) => a.index - b.index)[0];
        if (!firstSet) {
          setFramePreviewCache(prev => ({ ...prev, [activeScene.id]: { start: undefined, end: undefined } }));
          return;
        }
        const start = firstSet.startFrameUrl ? getFileUrl(firstSet.startFrameUrl) : '';
        const end = firstSet.endFrameUrl ? getFileUrl(firstSet.endFrameUrl) : '';
        if (!cancelled) {
          setFramePreviewCache(prev => ({
            ...prev,
            [activeScene.id]: { start: start || undefined, end: end || undefined },
          }));
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load storyboard preview', err);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id]);

  // 获取场景评论数
  useEffect(() => {
    if (!bookId) return;
    commentApi.getSceneCommentCounts(bookId, 'animation').then(res => {
      setSceneCommentCounts(res.data || {});
      setSceneUnresolvedCounts(res.unresolvedCounts || {});
    }).catch(err => {
      console.error('Failed to fetch comment counts', err);
    });
  }, [bookId]);

  useEffect(() => {
    if (!activeScene?.id) {
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
        previewVideoRef.current.currentTime = 0;
      }
      setPreviewSource(null);
      return;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      previewVideoRef.current.currentTime = 0;
    }
    setPreviewSource(null);
  }, [activeScene?.id]);

  useEffect(() => {
    if (!activeScene?.id || !selectedAnimationId) {
      setVersionMenuOpen(false);
      return;
    }
    // 确保 selectedAnimationId 属于当前场景的 animations 列表
    // 避免场景切换时使用旧场景的 animation ID 调用新场景的 API
    // 额外检查 animation.sceneId 确保列表确实属于当前场景（防止状态异步更新问题）
    const selectedAnim = animations.find(a => a.id === selectedAnimationId);
    if (!selectedAnim || selectedAnim.sceneId !== activeScene.id) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setAnimationError(null);
      try {
        const versionsRes = await animationApi.listVersions(activeScene.id, selectedAnimationId);
        if (cancelled) return;
        await resolveVersions(selectedAnimationId, versionsRes.data || []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load animation versions', err);
        setAnimationError(err instanceof Error ? err.message : '加载动画信息失败');
        showToast('动画数据加载失败', 'error');
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id, selectedAnimationId, animations, resolveVersions]);

  useEffect(() => {
    const current = animations.find(a => a.id === selectedAnimationId);
    setRenameDraft(current?.name || '');
  }, [selectedAnimationId, animations]);

  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      previewVideoRef.current.currentTime = 0;
    }
    setPreviewSource(null);
  }, [selectedAnimationId]);

  useEffect(() => {
    if (!selectedAnimationId && versionMenuOpen) {
      setVersionMenuOpen(false);
    }
  }, [selectedAnimationId, versionMenuOpen]);

  const selectedAnimation = animations.find(a => a.id === selectedAnimationId) || null;
  const currentVersions = selectedAnimation ? versionMap[selectedAnimation.id] || [] : [];
  const normalizedVersionNumber =
    selectedAnimation?.animationVersion && selectedAnimation.animationVersion > 0
      ? selectedAnimation.animationVersion
      : currentVersions[0]?.version;
  const currentVersionData =
    (normalizedVersionNumber
      ? currentVersions.find(v => v.version === normalizedVersionNumber)
      : undefined) || currentVersions[0];
  const displayClipUrl = currentVersionData?.videoUrl || selectedAnimation?.animationUrl;
  const currentVersionLabel = normalizedVersionNumber ?? '—';
  const startFrameResolved = activeScene?.id ? framePreviewCache[activeScene.id]?.start : undefined;
  const endFrameResolved = activeScene?.id ? framePreviewCache[activeScene.id]?.end : undefined;
  const startFrameIsPortrait = useImageOrientation(startFrameResolved);
  const endFrameIsPortrait = useImageOrientation(endFrameResolved);
  const playbackUrl = displayClipUrl ? getFileUrl(displayClipUrl) || undefined : undefined;
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.load();
    setIsPlaying(false);
  }, [playbackUrl]);

  const handleUploadVideo = async (file?: File | null) => {
    if (!file || !activeScene?.id || !selectedAnimationId) return;
    setUploadingVideo(true);
    setAnimationError(null);
    try {
      const uploaded = await fileApi.upload(file, 'private');
      const rawUrl = uploaded.key || uploaded.url;
      const version = await animationApi.upload(activeScene.id, selectedAnimationId, rawUrl || '');
      setAnimations(prev =>
        prev.map(a =>
          a.id === selectedAnimationId
            ? { ...a, animationUrl: version.videoUrl, animationVersion: version.version }
            : a
        )
      );
      const versionsRes = await animationApi.listVersions(activeScene.id, selectedAnimationId);
      await resolveVersions(selectedAnimationId, versionsRes.data || []);
      showToast('新动画版本已上传', 'success');
      setPreviewSource(null);
    } catch (err) {
      console.error('Upload animation failed', err);
      setAnimationError(err instanceof Error ? err.message : '上传失败，请重试');
      showToast('上传失败，请重试', 'error');
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleVideoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadingVideo) {
      setVideoDragOver(false);
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadVideo(file);
    }
    setVideoDragOver(false);
  };

  const handlePreviewVersion = async (version: number) => {
    if (!selectedAnimationId) return;
    const versionData = currentVersions.find(v => v.version === version);
    if (!versionData?.videoUrl) {
      showToast('该版本缺少视频链接，无法预览', 'error');
      return;
    }
    const videoUrl = getFileUrl(versionData.videoUrl);
    if (!videoUrl) {
      showToast('无法解析视频链接', 'error');
      return;
    }
    setPreviewSource({ url: videoUrl, version: versionData.version });
    setVersionMenuOpen(false);
  };

  const handleRevertVersion = async (version: number) => {
    if (!activeScene?.id || !selectedAnimationId) return;
    setLoadingAnimation(true);
    setAnimationError(null);
    try {
      const animation = await animationApi.revert(activeScene.id, selectedAnimationId, version);
      setAnimations(prev =>
        prev.map(a => (a.id === selectedAnimationId ? { ...a, ...animation } : a))
      );
      const versionsRes = await animationApi.listVersions(activeScene.id, selectedAnimationId);
      await resolveVersions(selectedAnimationId, versionsRes.data || []);
      showToast(`已回滚到版本 #${version}`, 'success');
      setPreviewSource(null);
    } catch (err) {
      console.error('Revert animation failed', err);
      setAnimationError(err instanceof Error ? err.message : '回滚失败，请重试');
      showToast('回滚失败，请重试', 'error');
    } finally {
      setLoadingAnimation(false);
      setIsPlaying(false);
    }
  };

  const handleCreateClip = async () => {
    if (!activeScene?.id) return;
    const name = (newClipName || '').trim() || `动画 ${animations.length + 1}`;
    const nextIndex = animations.length ? Math.max(...animations.map(a => a.index)) + 1 : 1;
    setLoadingAnimation(true);
    setAnimationError(null);
    try {
      const created = await animationApi.create(activeScene.id, { name, index: nextIndex });
      const nextList = [...animations, created].sort((a, b) => a.index - b.index);
      setAnimations(nextList);
      setSelectedAnimationId(created.id);
      setRenameDraft(created.name);
      setNewClipName('');
      setCreatingClip(false);
      setVersionMenuOpen(false);
      setPreviewSource(null);
      showToast('已创建动画片段，上传版本以开始', 'success');
    } catch (err) {
      console.error('Create animation failed', err);
      setAnimationError(err instanceof Error ? err.message : '创建动画片段失败');
      showToast('创建动画片段失败，请重试', 'error');
    } finally {
      setLoadingAnimation(false);
    }
  };

  const handleRenameClip = async () => {
    if (!activeScene?.id || !selectedAnimationId) return;
    const name = renameDraft.trim();
    if (!name) {
      showToast('请输入动画名称', 'error');
      return;
    }
    try {
      const updated = await animationApi.update(activeScene.id, selectedAnimationId, { name });
      setAnimations(prev => prev.map(a => (a.id === selectedAnimationId ? { ...a, ...updated } : a)));
      showToast('名称已更新', 'success');
    } catch (err) {
      console.error('Rename animation failed', err);
      showToast('更新失败，请重试', 'error');
    }
  };

  const handleDeleteClip = async (animationId: number) => {
    if (!activeScene?.id) return;
    setLoadingAnimation(true);
    setAnimationError(null);
    try {
      await animationApi.delete(activeScene.id, animationId);
      const nextList = animations.filter(a => a.id !== animationId);
      setAnimations(nextList);
      setVersionMap(prev => {
        const copy = { ...prev };
        delete copy[animationId];
        return copy;
      });
      const nextId = selectedAnimationId === animationId ? nextList[0]?.id ?? null : selectedAnimationId;
      setSelectedAnimationId(nextId);
      setRenameDraft(nextList.find(a => a.id === nextId)?.name || '');
      setVersionMenuOpen(false);
      setPreviewSource(null);
      setDeleteTarget(null);
      showToast('动画片段已删除', 'success');
    } catch (err) {
      console.error('Delete animation failed', err);
      setAnimationError(err instanceof Error ? err.message : '删除动画失败');
      showToast('删除动画失败，请重试', 'error');
    } finally {
      setLoadingAnimation(false);
      setIsPlaying(false);
    }
  };

  const handleSubmitComment = async (content: string, meta?: string) => {
    if (!activeScene?.id) return;
    try {
      await addComment(content, meta);
      // 更新评论数（新评论默认是未解决状态）
      setSceneCommentCounts(prev => ({
        ...prev,
        [activeScene.id]: (prev[activeScene.id] || 0) + 1
      }));
      setSceneUnresolvedCounts(prev => ({
        ...prev,
        [activeScene.id]: (prev[activeScene.id] || 0) + 1
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发表评论失败';
      showToast(msg, 'error');
    }
  };

  const togglePlay = () => {
    if (!videoRef.current || !playbackUrl) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(err => {
        console.error('Video play failed', err);
        showToast('无法播放该视频，请检查链接', 'error');
      });
    }
    setIsPlaying(prev => !prev);
  };

  const closePreview = () => {
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      previewVideoRef.current.currentTime = 0;
    }
    setPreviewSource(null);
  };

  if (!hasChapters) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm bg-[#0f0f0f]">
        暂无章节数据，请先在剧本阶段创建章节与场景
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] relative">
      {previewSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closePreview} />
          <div className="relative w-full max-w-4xl bg-[#0b0b0b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 text-white">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MonitorPlay size={16} className="text-blue-400" />
                <span>版本 #{previewSource.version ?? '—'} 预览</span>
              </div>
              <button
                onClick={closePreview}
                className="text-white/60 hover:text-white rounded-full p-1 hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video bg-black">
              {previewSource.url ? (
                <video
                  ref={previewVideoRef}
                  src={previewSource.url}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">无预览链接</div>
              )}
            </div>
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={hideToast} />
      {/* 顶部：章节选择 + 场景切换（与分镜风格保持一致） */}
      <div className="border-b border-white/5 bg-[#141414]">
        <ChapterTabBar
          chapters={normalizedChapters}
          activeChapterId={activeChapterId}
          onSelectChapter={(chapterId) => {
            setActiveChapterId(chapterId);
            setActiveSceneIndex(0);
            setIsPlaying(false);
          }}
        />
        <div className="h-20 border-t border-white/10 bg-[#161616] flex items-center px-4 gap-2 overflow-x-auto">
          {sortedScenes.length === 0 ? (
            <div className="text-white/30 text-xs px-2">该章节暂无场景</div>
          ) : (
            sortedScenes.map((scene, idx) => {
              const displayNumber = idx + 1;
              const sceneClip = scene.id === activeScene?.id ? displayClipUrl : undefined;
              const thumb = getFileUrl(scene.thumbnailUrl) || DEFAULT_SCENE_THUMB;
              return (
              <button
                key={scene.id}
                onClick={() => {
                  setActiveSceneIndex(idx);
                  setIsPlaying(false);
                }}
                className={`flex-shrink-0 w-32 h-14 rounded border transition-all relative overflow-hidden group ${
                  activeSceneIndex === idx 
                    ? 'border-blue-500 ring-1 ring-blue-500' 
                    : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'
                }`}
                >
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center relative">
                  {thumb ? (
                    <img src={thumb} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Film size={16} className="text-white/10" />
                  )}
                  {sceneClip && (
                    <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                      <Play size={12} fill="currentColor" className="text-white" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] py-0.5 px-1 text-white/70 font-mono flex items-center justify-between">
                  <span>#{displayNumber}</span>
                  {sceneCommentCounts[scene.id] > 0 && (
                    <span
                      className={`flex items-center gap-0.5 ${sceneUnresolvedCounts[scene.id] > 0 ? 'text-red-400' : 'text-yellow-300/90'}`}
                      title={`${sceneCommentCounts[scene.id]} 条评论${sceneUnresolvedCounts[scene.id] > 0 ? `（${sceneUnresolvedCounts[scene.id]} 条未解决）` : '（全部已解决）'}`}
                    >
                      <MessageSquare size={8} />
                      <span>{sceneCommentCounts[scene.id]}</span>
                    </span>
                  )}
                </div>
              </button>
            );
            })
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {hasScene && animationError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
            <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-100 text-sm shadow-xl">
              动画数据加载失败：{animationError}
            </div>
          </div>
        )}
        {hasScene && (loadingAnimation || resolvingVersion) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-2 bg-black/60 border border-white/10 rounded-lg text-white/70 text-sm backdrop-blur-sm">
              {loadingAnimation ? '正在同步动画数据...' : '正在解析历史版本...'}
            </div>
          </div>
        )}
        {!hasScene ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
            该章节暂无场景，先去剧本阶段创建场景后再上传动画
          </div>
        ) : (
          <>
        <DeleteConfirmDialog
          isOpen={!!deleteTarget}
          title="删除动画片段"
          message="片段「{name}」的所有版本将被清空，确认继续？"
          itemName={deleteTarget?.name || '未命名'}
          onConfirm={() => deleteTarget && handleDeleteClip(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
        {/* 左侧：剧本参考区（与分镜风格统一） */}
        <div
          style={{ width: leftPanelWidth }}
          className="border-r border-white/5 bg-[#121212] overflow-y-auto p-6 flex flex-col gap-8 min-w-[220px] max-w-[420px]"
        >
          <section>
            <div className="flex items-center gap-2 mb-4 text-blue-400">
              <Info size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">画面需求</h3>
            </div>
            <div className="bg-white/5 rounded-lg p-4 border border-white/5">
              <p className="text-sm text-white/90 leading-relaxed italic">
                "{activeScene?.description || '暂无描述'}"
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-orange-400">
              <Layout size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">镜头/运镜</h3>
            </div>
            <p className="text-sm text-white/60 font-medium px-1">
              {activeScene?.cameraMovement || '未指定镜头类型'}
            </p>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-green-400">
              <Layout size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">分镜参考</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-white/40 font-semibold mb-1">首帧 (Keyframe A)</div>
                <div className={`${startFrameIsPortrait ? 'aspect-[9/16]' : 'aspect-video'} rounded-lg overflow-hidden border border-white/10 bg-black`}>
                  {startFrameResolved ? (
                    <img src={startFrameResolved} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-white/10">未上传</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/40 font-semibold mb-1">尾帧 (Keyframe B)</div>
                <div className={`${endFrameIsPortrait ? 'aspect-[9/16]' : 'aspect-video'} rounded-lg overflow-hidden border border-white/10 bg-black`}>
                  {endFrameResolved ? (
                    <img src={endFrameResolved} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-white/10">未上传</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-purple-400">
              <Type size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">台词/旁白</h3>
            </div>
            <div className="bg-blue-600/5 border-l-2 border-blue-500 p-3">
              <p className="text-sm text-white/80 leading-snug">
                {activeScene?.dialogue || <span className="text-white/20 italic">（无台词）</span>}
              </p>
            </div>
          </section>
        </div>

        <div
          className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingLeft ? 'bg-white/20' : ''}`}
          onMouseDown={e => {
            e.preventDefault();
            setIsResizingLeft(true);
          }}
        />

        {/* 中间：动画制作/预览区 */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a]">
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  场景 {activeSceneIndex + 1} 动画制作
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    activeScene?.status === 'COMPLETED' ? 'bg-green-600 text-white' : 'bg-orange-600/20 text-orange-400 border border-orange-600/30'
                  }`}>
                    {activeScene ? STATUS_MAP[activeScene.status] : '—'}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button 
                    disabled={activeSceneIndex === 0}
                    onClick={() => setActiveSceneIndex(prev => Math.max(0, prev - 1))}
                    className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white disabled:opacity-10 transition-all"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    disabled={activeSceneIndex === sortedScenes.length - 1}
                    onClick={() => setActiveSceneIndex(prev => Math.min(sortedScenes.length - 1, prev + 1))}
                    className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white disabled:opacity-10 transition-all"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              <div
                className={`bg-[#111111] rounded-2xl border p-5 space-y-5 shadow-xl transition-colors ${
                  videoDragOver ? 'border-blue-500/60 bg-blue-900/20' : 'border-white/5'
                }`}
                onDragOver={e => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setVideoDragOver(true);
                }}
                onDragEnter={e => {
                  e.preventDefault();
                  setVideoDragOver(true);
                }}
                onDragLeave={() => setVideoDragOver(false)}
                onDrop={handleVideoDrop}
              >
                <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-600/20 text-purple-300">
                      <Film size={18} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white">动画片段</span>
                      <p className="text-[11px] text-white/40">为场景拆分多段动画，独立留存版本</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative flex-wrap">
                    <button
                      onClick={() => {
                        setCreatingClip(true);
                        setNewClipName('');
                      }}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[11px] rounded-lg border border-white/10 flex items-center gap-1 transition-all"
                    >
                      <Plus size={12} /> 新建片段
                    </button>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={e => handleUploadVideo(e.target.files?.[0])}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {animations.map(anim => {
                    const isActive = anim.id === selectedAnimationId;
                    return (
                      <button
                        key={anim.id}
                        onClick={() => {
                          setSelectedAnimationId(anim.id);
                          setVersionMenuOpen(false);
                          setIsPlaying(false);
                        }}
                        className={`px-3 py-1 rounded-lg border text-sm flex items-center gap-2 transition-all ${
                          isActive
                            ? 'bg-blue-600/20 border-blue-500/60 text-white shadow-[0_0_12px_rgba(59,130,246,0.35)]'
                            : 'bg-white/5 border-white/10 text-white/70 hover:border-white/30 hover:text-white'
                        }`}
                      >
                    <span>{anim.name || `动画 #${Math.round(anim.index)}`}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 border border-white/10">
                      #{anim.animationVersion ?? '—'}
                    </span>
                  </button>
                );
              })}
            </div>

                {creatingClip && (
                  <div className="flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3">
                    <input
                      value={newClipName}
                      onChange={e => setNewClipName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateClip();
                        }
                      }}
                      placeholder="片段名称 / Shot A / 镜头1"
                      className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleCreateClip}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg border border-blue-500/60"
                    >
                      创建
                    </button>
                    <button
                      onClick={() => {
                        setCreatingClip(false);
                        setNewClipName('');
                      }}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-xs rounded-lg border border-white/10"
                    >
                      取消
                    </button>
                  </div>
                )}

                {selectedAnimation ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={renameDraft}
                          onChange={e => setRenameDraft(e.target.value)}
                          onBlur={handleRenameClip}
                          className="min-w-[180px] bg-[#0c0c0c] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="填写片段名称"
                        />
                        <button
                          onClick={handleRenameClip}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1"
                        >
                          <Pencil size={12} /> 保存名称
                        </button>
                        <span className="text-[11px] text-white/30">当前版本 #{currentVersionLabel}</span>
                      </div>
                      <div className="flex items-center gap-2 relative">
                        <div className="relative">
                          <button
                            disabled={!currentVersions.length}
                            onClick={() => setVersionMenuOpen(prev => !prev)}
                            className={`flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg border transition-all ${
                              currentVersions.length
                                ? 'bg-white/5 hover:bg-white/10 text-white/70 border-white/10'
                                : 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
                            }`}
                          >
                            <History size={12} /> 历史版本
                          </button>
                          {versionMenuOpen && currentVersions.length > 0 && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setVersionMenuOpen(false)}
                              />
                              <div className="absolute right-0 mt-2 w-72 bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
                                <div className="px-3 py-2 border-b border-white/10 text-white/60 text-[11px]">
                                  <span>共 {currentVersions.length} 个版本</span>
                                </div>
                                <div className="max-h-80 overflow-y-auto divide-y divide-white/10">
                                  {currentVersions.map(version => {
                                    const time = version.createdAt ? new Date(version.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
                                    const isActive = selectedAnimation?.animationVersion === version.version;
                                    const isPreviewing = previewSource?.version === version.version;
                                    return (
                                      <div
                                        key={version.id}
                                        className={`p-3 space-y-1 ${isActive ? 'bg-blue-600/10' : 'bg-transparent hover:bg-white/5'}`}
                                      >
                                        <div className="flex items-center justify-between text-white/80">
                                          <div>
                                            <p className="text-sm font-semibold">版本 #{version.version}</p>
                                            <div className="text-[11px] text-white/40">{time || '时间未知'}</div>
                                          </div>
                                          <div className="text-[10px] text-white/40">ID: {version.id}</div>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                          <button
                                            onClick={() => {
                                              handlePreviewVersion(version.version);
                                            }}
                                            className={`text-[11px] px-2 py-1 rounded-lg border flex items-center gap-1 transition-all ${
                                              isPreviewing
                                                ? 'bg-blue-600/20 border-blue-500/50 text-white'
                                                : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/80'
                                            }`}
                                          >
                                            <MonitorPlay size={12} />
                                            {isPreviewing ? '预览中' : '预览'}
                                          </button>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => handleRevertVersion(version.version)}
                                              className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50"
                                              disabled={loadingAnimation}
                                            >
                                              设为当前
                                            </button>
                                            <div className="relative group">
                                              <Info size={14} className="text-white/30" />
                                              <div className="absolute right-0 top-6 w-48 p-2 rounded-md bg-black/80 border border-white/10 text-[11px] text-white/70 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                                将预览中的版本设为交付版本（默认最新）
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {!currentVersions.length && (
                                    <div className="p-3 text-center text-white/40 text-[12px]">暂无历史版本</div>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => setDeleteTarget(selectedAnimation)}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg bg-white/5 border border-white/10 text-red-300 hover:text-white hover:border-red-500/40 hover:bg-red-500/20 flex items-center gap-1"
                        >
                          <Trash2 size={12} /> 删除片段
                        </button>
                      </div>
                    </div>

                    <div className="aspect-video w-full rounded-2xl border-2 border-dashed border-white/5 bg-zinc-900 overflow-hidden relative group shadow-lg">
                      {displayClipUrl ? (
                        <>
                          <video
                            ref={videoRef}
                            src={playbackUrl}
                            className="w-full h-full object-contain"
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onClick={togglePlay}
                          />
                          {/* 右上角工具栏 */}
                          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {playbackUrl && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); downloadFile(playbackUrl); }}
                                className="p-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80"
                                title="下载视频"
                              >
                                <Download size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                videoInputRef.current?.click();
                              }}
                              disabled={uploadingVideo}
                              className="px-3 py-1.5 text-[11px] rounded-lg bg-black/70 text-white/90 border border-white/10 shadow disabled:opacity-60 hover:bg-black/80"
                            >
                              {uploadingVideo ? '上传中...' : '重新上传'}
                            </button>
                          </div>
                          {!isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer" onClick={togglePlay}>
                              <div className="p-5 rounded-full bg-blue-600 text-white shadow-xl scale-100 group-hover:scale-110 transition-transform">
                                <Play fill="currentColor" size={32} />
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div
                          className="w-full h-full flex flex-col items-center justify-center gap-4 group-hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => videoInputRef.current?.click()}
                        >
                          <div className="p-6 rounded-full bg-white/5 text-white/20 group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <MonitorPlay size={48} />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-white/40 mb-1">拖拽或点击上传动画片段</p>
                            <p className="text-[10px] text-white/20 uppercase tracking-widest">上传后全组成员均可即时查看</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="border border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center text-center gap-4 text-white/60">
                    <div className="p-4 rounded-full bg-white/5 text-white/20">
                      <MonitorPlay size={28} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-white font-semibold text-sm">当前场景还没有动画片段</p>
                      <p className="text-white/50 text-[12px]">为不同镜头创建独立片段，独立管理版本</p>
                    </div>
                    <button
                      onClick={() => {
                        setCreatingClip(true);
                        setNewClipName('');
                      }}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-bold border border-blue-500/60 shadow-lg transition-all"
                    >
                      新建片段
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 bg-[#1a1a1a] border-t border-white/5 flex justify-end items-center px-10">
            {animations.length === 0 ? (
              <div className="flex items-center gap-2 text-white/40">
                <Info size={14} className="text-amber-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest">当前场景还没有动画片段 · 先创建片段再上传版本</span>
              </div>
            ) : displayClipUrl ? (
              <div className="flex items-center gap-2 text-white/30">
                <CheckCircle2 size={14} className="text-green-500/50" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {selectedAnimation?.name || '动画片段'} 已发布 (实时审核模式已开启)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white/40">
                <Info size={14} className="text-amber-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {selectedAnimation?.name || '动画片段'} 暂无视频 · 上传后即可预览
                </span>
              </div>
            )}
          </div>
        </div>

        <div
          className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingRight ? 'bg-white/20' : ''}`}
          onMouseDown={e => {
            e.preventDefault();
            setIsResizingRight(true);
          }}
        />

        {/* 右侧：审核互动区 */}
        <div
          style={{ width: rightPanelWidth }}
          className="border-l border-white/5 bg-[#121212] flex flex-col min-w-[260px] max-w-[520px]"
        >
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">修改历史与讨论</span>
            <MessageSquare size={16} className="text-white/20" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {commentError ? (
              <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                加载评论失败：{commentError}
              </div>
            ) : loadingComments ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-white/40 text-sm">
                评论加载中...
              </div>
            ) : activeScene ? (
              activeSceneComments.length ? (
                activeSceneComments.map(c => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    authorColorClass="text-red-400"
                    onUpdate={async (id, content) => {
                      await updateComment(id, content);
                    }}
                    onDelete={async (id) => {
                      const target = activeSceneComments.find(cm => cm.id === id);
                      await deleteComment(id);
                      if (activeScene?.id) {
                        setSceneCommentCounts(prev => ({
                          ...prev,
                          [activeScene.id]: Math.max(0, (prev[activeScene.id] || 0) - 1)
                        }));
                        if (target?.status === 'unresolved') {
                          setSceneUnresolvedCounts(prev => ({
                            ...prev,
                            [activeScene.id]: Math.max(0, (prev[activeScene.id] || 0) - 1)
                          }));
                        }
                      }
                    }}
                    onResolve={async (id) => {
                      await resolveComment(id);
                      if (activeScene?.id) {
                        setSceneUnresolvedCounts(prev => ({
                          ...prev,
                          [activeScene.id]: Math.max(0, (prev[activeScene.id] || 0) - 1)
                        }));
                      }
                    }}
                    onUnresolve={async (id) => {
                      await unresolveComment(id);
                      if (activeScene?.id) {
                        setSceneUnresolvedCounts(prev => ({
                          ...prev,
                          [activeScene.id]: (prev[activeScene.id] || 0) + 1
                        }));
                      }
                    }}
                  />
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-3 opacity-20 italic">
                  <AlertCircle size={32} />
                  <p className="text-xs">暂无审核反馈</p>
                </div>
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 opacity-20 italic">
                <AlertCircle size={32} />
                <p className="text-xs">请选择场景查看反馈</p>
              </div>
            )}
          </div>

          <CommentInput
            onSubmit={handleSubmitComment}
            disabled={!activeScene}
            posting={postingComment}
            placeholder="添加修改意见或反馈..."
          />
        </div>
        </>
        )}
      </div>
    </div>
  );
};
