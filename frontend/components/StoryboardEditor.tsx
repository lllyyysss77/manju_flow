
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Episode, SceneFrameSet, SceneFrameSetVersion } from '../types';
import { fileApi, sceneApi, storyboardApi, commentApi, isValidMediaUrl } from '../api';
import {
  MessageSquare,
  Upload,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Info,
  Type,
  Camera,
  Music,
  History,
  Clock,
  Send,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
} from 'lucide-react';
import { useSceneComments } from './useSceneComments';
import { CommentItem } from './CommentItem';
import { useFileUrl } from './useFileUrl';
import { usePanelResize } from './usePanelResize';
import { DEFAULT_SCENE_THUMB, STATUS_MAP } from '../constants';
import { Toast, useToast } from './Toast';
import { ChapterTabBar } from './ChapterTabBar';
import { SceneThumbnailStrip } from './SceneThumbnailStrip';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

const computeFrameSetReorder = (
  list: SceneFrameSet[],
  sourceId: number,
  slotIndex: number
): { nextList: SceneFrameSet[]; newIndex: number } | null => {
  const source = list.find(fs => fs.id === sourceId);
  if (!source) return null;
  const ordered = [...list].sort((a, b) => a.index - b.index);
  const withoutSource = ordered.filter(fs => fs.id !== sourceId);
   const currentSlot = ordered.findIndex(fs => fs.id === sourceId);
  const clampedSlot = Math.min(Math.max(slotIndex, 0), withoutSource.length);
   if (clampedSlot === currentSlot) return null;
  const prev = withoutSource[clampedSlot - 1];
  const next = withoutSource[clampedSlot];
  let newIndex = source.index;
  if (!prev && next) newIndex = next.index - 0.5;
  else if (prev && !next) newIndex = prev.index + 1;
  else if (prev && next) newIndex = (prev.index + next.index) / 2;
  const nextList = [...withoutSource];
  nextList.splice(clampedSlot, 0, { ...source, index: newIndex });
  return { nextList, newIndex };
};

interface StoryboardEditorProps {
  bookId?: number;
  episodes?: Episode[];
  episode?: Episode; // backward compatibility
  // 跨模块状态同步
  initialChapterId?: number | null;
  initialSceneId?: number | null;
  onActiveChapterChange?: (chapterId: number | null) => void;
  onActiveSceneChange?: (sceneId: number | null) => void;
}

export const StoryboardEditor: React.FC<StoryboardEditorProps> = ({
  bookId,
  episodes = [],
  episode,
  initialChapterId,
  initialSceneId,
  onActiveChapterChange,
  onActiveSceneChange,
}) => {
  const chapterList = useMemo(() => {
    if (episodes.length > 0) return episodes;
    return episode ? [episode] : [];
  }, [episodes, episode]);
  const hasChapters = chapterList.length > 0;

  // 使用 ref 存储回调，避免作为依赖
  const onActiveChapterChangeRef = useRef(onActiveChapterChange);
  const onActiveSceneChangeRef = useRef(onActiveSceneChange);
  useEffect(() => {
    onActiveChapterChangeRef.current = onActiveChapterChange;
    onActiveSceneChangeRef.current = onActiveSceneChange;
  }, [onActiveChapterChange, onActiveSceneChange]);

  // 计算初始章节索引
  const computeInitialChapterIndex = () => {
    if (initialChapterId != null) {
      const idx = chapterList.findIndex(ch => ch.id === initialChapterId);
      if (idx >= 0) return idx;
    }
    return 0;
  };

  const [activeChapterIndex, setActiveChapterIndex] = useState(() => computeInitialChapterIndex());
  const activeEpisode = chapterList[activeChapterIndex];
  const normalizedScenes = useMemo(
    () => (activeEpisode?.scenes || []).map(scene => ({ ...scene, comments: scene.comments || [] })),
    [activeEpisode]
  );
  const sortedScenes = useMemo(
    () => [...normalizedScenes].sort((a, b) => a.index - b.index),
    [normalizedScenes]
  );

  // 计算初始场景索引
  const [activeSceneIndex, setActiveSceneIndex] = useState(() => {
    if (initialSceneId != null && activeEpisode) {
      const scenes = [...(activeEpisode.scenes || [])].sort((a, b) => a.index - b.index);
      const idx = scenes.findIndex(s => s.id === initialSceneId);
      if (idx >= 0) return idx;
    }
    return 0;
  });

  // 使用 ref 存储当前场景列表，供回调使用
  const sortedScenesRef = useRef(sortedScenes);
  const chapterListRef = useRef(chapterList);
  useEffect(() => {
    sortedScenesRef.current = sortedScenes;
    chapterListRef.current = chapterList;
  }, [sortedScenes, chapterList]);

  // 同步章节变化到父组件
  useEffect(() => {
    const chapter = chapterListRef.current[activeChapterIndex];
    onActiveChapterChangeRef.current?.(chapter?.id ?? null);
  }, [activeChapterIndex]);

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

  const activeScene = sortedScenes[activeSceneIndex];
  const hasScene = sortedScenes.length > 0;
  const {
    comments: sceneCommentList,
    loading: loadingComments,
    posting: postingComment,
    error: commentError,
    addComment,
    updateComment,
    deleteComment,
  } = useSceneComments(activeScene?.id, 'storyboard');
  const activeSceneComments = activeScene?.id ? sceneCommentList : [];

  useEffect(() => {
    setCommentDraft('');
  }, [activeScene?.id]);

  const [frameSets, setFrameSets] = useState<SceneFrameSet[]>([]);
  const [selectedFrameSetId, setSelectedFrameSetId] = useState<number | null>(null);
  const [versionsMap, setVersionsMap] = useState<Record<number, { start: SceneFrameSetVersion[]; end: SceneFrameSetVersion[] }>>({});
  const [framePreviewCache, setFramePreviewCache] = useState<Record<number, { start?: string; end?: string }>>({});
  const [previewCache, setPreviewCache] = useState<Record<number, string>>({});
  const [scenePreviewCache, setScenePreviewCache] = useState<Record<number, string>>({});
  // 用于追踪已发起请求的 scene ID，避免重复请求
  const scenePreviewRequestedRef = useRef<Set<number>>(new Set());
  const firstFrameSetId = useMemo(() => {
    if (!frameSets.length) return null;
    return [...frameSets].sort((a, b) => a.index - b.index)[0]?.id ?? null;
  }, [frameSets]);
  const urlCacheRef = useRef<Record<string, string>>({});
  const [loadingStoryboard, setLoadingStoryboard] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });
  const [frameDragOver, setFrameDragOver] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });
  const [draggingFrameSetId, setDraggingFrameSetId] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [savingFrameSetOrder, setSavingFrameSetOrder] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const [historyPanel, setHistoryPanel] = useState<{ type: 'start' | 'end'; open: boolean }>({ type: 'start', open: false });
  const [historySelection, setHistorySelection] = useState<{ start?: string; end?: string }>({});
  const [resolvedReference, setResolvedReference] = useState<string | undefined>();
  const [creatingSet, setCreatingSet] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SceneFrameSet | null>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [rightPanelWidth, setRightPanelWidth] = useState(300);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  // 场景评论数映射 (sceneId -> count)
  const [sceneCommentCounts, setSceneCommentCounts] = useState<Record<number, number>>({});
  const MIN_LEFT = 220;
  const MAX_LEFT = 420;
  const MIN_RIGHT = 260;
  const MAX_RIGHT = 520;

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

  const resolveFileUrl = useCallback(async (raw?: string | null) => {
    if (!raw) return '';
    const normalized = ensureHttpsUrl(raw);
    const { key, externalUrl } = normalizeFileKey(normalized);
    const fallback = externalUrl || normalized;
    if (!key) return fallback;
    const cacheKey = key || fallback;
    const cached = urlCacheRef.current[cacheKey];
    if (cached) return cached;
    try {
      const res = await fileApi.getSignedUrl(key);
      const resolved = ensureHttpsUrl(res.url || fallback);
      urlCacheRef.current[cacheKey] = resolved;
      return resolved;
    } catch (err) {
      console.error('Failed to resolve file url', err);
      return fallback;
    }
  }, []);

  useEffect(() => {
    if (!activeScene?.referenceImageUrl) {
      setResolvedReference(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const url = await resolveFileUrl(activeScene.referenceImageUrl);
      if (!cancelled) setResolvedReference(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.referenceImageUrl, resolveFileUrl]);

  // 加载场景缩略图 - 移除 scenePreviewCache 依赖避免循环
  useEffect(() => {
    sortedScenes.forEach(scene => {
      if (!scene.thumbnailUrl) return;
      // 使用 ref 检查是否已发起请求，避免重复
      if (scenePreviewRequestedRef.current.has(scene.id)) return;
      scenePreviewRequestedRef.current.add(scene.id);
      resolveFileUrl(scene.thumbnailUrl).then(url => {
        // 只有当 url 是有效的媒体 URL 时才缓存，避免使用未 resolve 的文件 key
        if (url && isValidMediaUrl(url)) {
          setScenePreviewCache(prev => ({ ...prev, [scene.id]: url }));
        }
      });
    });
  }, [sortedScenes, resolveFileUrl]);

  // 获取场景评论数
  useEffect(() => {
    if (!bookId) return;
    commentApi.getSceneCommentCounts(bookId, 'storyboard').then(res => {
      setSceneCommentCounts(res.data || {});
    }).catch(err => {
      console.error('Failed to fetch comment counts', err);
    });
  }, [bookId]);

  const primeVersionCache = useCallback(async (items: SceneFrameSetVersion[]) => {
    const entries = await Promise.all(
      items.map(async item => {
        const resolved = await resolveFileUrl(item.imageUrl);
        return [item.id, resolved] as const;
      })
    );
    const mapped = Object.fromEntries(entries);
    setPreviewCache(prev => ({ ...prev, ...mapped }));
  }, [resolveFileUrl]);

  const resolveFrameSetPreview = useCallback(
    async (frameSet: SceneFrameSet, sceneId?: number) => {
      const [start, end] = await Promise.all([
        frameSet.startFrameUrl ? resolveFileUrl(frameSet.startFrameUrl) : Promise.resolve(''),
        frameSet.endFrameUrl ? resolveFileUrl(frameSet.endFrameUrl) : Promise.resolve(''),
      ]);
      setFramePreviewCache(prev => ({
        ...prev,
        [frameSet.id]: {
          start: start || undefined,
          end: end || undefined,
        },
      }));
    },
    [resolveFileUrl]
  );

  const loadFrameSets = useCallback(
    async (sceneId: number) => {
      setLoadingStoryboard(true);
      setStoryboardError(null);
      try {
        const res = await storyboardApi.list(sceneId);
        const list = (res.data || []).sort((a, b) => a.index - b.index);
        setFrameSets(list);
        setSelectedFrameSetId(prev => {
          if (prev && list.some(fs => fs.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
        await Promise.all(list.map(fs => resolveFrameSetPreview(fs, sceneId)));
        setHistorySelection({});
      } catch (err) {
        console.error('Failed to load frame sets', err);
        setStoryboardError(err instanceof Error ? err.message : '加载分镜失败');
        setFrameSets([]);
        setSelectedFrameSetId(null);
      } finally {
        setLoadingStoryboard(false);
      }
    },
    [resolveFrameSetPreview]
  );

  const loadVersionsForFrameSet = useCallback(
    async (sceneId: number, frameSetId: number) => {
      setLoadingVersions(true);
      setStoryboardError(null);
      try {
        const [startVersionsRes, endVersionsRes] = await Promise.all([
          storyboardApi.listStartVersions(sceneId, frameSetId),
          storyboardApi.listEndVersions(sceneId, frameSetId),
        ]);
        const startVersions = startVersionsRes.data || [];
        const endVersions = endVersionsRes.data || [];
        setVersionsMap(prev => ({
          ...prev,
          [frameSetId]: {
            start: startVersions,
            end: endVersions,
          },
        }));
        await primeVersionCache([...startVersions, ...endVersions]);
      } catch (err) {
        console.error('Failed to load frame versions', err);
        setStoryboardError(err instanceof Error ? err.message : '加载帧版本失败');
      } finally {
        setLoadingVersions(false);
      }
    },
    [primeVersionCache]
  );

  useEffect(() => {
    if (!activeScene?.id) {
      setFrameSets([]);
      setSelectedFrameSetId(null);
      setVersionsMap({});
      setHistorySelection({});
      setLoadingVersions(false);
      return;
    }
    setStoryboardError(null);
    setFrameSets([]);
    setSelectedFrameSetId(null);
    setVersionsMap({});
    setHistorySelection({});
    setLoadingVersions(false);
    let cancelled = false;
    const load = async () => {
      await loadFrameSets(activeScene.id);
      if (!cancelled) {
        setHistorySelection({});
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id, loadFrameSets]);

  useEffect(() => {
    const current = frameSets.find(fs => fs.id === selectedFrameSetId);
    setRenameDraft(current?.name || '');
  }, [selectedFrameSetId, frameSets]);

  useEffect(() => {
    if (!selectedFrameSetId && historyPanel.open) {
      setHistoryPanel(prev => ({ ...prev, open: false }));
    }
  }, [selectedFrameSetId, historyPanel.open]);

  const openImagePreview = useCallback((url?: string, title?: string) => {
    if (!url) return;
    setImagePreview({ url, title: title || '画面预览' });
  }, []);

  const handleOpenHistory = useCallback(
    (type: 'start' | 'end') => {
      if (!activeScene?.id || !selectedFrameSetId) return;
      const existsInCurrentScene = frameSets.some(fs => fs.id === selectedFrameSetId);
      if (!existsInCurrentScene) return;
      setHistoryPanel({ type, open: true });
      setHistorySelection({});
      loadVersionsForFrameSet(activeScene.id, selectedFrameSetId);
    },
    [activeScene?.id, selectedFrameSetId, frameSets, loadVersionsForFrameSet]
  );

  useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagePreview(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview]);

  const handleUploadFrame = async (type: 'start' | 'end', file?: File | null) => {
    if (!file || !activeScene?.id || !selectedFrameSetId) return;
    setUploading(prev => ({ ...prev, [type]: true }));
    try {
      const uploaded = await fileApi.upload(file, 'private');
      const key = uploaded.key || uploaded.url;
      const resolved = await resolveFileUrl(key);
      if (type === 'start') {
        const version = await storyboardApi.updateStartFrame(activeScene.id, selectedFrameSetId, key);
        setFrameSets(prev =>
          prev.map(fs =>
            fs.id === selectedFrameSetId
              ? { ...fs, startFrameUrl: key, startFrameVersion: version.version }
              : fs
          )
        );
        const isFirstFrameSet = firstFrameSetId ? selectedFrameSetId === firstFrameSetId : true;
        const chapterId = activeScene.chapterId ?? activeEpisode?.id;
        if (isFirstFrameSet && bookId && chapterId) {
          sceneApi.update(bookId, chapterId, activeScene.id, { thumbnailUrl: key }).catch(err => {
            console.error('Failed to update scene thumbnail', err);
          });
        }
      } else {
        const version = await storyboardApi.updateEndFrame(activeScene.id, selectedFrameSetId, key);
        setFrameSets(prev =>
          prev.map(fs =>
            fs.id === selectedFrameSetId
              ? { ...fs, endFrameUrl: key, endFrameVersion: version.version }
              : fs
          )
        );
      }
      setFramePreviewCache(prev => ({
        ...prev,
        [selectedFrameSetId]: {
          ...(prev[selectedFrameSetId] || {}),
          [type === 'start' ? 'start' : 'end']: resolved || key,
        },
      }));
      await loadVersionsForFrameSet(activeScene.id, selectedFrameSetId);
      setHistorySelection({});
      if (type === 'start' && resolved) {
        setScenePreviewCache(prev => ({ ...prev, [activeScene.id]: resolved }));
      }
      showToast(`${type === 'start' ? '起始帧' : '结束帧'}已保存`, 'success');
    } catch (err) {
      console.error('Upload frame failed', err);
      showToast('保存失败，请重试', 'error');
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
      if (type === 'start' && startInputRef.current) startInputRef.current.value = '';
      if (type === 'end' && endInputRef.current) endInputRef.current.value = '';
      setFrameDragOver(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleFrameDrop = (type: 'start' | 'end') => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploading[type]) {
      setFrameDragOver(prev => ({ ...prev, [type]: false }));
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadFrame(type, file);
    }
    setFrameDragOver(prev => ({ ...prev, [type]: false }));
  };

  const applyVersion = async (type: 'start' | 'end', version: number) => {
    if (!activeScene?.id || !selectedFrameSetId) return;
    setUploading(prev => ({ ...prev, [type]: true }));
    try {
      let updated: SceneFrameSet;
      if (type === 'start') {
        updated = await storyboardApi.revertStartFrame(activeScene.id, selectedFrameSetId, version);
      } else {
        updated = await storyboardApi.revertEndFrame(activeScene.id, selectedFrameSetId, version);
      }
      setFrameSets(prev => prev.map(fs => (fs.id === selectedFrameSetId ? { ...fs, ...updated } : fs)));
      await resolveFrameSetPreview(updated, activeScene.id);
      if (type === 'start' && updated.startFrameUrl) {
        const resolvedStart = await resolveFileUrl(updated.startFrameUrl);
        const chapterId = activeScene.chapterId ?? activeEpisode?.id;
        const isFirstFrameSet = firstFrameSetId ? selectedFrameSetId === firstFrameSetId : true;
        setScenePreviewCache(prev => ({ ...prev, [activeScene.id]: resolvedStart || updated.startFrameUrl }));
        if (isFirstFrameSet && bookId && chapterId) {
          sceneApi.update(bookId, chapterId, activeScene.id, { thumbnailUrl: updated.startFrameUrl }).catch(err => {
            console.error('Failed to update scene thumbnail', err);
          });
        }
      }
      await loadVersionsForFrameSet(activeScene.id, selectedFrameSetId);
      setHistorySelection({});
      showToast('已切换到该版本', 'success');
    } catch (err) {
      console.error('Failed to apply version', err);
      showToast('切换失败，请重试', 'error');
    } finally {
      setUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleSubmitComment = async () => {
    const content = commentDraft.trim();
    if (!activeScene?.id) return;
    if (!content) {
      showToast('请输入评论内容', 'info');
      return;
    }
    try {
      await addComment(content);
      setCommentDraft('');
      // 更新评论数
      setSceneCommentCounts(prev => ({
        ...prev,
        [activeScene.id]: (prev[activeScene.id] || 0) + 1
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发表评论失败';
      showToast(msg, 'error');
    }
  };

  const handleCreateFrameSet = async () => {
    if (!activeScene?.id) return;
    const name = (newSetName || '').trim() || `帧集 ${frameSets.length + 1}`;
    const nextIndex = frameSets.length ? Math.max(...frameSets.map(fs => fs.index)) + 1 : 1;
    setLoadingStoryboard(true);
    setStoryboardError(null);
    try {
      const created = await storyboardApi.create(activeScene.id, { name, index: nextIndex });
      const nextList = [...frameSets, created].sort((a, b) => a.index - b.index);
      setFrameSets(nextList);
      setSelectedFrameSetId(created.id);
      setRenameDraft(created.name);
      setNewSetName('');
      setCreatingSet(false);
      await resolveFrameSetPreview(created, activeScene.id);
      showToast('新帧集已创建', 'success');
    } catch (err) {
      console.error('Create frame set failed', err);
      showToast('创建帧集失败，请重试', 'error');
      setStoryboardError(err instanceof Error ? err.message : '创建帧集失败');
    } finally {
      setLoadingStoryboard(false);
    }
  };

  const handleRenameFrameSet = async () => {
    if (!activeScene?.id || !selectedFrameSetId) return;
    const name = renameDraft.trim();
    if (!name) {
      showToast('请输入帧集名称', 'error');
      return;
    }
    try {
      const updated = await storyboardApi.update(activeScene.id, selectedFrameSetId, { name });
      setFrameSets(prev => prev.map(fs => (fs.id === selectedFrameSetId ? { ...fs, ...updated } : fs)));
      showToast('名称已更新', 'success');
    } catch (err) {
      console.error('Rename frame set failed', err);
      showToast('更新失败，请重试', 'error');
    }
  };

  const handleDeleteFrameSet = async (frameSetId: number) => {
    if (!activeScene?.id) return;
    setLoadingStoryboard(true);
    setStoryboardError(null);
    try {
      await storyboardApi.delete(activeScene.id, frameSetId);
      const nextList = frameSets.filter(fs => fs.id !== frameSetId);
      setFrameSets(nextList);
      setVersionsMap(prev => {
        const copy = { ...prev };
        delete copy[frameSetId];
        return copy;
      });
      setFramePreviewCache(prev => {
        const copy = { ...prev };
        delete copy[frameSetId];
        return copy;
      });
      const nextActive = selectedFrameSetId === frameSetId ? nextList[0]?.id ?? null : selectedFrameSetId;
      setSelectedFrameSetId(nextActive ?? null);
      setHistorySelection({});
      setDeleteTarget(null);
      if (nextActive) {
        const nextSet = nextList.find(fs => fs.id === nextActive);
        setRenameDraft(nextSet?.name || '');
      }
      showToast('帧集已删除', 'success');
    } catch (err) {
      console.error('Delete frame set failed', err);
      showToast('删除失败，请重试', 'error');
    } finally {
      setLoadingStoryboard(false);
    }
  };

  const handleFrameSetDropAtSlot = async (slotIndex: number, e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeScene?.id || savingFrameSetOrder) {
      setDraggingFrameSetId(null);
      setDragOverSlot(null);
      return;
    }
    const sourceIdStr = e.dataTransfer.getData('text/plain');
    const sourceId = draggingFrameSetId ?? Number.parseInt(sourceIdStr, 10);
    if (!sourceId || Number.isNaN(sourceId)) {
      setDraggingFrameSetId(null);
      setDragOverSlot(null);
      return;
    }
    const previous = [...frameSets];
    const reordered = computeFrameSetReorder(frameSets, sourceId, slotIndex);
    setDragOverSlot(null);
    if (!reordered) {
      setDraggingFrameSetId(null);
      return;
    }
    const { nextList, newIndex } = reordered;
    setFrameSets(nextList);
    setSavingFrameSetOrder(true);
    try {
      const updated = await storyboardApi.update(activeScene.id, sourceId, { index: newIndex });
      setFrameSets(prev => {
        const merged = prev.map(fs =>
          fs.id === sourceId ? { ...fs, ...updated, index: updated.index ?? newIndex } : fs
        );
        return [...merged].sort((a, b) => a.index - b.index);
      });
      showToast('帧集顺序已更新', 'success');
    } catch (err) {
      console.error('Reorder frame sets failed', err);
      setFrameSets(previous);
      showToast('调整顺序失败，请重试', 'error');
    } finally {
      setSavingFrameSetOrder(false);
      setDraggingFrameSetId(null);
      setDragOverSlot(null);
    }
  };

  const selectedFrameSet = frameSets.find(fs => fs.id === selectedFrameSetId) || null;
  const currentFramePreview = selectedFrameSet ? framePreviewCache[selectedFrameSet.id] : undefined;
  const currentVersions = selectedFrameSet ? versionsMap[selectedFrameSet.id] || { start: [], end: [] } : { start: [], end: [] };
  const startDisplayUrl = historySelection.start || currentFramePreview?.start || '';
  const endDisplayUrl = historySelection.end || currentFramePreview?.end || '';

  if (!hasChapters) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm bg-[#0f0f0f]">
        暂无章节数据，请先在剧本阶段创建章节与场景
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] relative">
      <Toast toast={toast} onClose={hideToast} />
      {/* 顶部章节/场景切换条 */}
      <div className="border-b border-white/5 bg-[#141414]">
        <ChapterTabBar
          chapters={chapterList}
          activeChapterId={activeEpisode?.id ?? null}
          onSelectChapter={(_, idx) => {
            setActiveChapterIndex(idx);
            setActiveSceneIndex(0);
          }}
        />
        <div className="h-20 border-t border-white/10 bg-[#161616] flex items-center px-4 gap-2 overflow-x-auto">
          {sortedScenes.map((scene, idx) => {
            const displayNumber = idx + 1;
            // 只使用已 resolve 的缓存 URL 或有效的原始 URL，否则使用默认占位图
            const cachedUrl = scenePreviewCache[scene.id];
            const preview = cachedUrl || (isValidMediaUrl(scene.thumbnailUrl) ? scene.thumbnailUrl : DEFAULT_SCENE_THUMB);
            return (
            <button
              key={scene.id}
              onClick={() => setActiveSceneIndex(idx)}
              className={`flex-shrink-0 w-32 h-14 rounded border transition-all relative overflow-hidden group ${
                activeSceneIndex === idx 
                  ? 'border-blue-500 ring-1 ring-blue-500' 
                  : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'
              }`}
            >
              {preview ? (
                <img src={preview} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-[10px] text-white/20 font-bold">
                  SCENE {displayNumber}
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] py-0.5 px-1 text-white/70 font-mono flex items-center justify-between">
                <span>#{displayNumber}</span>
                {sceneCommentCounts[scene.id] > 0 && (
                  <span className="flex items-center gap-0.5 text-yellow-300/90" title={`${sceneCommentCounts[scene.id]} 条评论`}>
                    <MessageSquare size={8} />
                    <span>{sceneCommentCounts[scene.id]}</span>
                  </span>
                )}
              </div>
              {scene.status === 'COMPLETED' && (
                <div className="absolute top-1 right-1">
                  <CheckCircle2 size={10} className="text-green-500 shadow-sm" />
                </div>
              )}
            </button>
          );
          })}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {!hasScene ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm bg-[#0a0a0a]">
            当前章节暂无场景，可切换章节查看或在剧本阶段先添加场景
          </div>
        ) : (
        <>
        <DeleteConfirmDialog
          isOpen={!!deleteTarget}
          title="删除帧集"
          message="帧集「{name}」的所有版本都会被清空，确认继续？"
          itemName={deleteTarget?.name || '未命名'}
          onConfirm={() => deleteTarget && handleDeleteFrameSet(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
        {storyboardError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
            <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-100 text-sm shadow-xl">
              分镜数据加载失败：{storyboardError}
            </div>
          </div>
        )}
        {(loadingStoryboard || loadingVersions) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-2 bg-black/60 border border-white/10 rounded-lg text-white/70 text-sm backdrop-blur-sm">
              {loadingStoryboard ? '正在同步分镜数据...' : '正在解析历史版本...'}
            </div>
          </div>
        )}
        {/* 左侧：剧本参考区 */}
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
                "{activeScene.description}"
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-orange-400">
              <Camera size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">镜头/构图</h3>
            </div>
            <p className="text-sm text-white/60 font-medium px-1">
              {activeScene.cameraMovement || '未指定镜头类型'}
            </p>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-purple-400">
              <Type size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">台词/旁白</h3>
            </div>
            <div className="bg-blue-600/5 border-l-2 border-blue-500 p-3">
              <p className="text-sm text-white/80 leading-snug">
                {activeScene.dialogue || <span className="text-white/20 italic">（无台词）</span>}
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-green-400">
              <Music size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">参考图</h3>
            </div>
            {activeScene.referenceImageUrl ? (
              <img src={resolvedReference || (isValidMediaUrl(activeScene.referenceImageUrl) ? activeScene.referenceImageUrl : undefined)} className="w-full rounded-lg border border-white/10" alt="参考图" />
            ) : (
              <p className="text-xs text-white/40 leading-relaxed px-1">暂无参考图</p>
            )}
          </section>
        </div>

        <div
          className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingLeft ? 'bg-white/20' : ''}`}
          onMouseDown={e => {
            e.preventDefault();
            setIsResizingLeft(true);
          }}
        />

        {/* 中间：画布展示区 */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a] relative">
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-white flex items-center gap-3">
                  场景 {activeSceneIndex + 1} 画稿绘制
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    activeScene.status === 'COMPLETED' ? 'bg-green-600 text-white' : 'bg-orange-600/20 text-orange-400 border border-orange-600/30'
                  }`}>
                    {STATUS_MAP[activeScene.status]}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button 
                    disabled={activeSceneIndex === 0}
                    onClick={() => setActiveSceneIndex(prev => prev - 1)}
                    className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white disabled:opacity-10 transition-all"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    disabled={activeSceneIndex === sortedScenes.length - 1}
                    onClick={() => setActiveSceneIndex(prev => prev + 1)}
                    className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white disabled:opacity-10 transition-all"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* 帧集与画稿 */}
              <div className="bg-[#111111] rounded-2xl border border-white/5 p-5 space-y-5 shadow-xl">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
                      <Camera size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">帧集管理</p>
                      <p className="text-[11px] text-white/40">为同一场景拆分多套首尾帧，按序推进绘制(拖拽帧集可调整顺序)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCreatingSet(true);
                        setNewSetName('');
                      }}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[11px] rounded-lg border border-white/10 flex items-center gap-1 transition-all"
                    >
                      创建帧集
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const renderDropSlot = (slotIndex: number) => {
                      const isActiveSlot = dragOverSlot === slotIndex && draggingFrameSetId !== null;
                      return (
                        <div
                          key={`slot-${slotIndex}`}
                          onDragOver={e => {
                            if (savingFrameSetOrder || draggingFrameSetId === null) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            setDragOverSlot(slotIndex);
                          }}
                          onDragEnter={e => {
                            if (savingFrameSetOrder || draggingFrameSetId === null) return;
                            e.preventDefault();
                            setDragOverSlot(slotIndex);
                          }}
                          onDragLeave={() => setDragOverSlot(prev => (prev === slotIndex ? null : prev))}
                          onDrop={e => handleFrameSetDropAtSlot(slotIndex, e)}
                          className={`w-9 h-10 flex items-center justify-center rounded-lg border border-dashed transition-all ${
                            isActiveSlot
                              ? 'border-blue-400/70 bg-blue-500/15 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]'
                              : 'border-white/10 bg-white/0'
                          } ${draggingFrameSetId !== null ? 'opacity-100' : 'opacity-40'}`}
                        >
                          <div className={`w-1.5 h-6 rounded-full ${isActiveSlot ? 'bg-blue-400' : 'bg-white/10'}`} />
                        </div>
                      );
                    };

                    return (
                      <>
                        {renderDropSlot(0)}
                        {frameSets.map((fs, idx) => {
                          const isActive = fs.id === selectedFrameSetId;
                          const isDragging = draggingFrameSetId === fs.id;
                          return (
                            <React.Fragment key={fs.id}>
                              <button
                                draggable
                                onClick={() => {
                                  setSelectedFrameSetId(fs.id);
                                  setHistoryPanel(prev => ({ ...prev, open: false }));
                                }}
                                onDragStart={e => {
                                  setDraggingFrameSetId(fs.id);
                                  setDragOverSlot(null);
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', String(fs.id));
                                }}
                                onDragEnd={() => {
                                  setDraggingFrameSetId(null);
                                  setDragOverSlot(null);
                                }}
                                onDragOver={e => {
                                  if (savingFrameSetOrder) return;
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                  if (draggingFrameSetId === null) return;
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const dropPosition: 'before' | 'after' =
                                    e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
                                  const slotIndex = dropPosition === 'before' ? idx : idx + 1;
                                  setDragOverSlot(slotIndex);
                                }}
                                onDragLeave={() => {
                                  setDragOverSlot(null);
                                }}
                                onDrop={e => {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const dropPosition: 'before' | 'after' =
                                    e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
                                  const slotIndex = dropPosition === 'before' ? idx : idx + 1;
                                  handleFrameSetDropAtSlot(slotIndex, e);
                                }}
                                className={`px-3 py-1.5 rounded-lg border text-sm flex items-center gap-2 transition-all ${
                                  isActive
                                    ? 'bg-blue-600/20 border-blue-500/60 text-white shadow-[0_0_12px_rgba(59,130,246,0.35)]'
                                    : 'bg-white/5 border-white/10 text-white/70 hover:border-white/30 hover:text-white'
                                } ${isDragging ? 'opacity-60 cursor-grabbing' : 'cursor-grab'}`}
                              >
                                <span>{fs.name || `帧集 #${Math.round(fs.index)}`}</span>
                              </button>
                              {renderDropSlot(idx + 1)}
                            </React.Fragment>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>

                {creatingSet && (
                  <div className="flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3">
                    <input
                      value={newSetName}
                      onChange={e => setNewSetName(e.target.value)}
                      placeholder="镜头名称 / Shot A / 镜头1"
                      className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleCreateFrameSet}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg border border-blue-500/60"
                    >
                      创建
                    </button>
                    <button
                      onClick={() => {
                        setCreatingSet(false);
                        setNewSetName('');
                      }}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-xs rounded-lg border border-white/10"
                    >
                      取消
                    </button>
                  </div>
                )}

                {selectedFrameSet ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={renameDraft}
                          onChange={e => setRenameDraft(e.target.value)}
                          onBlur={handleRenameFrameSet}
                          className="min-w-[180px] bg-[#0c0c0c] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="填写帧集名称"
                        />
                        <button
                          onClick={handleRenameFrameSet}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1"
                        >
                          <Pencil size={12} /> 保存名称
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenHistory('start')}
                          className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all"
                        >
                          <History size={12} /> 起始帧历史
                        </button>
                        <button
                          onClick={() => handleOpenHistory('end')}
                          className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all"
                        >
                          <History size={12} /> 结束帧历史
                        </button>
                        <button
                          onClick={() => setDeleteTarget(selectedFrameSet)}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg bg-white/5 border border-white/10 text-red-300 hover:text-white hover:border-red-500/40 hover:bg-red-500/20 flex items-center gap-1"
                        >
                          删除帧集
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">起始帧 / 关键帧 A</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-white/40">版本 {selectedFrameSet.startFrameVersion ?? '—'}</span>
                            <button
                              onClick={() => handleOpenHistory('start')}
                              className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all"
                            >
                              <History size={12} /> 查看历史
                            </button>
                          </div>
                        </div>
                        <div
                          className={`aspect-video w-full rounded-xl border-2 border-dashed bg-zinc-900 overflow-hidden relative transition-colors ${
                            frameDragOver.start ? 'border-blue-500/60 bg-blue-900/20' : 'border-white/5'
                          }`}
                          onDragOver={e => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            setFrameDragOver(prev => ({ ...prev, start: true }));
                          }}
                          onDragEnter={e => {
                            e.preventDefault();
                            setFrameDragOver(prev => ({ ...prev, start: true }));
                          }}
                          onDragLeave={() => setFrameDragOver(prev => ({ ...prev, start: false }))}
                          onDrop={handleFrameDrop('start')}
                        >
                          {startDisplayUrl ? (
                            <>
                              <img
                                src={startDisplayUrl}
                                className="w-full h-full object-cover cursor-zoom-in"
                                onClick={() => openImagePreview(startDisplayUrl, '起始帧预览')}
                                alt="起始帧预览"
                              />
                              <button
                                type="button"
                                onClick={() => startInputRef.current?.click()}
                                className="absolute top-2 right-2 px-3 py-1.5 text-[11px] rounded-lg bg-black/70 text-white/90 border border-white/10 shadow disabled:opacity-60 hover:bg-black/80"
                                disabled={uploading.start}
                              >
                                {uploading.start ? '上传中...' : '重新上传'}
                              </button>
                              {selectedFrameSet?.startFrameVersion ? (
                                <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-black/60 text-white/70 border border-white/10">
                                  版本 #{selectedFrameSet.startFrameVersion}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <button
                              onClick={() => startInputRef.current?.click()}
                              className="absolute inset-0 flex flex-col items-center justify-center gap-3 hover:bg-white/5 transition-colors"
                              disabled={uploading.start}
                            >
                              <Upload size={32} className="text-white/20" />
                              <span className="text-xs font-bold text-white/20 uppercase">
                                {uploading.start ? '上传中...' : '拖拽或点击上传首帧'}
                              </span>
                            </button>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            ref={startInputRef}
                            className="hidden"
                            onChange={e => handleUploadFrame('start', e.target.files?.[0])}
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">结束帧 / 关键帧 B</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-white/40">版本 {selectedFrameSet.endFrameVersion ?? '—'}</span>
                            <button
                              onClick={() => handleOpenHistory('end')}
                              className="flex items-center gap-1 text-[11px] px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all"
                            >
                              <History size={12} /> 查看历史
                            </button>
                          </div>
                        </div>
                        <div
                          className={`aspect-video w-full rounded-xl border-2 border-dashed bg-zinc-900 overflow-hidden relative transition-colors ${
                            frameDragOver.end ? 'border-blue-500/60 bg-blue-900/20' : 'border-white/5'
                          }`}
                          onDragOver={e => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            setFrameDragOver(prev => ({ ...prev, end: true }));
                          }}
                          onDragEnter={e => {
                            e.preventDefault();
                            setFrameDragOver(prev => ({ ...prev, end: true }));
                          }}
                          onDragLeave={() => setFrameDragOver(prev => ({ ...prev, end: false }))}
                          onDrop={handleFrameDrop('end')}
                        >
                          {endDisplayUrl ? (
                             <>
                              <img
                                src={endDisplayUrl}
                                className="w-full h-full object-cover cursor-zoom-in"
                                onClick={() => openImagePreview(endDisplayUrl, '结束帧预览')}
                                alt="结束帧预览"
                              />
                              <button
                                type="button"
                                onClick={() => endInputRef.current?.click()}
                                className="absolute top-2 right-2 px-3 py-1.5 text-[11px] rounded-lg bg-black/70 text-white/90 border border-white/10 shadow disabled:opacity-60 hover:bg-black/80"
                                disabled={uploading.end}
                              >
                                {uploading.end ? '上传中...' : '重新上传'}
                              </button>
                              {selectedFrameSet?.endFrameVersion ? (
                                <div className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-black/60 text-white/70 border border-white/10">
                                  版本 #{selectedFrameSet.endFrameVersion}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <button
                              onClick={() => endInputRef.current?.click()}
                              className="absolute inset-0 flex flex-col items-center justify-center gap-3 hover:bg-white/5 transition-colors"
                              disabled={uploading.end}
                            >
                              <Upload size={32} className="text-white/20" />
                              <span className="text-xs font-bold text-white/20 uppercase">
                                {uploading.end ? '上传中...' : '拖拽或点击上传尾帧 (可选)'}
                              </span>
                            </button>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            ref={endInputRef}
                            className="hidden"
                            onChange={e => handleUploadFrame('end', e.target.files?.[0])}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="border border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3 text-white/50">
                    <Upload size={32} className="text-white/20" />
                    <p className="text-sm font-semibold text-white">当前场景还没有帧集</p>
                    <p className="text-[12px] text-white/40">为不同镜头创建多套首尾帧，再开始上传图片</p>
                    <button
                      onClick={() => {
                        setCreatingSet(true);
                        setNewSetName('');
                      }}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-bold border border-blue-500/60 shadow-lg transition-all"
                    >
                      新建第一套帧集
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>

          <div className="p-4 bg-[#1a1a1a] border-t border-white/5 flex justify-end items-center px-10">
            <div className="flex items-center gap-2 text-white/30">
              <CheckCircle2 size={14} className="text-green-500/50" />
              <span className="text-[10px] font-bold uppercase tracking-widest">画稿资产已同步至云端 (可实时审核)</span>
            </div>
          </div>
        </div>

        <div
          className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingRight ? 'bg-white/20' : ''}`}
          onMouseDown={e => {
            e.preventDefault();
            setIsResizingRight(true);
          }}
        />

        {/* 历史版本侧滑面板 */}
        {historyPanel.open && (
          <div className="fixed inset-0 z-30">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setHistoryPanel({ ...historyPanel, open: false })}
            />
            <div className="absolute right-0 top-0 bottom-0 w-[360px] bg-[#0f0f0f] border-l border-white/10 shadow-2xl animate-in fade-in slide-in-from-right">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History size={16} className="text-blue-400" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">历史版本</p>
                    <p className="text-sm text-white/80">
                      {historyPanel.type === 'start' ? '起始帧' : '结束帧'} · {selectedFrameSet?.name || '未命名帧集'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto h-full">
                {(historyPanel.type === 'start' ? currentVersions.start : currentVersions.end).map(item => {
                  // 只使用已 resolve 的缓存 URL 或有效的原始 URL
                  const url = previewCache[item.id] || (isValidMediaUrl(item.imageUrl) ? item.imageUrl : '');
                  const label = `版本 #${item.version}`;
                  const time = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) : '时间未知';
                  return (
                    <div
                      key={`${item.frameType}-${item.id}`}
                      className="w-full text-left bg-white/5 border border-white/10 rounded-xl overflow-hidden transition-all hover:border-white/30"
                    >
                      <div className="aspect-video bg-black overflow-hidden">
                        <img src={url} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-3 flex items-center justify-between gap-2 text-white/80">
                        <div>
                          <p className="text-sm font-semibold">{label}</p>
                          <div className="flex items-center gap-1 text-xs text-white/40">
                            <Clock size={12} /> {time}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => applyVersion(historyPanel.type, item.version)}
                            className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50"
                            disabled={uploading[historyPanel.type]}
                          >
                            设为当前
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(historyPanel.type === 'start' ? currentVersions.start : currentVersions.end).length === 0 && (
                  <div className="text-center text-white/40 text-sm py-10 border border-dashed border-white/10 rounded-xl">
                    暂无历史版本
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 右侧：实时评审交流区 */}
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
              <div className="h-full flex items-center justify-center text-white/40 text-sm">
                评论加载中...
              </div>
            ) : activeScene ? (
              activeSceneComments.length ? (
                activeSceneComments.map(c => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    onUpdate={async (id, content) => {
                      await updateComment(id, content);
                    }}
                    onDelete={async (id) => {
                      await deleteComment(id);
                    }}
                  />
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-3 opacity-30 italic">
                  <AlertCircle size={32} />
                  <p className="text-xs">暂无审核反馈</p>
                </div>
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 opacity-30 italic">
                <AlertCircle size={32} />
                <p className="text-xs">请选择场景查看反馈</p>
              </div>
            )}
          </div>

          <div className="p-4 bg-[#161616] border-t border-white/5">
            <div className="flex items-center gap-2 bg-[#1e1e1e] border border-white/10 rounded-xl px-3 py-2">
              <input
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                placeholder="添加修改意见或反馈..."
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
              />
              <button
                onClick={handleSubmitComment}
                disabled={postingComment || !commentDraft.trim() || !activeScene}
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
    </div>
  );
};
