
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Character, Episode, Scene, SceneAnimation, SceneAnimationGenerationTask, SceneAnimationVersion, SceneFrameSet } from '../types';
import { fileApi, animationApi, storyboardApi, commentApi, characterApi, getFileUrl, downloadFile, normalizeFileKey } from '../api';
import {
  MessageSquare,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
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
  X,
  CheckCircle2,
  Download,
  Sparkles,
  UploadCloud,
  Loader2,
  Music
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

interface ResolvedSceneFrameSet extends SceneFrameSet {
  resolvedStartFrameUrl?: string;
  resolvedEndFrameUrl?: string;
}

type ReferenceMediaType = 'image' | 'audio' | 'video';
type SeedanceModel = 'doubao-seedance-2-0-260128' | 'doubao-seedance-2-0-fast-260128';
type SeedanceRatio = '16:9' | '9:16';

interface UploadedReferenceMedia {
  id: string;
  key: string;
  name: string;
  url: string;
  mimeType: string;
  type: ReferenceMediaType;
}

type MentionAssetKind = 'character-image' | 'character-audio' | 'storyboard-image';
type MentionCategory = 'character-image' | 'character-audio' | 'storyboard-image';

interface PromptAssetMention {
  id: string;
  label: string;
  kind: MentionAssetKind;
  mediaType: Extract<ReferenceMediaType, 'image' | 'audio'>;
  key: string;
  url: string;
  mimeType: string;
  name: string;
}

interface PromptAssetPickerState {
  open: boolean;
  category?: MentionCategory;
  parentId?: string;
  childId?: string;
  x: number;
  y: number;
  activeIndex: number;
}

const REFERENCE_LABELS: Record<ReferenceMediaType, string> = {
  image: '图片参考',
  audio: '音频参考',
  video: '视频参考',
};

const PROMPT_MENTION_PATTERN = /\{\{asset:([^}]+)\}\}/g;

const CHARACTER_IMAGE_SLOTS = [
  { field: 'referenceImageUrl' as const, label: '三视图' },
  { field: 'halfBodyFrontImageUrl' as const, label: '半身正面' },
  { field: 'fullBodyFrontImageUrl' as const, label: '全身正面' },
  { field: 'fullBodySideImageUrl' as const, label: '全身侧视图' },
  { field: 'fullBodyBackImageUrl' as const, label: '全身后视图' },
];

const PROMPT_ASSET_CATEGORY_LABELS: Record<MentionCategory, string> = {
  'character-image': '人物图片',
  'character-audio': '人物音频',
  'storyboard-image': '分镜图',
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const DEFAULT_VIDEO_MODEL: SeedanceModel = 'doubao-seedance-2-0-fast-260128';
const DEFAULT_VIDEO_RATIO: SeedanceRatio = '16:9';
const DEFAULT_VIDEO_DURATION = 8;

const buildDefaultVideoPrompt = (scene?: Scene) =>
  [scene?.description, scene?.cameraMovement ? `镜头运动：${scene.cameraMovement}` : '', scene?.dialogue ? `对白/旁白：${scene.dialogue}` : '']
    .map(item => (item || '').trim())
    .filter(Boolean)
    .join('\n');

const buildReferenceMediaName = (raw: string, fallback: string) => {
  const normalized = (raw || '').trim();
  if (!normalized) return fallback;
  try {
    const maybeUrl = normalized.startsWith('http://') || normalized.startsWith('https://')
      ? new URL(normalized)
      : null;
    const pathname = maybeUrl ? maybeUrl.pathname : normalized;
    const segments = pathname.split('/').filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] || fallback);
  } catch {
    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || fallback;
  }
};

const StoryboardReferenceCard: React.FC<{
  frameSet: ResolvedSceneFrameSet;
  onPreview: (url?: string, title?: string) => void;
}> = ({ frameSet, onPreview }) => {
  const startFrameIsPortrait = useImageOrientation(frameSet.resolvedStartFrameUrl);
  const endFrameIsPortrait = useImageOrientation(frameSet.resolvedEndFrameUrl);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.18em] text-emerald-300">
              #{Math.round(frameSet.index)}
            </span>
            <p className="text-sm font-bold text-white truncate">{frameSet.name || `帧集 #${Math.round(frameSet.index)}`}</p>
          </div>
          <p className="mt-1 text-[10px] text-white/35">当前帧集的首尾关键帧参考</p>
        </div>
        <div className="text-[10px] px-2 py-1 rounded-full border border-white/10 text-white/45 bg-black/20">
          帧集
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-white/40 font-semibold mb-1">首帧 (Keyframe A)</div>
          <div className={`${startFrameIsPortrait ? 'aspect-[9/16]' : 'aspect-video'} rounded-lg overflow-hidden border border-white/10 bg-black`}>
            {frameSet.resolvedStartFrameUrl ? (
              <img
                src={frameSet.resolvedStartFrameUrl}
                className="w-full h-full object-contain cursor-zoom-in"
                onClick={() => onPreview(frameSet.resolvedStartFrameUrl, `${frameSet.name || `帧集 #${Math.round(frameSet.index)}`} · 首帧`)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-white/10">未上传</div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-white/40 font-semibold mb-1">尾帧 (Keyframe B)</div>
          <div className={`${endFrameIsPortrait ? 'aspect-[9/16]' : 'aspect-video'} rounded-lg overflow-hidden border border-white/10 bg-black`}>
            {frameSet.resolvedEndFrameUrl ? (
              <img
                src={frameSet.resolvedEndFrameUrl}
                className="w-full h-full object-contain cursor-zoom-in"
                onClick={() => onPreview(frameSet.resolvedEndFrameUrl, `${frameSet.name || `帧集 #${Math.round(frameSet.index)}`} · 尾帧`)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-white/10">未上传</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const directVideoInputRef = useRef<HTMLInputElement>(null);
  const imageReferenceInputRef = useRef<HTMLInputElement>(null);
  const audioReferenceInputRef = useRef<HTMLInputElement>(null);
  const videoReferenceInputRef = useRef<HTMLInputElement>(null);
  const promptEditorRef = useRef<HTMLDivElement>(null);
  const promptPickerAnchorRef = useRef<Range | null>(null);
  const [animations, setAnimations] = useState<SceneAnimation[]>([]);
  const [selectedAnimationId, setSelectedAnimationId] = useState<number | null>(null);
  const [versionMap, setVersionMap] = useState<Record<number, SceneAnimationVersion[]>>({});
  const [loadingAnimation, setLoadingAnimation] = useState(false);
  const [animationError, setAnimationError] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingReferenceType, setUploadingReferenceType] = useState<ReferenceMediaType | null>(null);
  const [referenceMedia, setReferenceMedia] = useState<Record<ReferenceMediaType, UploadedReferenceMedia[]>>({
    image: [],
    audio: [],
    video: [],
  });
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [promptMentions, setPromptMentions] = useState<Record<string, PromptAssetMention>>({});
  const [promptPicker, setPromptPicker] = useState<PromptAssetPickerState>({ open: false, x: 16, y: 44, activeIndex: 0 });
  const [generationRatio, setGenerationRatio] = useState<SeedanceRatio>(DEFAULT_VIDEO_RATIO);
  const [generationDuration, setGenerationDuration] = useState(DEFAULT_VIDEO_DURATION);
  const [generationModel, setGenerationModel] = useState<SeedanceModel>(DEFAULT_VIDEO_MODEL);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generationTaskMap, setGenerationTaskMap] = useState<Record<number, SceneAnimationGenerationTask[]>>({});
  const [pollingTaskId, setPollingTaskId] = useState<number | null>(null);
  const { toast, showToast, hideToast } = useToast();
  const [framePreviewCache, setFramePreviewCache] = useState<Record<number, ResolvedSceneFrameSet[]>>({});
  const [characters, setCharacters] = useState<Character[]>([]);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [resolvingVersion, setResolvingVersion] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [previewSource, setPreviewSource] = useState<{ url?: string; version?: number } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creatingClip, setCreatingClip] = useState(false);
  const [newClipName, setNewClipName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SceneAnimation | null>(null);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const [hoveredPromptMention, setHoveredPromptMention] = useState<{ mention: PromptAssetMention; x: number; y: number } | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [rightPanelWidth, setRightPanelWidth] = useState(300);
  const [isCommentPanelCollapsed, setIsCommentPanelCollapsed] = useState(true);
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
  const resetGenerationDraft = useCallback((scene?: Scene) => {
    setReferenceMedia({
      image: [],
      audio: [],
      video: [],
    });
    setGenerationPrompt(buildDefaultVideoPrompt(scene));
    setPromptMentions({});
    setPromptPicker(prev => ({ ...prev, open: false, category: undefined, parentId: undefined, childId: undefined, activeIndex: 0 }));
    setGenerationRatio(DEFAULT_VIDEO_RATIO);
    setGenerationDuration(DEFAULT_VIDEO_DURATION);
    setGenerationModel(DEFAULT_VIDEO_MODEL);
  }, []);

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
      setGenerationTaskMap({});
      setPollingTaskId(null);
      setPreviewSource(null);
      setAnimationError(null);
      setLoadingAnimation(false);
      setRenameDraft('');
      setCreatingClip(false);
      setNewClipName('');
      resetGenerationDraft(undefined);
      return;
    }
    setVersionMap({});
    setGenerationTaskMap({});
    setPollingTaskId(null);
    setSelectedAnimationId(null);
    setPreviewSource(null);
    setVersionMenuOpen(false);
    setDeleteTarget(null);
    setRenameDraft('');
    setCreatingClip(false);
    setNewClipName('');
    resetGenerationDraft(activeScene);
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
  }, [activeScene, resetGenerationDraft]);

  useEffect(() => {
    if (!bookId) {
      setCharacters([]);
      return;
    }
    let cancelled = false;
    const loadCharacters = async () => {
      try {
        const res = await characterApi.list(bookId);
        if (!cancelled) {
          setCharacters((res.data || []).sort((a, b) => a.index - b.index));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load character assets', err);
          showToast('大纲人设资产加载失败', 'error');
        }
      }
    };
    loadCharacters();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (!activeScene?.id) return;
    let cancelled = false;
    const targetScenes = sortedScenes.slice(activeSceneIndex, activeSceneIndex + 4).filter(scene => scene?.id);
    const load = async () => {
      try {
        const entries = await Promise.all(
          targetScenes.map(async scene => {
            const res = await storyboardApi.list(scene.id);
            const resolvedFrameSets = (res.data || [])
              .sort((a, b) => a.index - b.index)
              .map(frameSet => ({
                ...frameSet,
                resolvedStartFrameUrl: frameSet.startFrameUrl ? getFileUrl(frameSet.startFrameUrl) || undefined : undefined,
                resolvedEndFrameUrl: frameSet.endFrameUrl ? getFileUrl(frameSet.endFrameUrl) || undefined : undefined,
              }));
            return [scene.id, resolvedFrameSets] as const;
          })
        );
        if (cancelled) return;
        setFramePreviewCache(prev => ({
          ...prev,
          ...Object.fromEntries(entries),
        }));
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load storyboard preview', err);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id, activeSceneIndex, sortedScenes]);

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
    if (!activeScene?.id || !selectedAnimationId) return;
    let cancelled = false;
    const loadTasks = async () => {
      try {
        const res = await animationApi.listGenerationTasks(activeScene.id, selectedAnimationId);
        if (cancelled) return;
        const tasks = (res.data || []).sort((a, b) => b.id - a.id);
        setGenerationTaskMap(prev => ({
          ...prev,
          [selectedAnimationId]: tasks,
        }));
        const latestRunningTask = tasks.find(task => task.status === 'PENDING' || task.status === 'PROCESSING');
        if (latestRunningTask) {
          setPollingTaskId(latestRunningTask.id);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load generation tasks', err);
      }
    };
    loadTasks();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id, selectedAnimationId]);

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
    setPollingTaskId(null);
    resetGenerationDraft(activeScene);
  }, [activeScene, resetGenerationDraft, selectedAnimationId]);

  useEffect(() => {
    if (!selectedAnimationId && versionMenuOpen) {
      setVersionMenuOpen(false);
    }
  }, [selectedAnimationId, versionMenuOpen]);

  const openImagePreview = useCallback((url?: string, title?: string) => {
    if (!url) return;
    setImagePreview({ url, title: title || '画面预览' });
  }, []);

  useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImagePreview(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imagePreview]);

  const selectedAnimation = animations.find(a => a.id === selectedAnimationId) || null;
  const currentVersions = selectedAnimation ? versionMap[selectedAnimation.id] || [] : [];
  const currentGenerationTasks = selectedAnimation ? generationTaskMap[selectedAnimation.id] || [] : [];
  const activeGenerationTask =
    (pollingTaskId ? currentGenerationTasks.find(task => task.id === pollingTaskId) : undefined) ||
    currentGenerationTasks.find(task => task.status === 'PENDING' || task.status === 'PROCESSING') ||
    currentGenerationTasks[0];
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
  const storyboardReferenceList = activeScene?.id ? framePreviewCache[activeScene.id] || [] : [];
  const promptMentionList = useMemo(
    () => Object.values(promptMentions)
      .filter(mention => generationPrompt.includes(mention.label) || generationPrompt.includes(`{{asset:${mention.id}}}`))
      .sort((a, b) => {
        const indexOfMention = (mention: PromptAssetMention) => {
          const labelIndex = generationPrompt.indexOf(mention.label);
          if (labelIndex >= 0) return labelIndex;
          return generationPrompt.indexOf(`{{asset:${mention.id}}}`);
        };
        return indexOfMention(a) - indexOfMention(b);
      }),
    [generationPrompt, promptMentions]
  );
  const promptMentionOrder = useMemo(() => {
    const order: Record<string, string> = {};
    promptMentionList.forEach(mention => {
      const refIndex = referenceMedia[mention.mediaType].findIndex(item => item.key === mention.key);
      order[mention.id] = `${mention.mediaType === 'image' ? '图片' : '音频'} ${refIndex >= 0 ? refIndex + 1 : 1}`;
    });
    return order;
  }, [promptMentionList, referenceMedia]);
  const promptPickerScenes = useMemo(
    () => sortedScenes.slice(activeSceneIndex, activeSceneIndex + 4),
    [activeSceneIndex, sortedScenes]
  );
  const playbackUrl = displayClipUrl ? getFileUrl(displayClipUrl) || undefined : undefined;
  const canGenerateVideo =
    Boolean(selectedAnimationId) &&
    Boolean(generationPrompt.trim()) &&
    !generatingVideo &&
    !uploadingReferenceType;
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.load();
    setIsPlaying(false);
  }, [playbackUrl]);

  const clearReferenceInput = (type: ReferenceMediaType) => {
    const refMap = {
      image: imageReferenceInputRef,
      audio: audioReferenceInputRef,
      video: videoReferenceInputRef,
    };
    const targetRef = refMap[type];
    if (targetRef.current) targetRef.current.value = '';
  };

  const handleUploadReferenceMedia = async (type: ReferenceMediaType, files?: FileList | null) => {
    if (!files?.length) return;
    setUploadingReferenceType(type);
    setAnimationError(null);
    try {
      const uploadedItems: UploadedReferenceMedia[] = [];
      for (const file of Array.from(files)) {
        const uploaded = await fileApi.upload(file, 'private');
        const key = uploaded.key || '';
        const url = getFileUrl(key || uploaded.url) || uploaded.url;
        uploadedItems.push({
          id: `${type}-${key || uploaded.url}-${Date.now()}-${uploadedItems.length}`,
          key,
          name: file.name,
          url,
          mimeType: file.type || uploaded.mimeType || '',
          type,
        });
      }
      setReferenceMedia(prev => ({
        ...prev,
        [type]: [...prev[type], ...uploadedItems],
      }));
      showToast(`${REFERENCE_LABELS[type]}已上传`, 'success');
    } catch (err) {
      console.error('Upload reference media failed', err);
      setAnimationError(err instanceof Error ? err.message : '参考媒体上传失败');
      showToast('参考媒体上传失败，请重试', 'error');
    } finally {
      setUploadingReferenceType(null);
      clearReferenceInput(type);
    }
  };

  const handleRemoveReferenceMedia = (type: ReferenceMediaType, mediaId: string) => {
    setReferenceMedia(prev => ({
      ...prev,
      [type]: prev[type].filter(item => item.id !== mediaId),
    }));
  };

  const buildMentionMedia = (type: Extract<ReferenceMediaType, 'image' | 'audio'>, id: string, key: string, name: string, label: string, kind: MentionAssetKind): PromptAssetMention | null => {
    const normalized = normalizeFileKey(key);
    const source = normalized.key || normalized.externalUrl || key;
    if (!source) return null;
    return {
      id,
      label,
      kind,
      mediaType: type,
      key: source,
      url: getFileUrl(source) || source,
      mimeType: type === 'image' ? 'image/*' : 'audio/*',
      name,
    };
  };

  const addPromptMention = (mention: PromptAssetMention) => {
    setPromptMentions(prev => ({ ...prev, [mention.id]: mention }));
    setReferenceMedia(prev => {
      const exists = prev[mention.mediaType].some(item => item.key === mention.key);
      if (exists) return prev;
      const media: UploadedReferenceMedia = {
        id: `mention-${mention.id}`,
        key: mention.key,
        name: mention.name,
        url: mention.url,
        mimeType: mention.mimeType,
        type: mention.mediaType,
      };
      return {
        ...prev,
        [mention.mediaType]: [...prev[mention.mediaType], media],
      };
    });
    insertMentionIntoEditor(mention);
    setPromptPicker(prev => ({ ...prev, open: false, category: undefined, parentId: undefined, childId: undefined, activeIndex: 0 }));
  };

  const serializePromptEditor = () => {
    const editor = promptEditorRef.current;
    if (!editor) return generationPrompt;
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const element = node as HTMLElement;
      if (element.dataset.assetId) return `{{asset:${element.dataset.assetId}}}`;
      if (element.tagName === 'BR') return '\n';
      return Array.from(element.childNodes).map(walk).join('');
    };
    return Array.from(editor.childNodes).map(walk).join('').replace(/\u00a0/g, ' ');
  };

  const getPromptEditorHtml = () => {
    const parts: string[] = [];
    let lastIndex = 0;
    generationPrompt.replace(PROMPT_MENTION_PATTERN, (raw, id: string, offset: number) => {
      parts.push(escapeHtml(generationPrompt.slice(lastIndex, offset)).replace(/\n/g, '<br>'));
      const mention = promptMentions[id];
      const label = promptMentionOrder[id] || (mention?.mediaType === 'audio' ? '音频' : '图片');
      parts.push(`<span contenteditable="false" data-asset-id="${escapeHtml(id)}" class="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-500/15 px-2 py-0.5 text-[12px] font-semibold text-blue-100 align-baseline">${escapeHtml(label)}</span>`);
      lastIndex = offset + raw.length;
      return raw;
    });
    parts.push(escapeHtml(generationPrompt.slice(lastIndex)).replace(/\n/g, '<br>'));
    return parts.join('');
  };

  useEffect(() => {
    const editor = promptEditorRef.current;
    if (!editor || document.activeElement === editor) return;
    const html = getPromptEditorHtml();
    if (editor.innerHTML !== html) editor.innerHTML = html;
  }, [generationPrompt, promptMentions, promptMentionOrder]);

  useEffect(() => {
    const editor = promptEditorRef.current;
    if (!editor) return;
    editor.querySelectorAll<HTMLElement>('[data-asset-id]').forEach(chip => {
      const id = chip.dataset.assetId || '';
      const mention = promptMentions[id];
      chip.textContent = promptMentionOrder[id] || (mention?.mediaType === 'audio' ? '音频' : '图片');
    });
  }, [promptMentionOrder, promptMentions]);

  const syncPromptFromEditor = () => {
    const next = serializePromptEditor();
    setGenerationPrompt(next);
    return next;
  };

  const getCaretRectInPromptEditor = () => {
    const editor = promptEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return { x: 16, y: 44 };
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const hostRect = editor.getBoundingClientRect();
    if (rect.width || rect.height) {
      return { x: Math.max(8, rect.left - hostRect.left), y: Math.max(36, rect.bottom - hostRect.top + 8) };
    }
    return { x: 16, y: 44 };
  };

  const openPromptPickerAtCaret = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount) promptPickerAnchorRef.current = selection.getRangeAt(0).cloneRange();
    const pos = getCaretRectInPromptEditor();
    setPromptPicker({ open: true, x: pos.x, y: pos.y, activeIndex: 0 });
  };

  const handlePromptEditorInput = () => {
    const next = syncPromptFromEditor();
    if (next.endsWith('@')) openPromptPickerAtCaret();
  };

  const handlePromptEditorMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-asset-id]');
    if (!target) {
      setHoveredPromptMention(null);
      return;
    }
    const id = target.dataset.assetId || '';
    const mention = promptMentions[id];
    const hostRect = event.currentTarget.getBoundingClientRect();
    if (mention) {
      setHoveredPromptMention({
        mention,
        x: Math.min(event.clientX - hostRect.left + 12, hostRect.width - 260),
        y: event.clientY - hostRect.top + 16,
      });
    }
  };

  const insertMentionIntoEditor = (mention: PromptAssetMention) => {
    const editor = promptEditorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    const range = promptPickerAnchorRef.current?.cloneRange() || selection?.getRangeAt(0).cloneRange();
    if (!range) return;
    selection?.removeAllRanges();
    selection?.addRange(range);

    const activeRange = selection!.getRangeAt(0);
    if (activeRange.startContainer.nodeType === Node.TEXT_NODE) {
      const textNode = activeRange.startContainer;
      const offset = activeRange.startOffset;
      if ((textNode.textContent || '')[offset - 1] === '@') {
        activeRange.setStart(textNode, offset - 1);
      }
    }
    activeRange.deleteContents();
    const chip = document.createElement('span');
    chip.contentEditable = 'false';
    chip.dataset.assetId = mention.id;
    chip.className = 'inline-flex items-center rounded-full border border-blue-400/30 bg-blue-500/15 px-2 py-0.5 text-[12px] font-semibold text-blue-100 align-baseline';
    const existingIndex = referenceMedia[mention.mediaType].findIndex(item => item.key === mention.key);
    const displayIndex = existingIndex >= 0 ? existingIndex + 1 : referenceMedia[mention.mediaType].length + 1;
    chip.textContent = `${mention.mediaType === 'image' ? '图片' : '音频'} ${displayIndex}`;
    activeRange.insertNode(document.createTextNode(' '));
    activeRange.insertNode(chip);
    const after = document.createRange();
    after.setStartAfter(chip.nextSibling || chip);
    after.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(after);
    setGenerationPrompt(serializePromptEditor());
  };

  const renderPromptForSubmission = () => {
    let text = generationPrompt.replace(PROMPT_MENTION_PATTERN, (_raw, id: string) => promptMentionOrder[id] || '');
    promptMentionList.forEach(mention => {
      text = text.split(mention.label).join(promptMentionOrder[mention.id] || '');
    });
    return text.trim();
  };

  const getPromptPickerActiveOptions = () => {
    const availableCharacters = characters.filter(char => char.name?.trim());
    const selectedCharacter = availableCharacters.find(char => String(char.id) === promptPicker.parentId);
    const selectedScene = promptPickerScenes.find(scene => String(scene.id) === promptPicker.parentId);
    const selectedFrameSets = selectedScene?.id ? framePreviewCache[selectedScene.id] || [] : [];
    const selectedFrameSet = selectedFrameSets.find(frameSet => String(frameSet.id) === promptPicker.childId);

    if (!promptPicker.category) {
      return (Object.keys(PROMPT_ASSET_CATEGORY_LABELS) as MentionCategory[]).map(category => ({
        key: category,
        disabled: false,
        select: () => setPromptPicker(prev => ({ ...prev, category, parentId: undefined, childId: undefined, activeIndex: 0 })),
      }));
    }

    if (promptPicker.category === 'character-audio') {
      return availableCharacters.map(character => {
        const mention = character.voiceAudioUrl ? buildMentionMedia(
          'audio',
          `char-audio-${character.id}`,
          character.voiceAudioUrl,
          `${character.name} · 音色`,
          `@人物音频/${character.name}`,
          'character-audio'
        ) : null;
        return {
          key: String(character.id),
          disabled: !mention,
          select: () => mention && addPromptMention(mention),
        };
      });
    }

    if (promptPicker.category === 'character-image' && !selectedCharacter) {
      return availableCharacters.map(character => ({
        key: String(character.id),
        disabled: false,
        select: () => setPromptPicker(prev => ({ ...prev, parentId: String(character.id), childId: undefined, activeIndex: 0 })),
      }));
    }

    if (promptPicker.category === 'character-image' && selectedCharacter) {
      return CHARACTER_IMAGE_SLOTS.map(slot => {
        const key = selectedCharacter[slot.field];
        const mention = key ? buildMentionMedia(
          'image',
          `char-img-${selectedCharacter.id}-${slot.field}`,
          key,
          `${selectedCharacter.name} · ${slot.label}`,
          `@人物图片/${selectedCharacter.name}/${slot.label}`,
          'character-image'
        ) : null;
        return {
          key: slot.field,
          disabled: !mention,
          select: () => mention && addPromptMention(mention),
        };
      });
    }

    if (promptPicker.category === 'storyboard-image' && !selectedScene) {
      return promptPickerScenes.map(scene => ({
        key: String(scene.id),
        disabled: false,
        select: () => setPromptPicker(prev => ({ ...prev, parentId: String(scene.id), childId: undefined, activeIndex: 0 })),
      }));
    }

    if (promptPicker.category === 'storyboard-image' && selectedScene && !selectedFrameSet) {
      return selectedFrameSets.map(frameSet => ({
        key: String(frameSet.id),
        disabled: false,
        select: () => setPromptPicker(prev => ({ ...prev, childId: String(frameSet.id), activeIndex: 0 })),
      }));
    }

    if (promptPicker.category === 'storyboard-image' && selectedScene && selectedFrameSet) {
      return [
        { label: '首帧', key: selectedFrameSet.startFrameUrl, url: selectedFrameSet.resolvedStartFrameUrl },
        { label: '尾帧', key: selectedFrameSet.endFrameUrl, url: selectedFrameSet.resolvedEndFrameUrl },
      ].map(item => {
        const mention = item.key ? buildMentionMedia(
          'image',
          `storyboard-${selectedScene.id}-${selectedFrameSet.id}-${item.label}`,
          item.key,
          `#${selectedScene.index} ${selectedFrameSet.name || `帧集 #${Math.round(selectedFrameSet.index)}`} · ${item.label}`,
          `@分镜图/#${selectedScene.index}/${selectedFrameSet.name || `帧集 #${Math.round(selectedFrameSet.index)}`}/${item.label}`,
          'storyboard-image'
        ) : null;
        return {
          key: item.label,
          disabled: !mention,
          select: () => mention && addPromptMention(mention),
        };
      });
    }

    return [];
  };

  const handlePromptEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (promptPicker.open) {
      const options = getPromptPickerActiveOptions();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setPromptPicker(prev => ({
          ...prev,
          activeIndex: options.length ? (prev.activeIndex + delta + options.length) % options.length : 0,
        }));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'ArrowRight') {
        event.preventDefault();
        const option = options[promptPicker.activeIndex] || options[0];
        if (option && !option.disabled) option.select();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPromptPicker(prev => {
          if (prev.childId) return { ...prev, childId: undefined, activeIndex: 0 };
          if (prev.parentId) return { ...prev, parentId: undefined, activeIndex: 0 };
          if (prev.category) return { ...prev, category: undefined, activeIndex: 0 };
          return prev;
        });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setPromptPicker(prev => ({ ...prev, open: false }));
        return;
      }
    }

    if (event.key === '@') {
      window.setTimeout(openPromptPickerAtCaret, 0);
    }
  };

  const handleUploadVideo = async (file?: File | null) => {
    if (!file || !activeScene?.id || !selectedAnimationId) return;
    setUploadingVideo(true);
    setAnimationError(null);
    try {
      const uploaded = await fileApi.upload(file, 'private');
      const rawUrl = uploaded.key || uploaded.url;
      const version = await animationApi.upload(activeScene.id, selectedAnimationId, rawUrl || '');
      setAnimations(prev =>
        prev.map(animation =>
          animation.id === selectedAnimationId
            ? { ...animation, animationUrl: version.videoUrl, animationVersion: version.version }
            : animation
        )
      );
      const versionsRes = await animationApi.listVersions(activeScene.id, selectedAnimationId);
      await resolveVersions(selectedAnimationId, versionsRes.data || []);
      setPreviewSource(null);
      showToast(`视频已上传并保存为版本 #${version.version}`, 'success');
    } catch (err) {
      console.error('Upload animation failed', err);
      setAnimationError(err instanceof Error ? err.message : '上传失败，请重试');
      showToast('上传失败，请重试', 'error');
    } finally {
      setUploadingVideo(false);
      if (directVideoInputRef.current) directVideoInputRef.current.value = '';
    }
  };

  const buildReferenceMediaFromKeys = useCallback(
    (
      type: ReferenceMediaType,
      keys?: string[],
      assets?: Array<{ source: string; name: string; mimeType?: string }>
    ) =>
      ((assets && assets.length
        ? assets.map((asset, index) => ({
            source: asset.source,
            name: asset.name || buildReferenceMediaName(asset.source, `${REFERENCE_LABELS[type]} ${index + 1}`),
            mimeType: asset.mimeType || '',
          }))
        : (keys || []).filter(Boolean).map((key, index) => ({
            source: key,
            name: buildReferenceMediaName(key, `${REFERENCE_LABELS[type]} ${index + 1}`),
            mimeType: '',
          }))) || [])
        .map((item, index) => ({
          id: `reuse-${type}-${index}-${item.source}`,
          key: item.source,
          name: item.name,
          url: getFileUrl(item.source) || item.source,
          mimeType: item.mimeType,
          type,
        })),
    []
  );

  const handleReuseGenerationTaskParams = async (taskId: number) => {
    if (!activeScene?.id || !selectedAnimationId) return;
    try {
      const task =
        currentGenerationTasks.find(item => item.id === taskId) ||
        await animationApi.getGenerationTask(activeScene.id, selectedAnimationId, taskId);

      setGenerationPrompt(task.text || '');
      setGenerationRatio(task.ratio || DEFAULT_VIDEO_RATIO);
      setGenerationDuration(task.duration || DEFAULT_VIDEO_DURATION);
      setGenerationModel(task.model || DEFAULT_VIDEO_MODEL);
      setReferenceMedia({
        image: buildReferenceMediaFromKeys('image', task.referenceImageKeys, task.referenceImageAssets),
        audio: buildReferenceMediaFromKeys('audio', task.referenceAudioKeys, task.referenceAudioAssets),
        video: buildReferenceMediaFromKeys('video', task.referenceVideoKeys, task.referenceVideoAssets),
      });
      showToast('已复用该版本的创作参数与参考媒体', 'success');
    } catch (err) {
      console.error('Reuse generation task params failed', err);
      showToast('复用创作参数失败，请重试', 'error');
    }
  };

  const handleGenerateVideo = async () => {
    if (!activeScene?.id || !selectedAnimationId) return;
    const text = renderPromptForSubmission();
    if (!text) {
      showToast('请输入视频提示词', 'error');
      return;
    }
    setGeneratingVideo(true);
    setAnimationError(null);
    try {
      const task = await animationApi.createGenerationTask(activeScene.id, selectedAnimationId, {
        text,
        ratio: generationRatio,
        duration: generationDuration,
        model: generationModel,
        referenceImageKeys: referenceMedia.image.map(item => item.key).filter(Boolean),
        referenceAudioKeys: referenceMedia.audio.map(item => item.key).filter(Boolean),
        referenceVideoKeys: referenceMedia.video.map(item => item.key).filter(Boolean),
      });
      setGenerationTaskMap(prev => {
        const existing = prev[selectedAnimationId] || [];
        return {
          ...prev,
          [selectedAnimationId]: [task, ...existing.filter(item => item.id !== task.id)].sort((a, b) => b.id - a.id),
        };
      });
      setPollingTaskId(task.id);
      setPreviewSource(null);
      if (task.status === 'FAILED') {
        setAnimationError(task.errorMessage || '视频任务创建失败');
        showToast(task.errorMessage || '视频任务创建失败', 'error');
      } else {
        showToast('视频生成任务已创建，后台将持续轮询状态', 'success');
      }
    } catch (err) {
      console.error('Generate animation failed', err);
      setAnimationError(err instanceof Error ? err.message : '视频生成失败');
      showToast(err instanceof Error ? err.message : '视频生成失败，请重试', 'error');
    } finally {
      setGeneratingVideo(false);
    }
  };

  useEffect(() => {
    if (!activeScene?.id || !selectedAnimationId || !pollingTaskId) return;
    const task = currentGenerationTasks.find(item => item.id === pollingTaskId);
    if (!task || (task.status !== 'PENDING' && task.status !== 'PROCESSING')) return;

    let cancelled = false;
    let timer: number | null = null;

    const scheduleNext = (delay = 10000) => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        pollTask();
      }, delay);
    };

    const pollTask = async () => {
      try {
        const nextTask = await animationApi.pollGenerationTask(activeScene.id, selectedAnimationId, pollingTaskId);
        if (cancelled) return;

        setGenerationTaskMap(prev => {
          const existing = prev[selectedAnimationId] || [];
          return {
            ...prev,
            [selectedAnimationId]: [nextTask, ...existing.filter(item => item.id !== nextTask.id)].sort((a, b) => b.id - a.id),
          };
        });

        if (nextTask.status === 'SUCCEEDED') {
          setPollingTaskId(null);
          if (nextTask.outputVersion && nextTask.resultVideoUrl) {
            setAnimations(prev =>
              prev.map(animation =>
                animation.id === selectedAnimationId
                  ? {
                      ...animation,
                      animationUrl: nextTask.resultVideoUrl,
                      animationVersion: nextTask.outputVersion,
                    }
                  : animation
              )
            );
          }
          const versionsRes = await animationApi.listVersions(activeScene.id, selectedAnimationId);
          if (cancelled) return;
          await resolveVersions(selectedAnimationId, versionsRes.data || []);
          setPreviewSource(null);
          if (task.status !== 'SUCCEEDED') {
            showToast(
              nextTask.outputVersion
                ? `视频已生成并保存为版本 #${nextTask.outputVersion}`
                : '视频任务已完成',
              'success'
            );
          }
          return;
        }

        if (nextTask.status === 'FAILED') {
          setPollingTaskId(null);
          setAnimationError(nextTask.errorMessage || '视频生成失败');
          if (task.status !== 'FAILED') {
            showToast(nextTask.errorMessage || '视频生成失败', 'error');
          }
          return;
        }

        scheduleNext();
      } catch (err) {
        if (cancelled) return;
        console.error('Poll generation task failed', err);
        scheduleNext(10000);
      }
    };

    scheduleNext(10000);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeScene?.id, currentGenerationTasks, pollingTaskId, resolveVersions, selectedAnimationId, showToast]);

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
      showToast('已创建动画片段，配置参考媒体后即可生成视频', 'success');
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
      setGenerationTaskMap(prev => {
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


  const scrollReferenceRail = (element: HTMLDivElement, delta: number, behavior: ScrollBehavior = 'auto') => {
    if (element.scrollWidth <= element.clientWidth || delta === 0) return;
    element.scrollBy({ left: delta, behavior });
  };

  const handleReferenceRailWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollWidth <= element.clientWidth) return;

    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (dominantDelta === 0) return;

    event.preventDefault();
    scrollReferenceRail(element, dominantDelta);
  };

  const handleReferenceRailKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    const element = event.currentTarget;
    if (element.scrollWidth <= element.clientWidth) return;

    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    scrollReferenceRail(element, direction * element.clientWidth * 0.75, 'smooth');
  };

  const closePreview = () => {
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      previewVideoRef.current.currentTime = 0;
    }
    setPreviewSource(null);
  };

  const renderPromptAssetPicker = () => {
    if (!promptPicker.open) return null;
    const availableCharacters = characters.filter(char => char.name?.trim());
    const selectedCharacter = availableCharacters.find(char => String(char.id) === promptPicker.parentId) || null;
    const selectedScene = promptPickerScenes.find(scene => String(scene.id) === promptPicker.parentId) || null;
    const selectedFrameSets = selectedScene?.id ? framePreviewCache[selectedScene.id] || [] : [];
    const selectedFrameSet = selectedFrameSets.find(frameSet => String(frameSet.id) === promptPicker.childId) || null;
    const activeOptions = getPromptPickerActiveOptions();
    const isActive = (key: string) => activeOptions[promptPicker.activeIndex]?.key === key;
    const buttonClass = (active: boolean, disabled = false) => `mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
      disabled
        ? 'cursor-not-allowed opacity-30 text-white/35'
        : active
          ? 'bg-blue-500/15 text-blue-100'
          : 'text-white/55 hover:bg-white/5 hover:text-white'
    }`;

    return (
      <div
        className="absolute z-30 mt-1 flex max-w-[min(920px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-white/10 bg-[#101010] shadow-2xl"
        style={{ left: promptPicker.x, top: promptPicker.y }}
      >
        <div className="w-40 shrink-0 border-r border-white/10 p-2">
          <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">选择资产类型</div>
          {(Object.keys(PROMPT_ASSET_CATEGORY_LABELS) as MentionCategory[]).map(category => (
            <button
              key={category}
              type="button"
              onMouseEnter={() => {
                if (!promptPicker.category) {
                  const idx = activeOptions.findIndex(option => option.key === category);
                  setPromptPicker(prev => ({ ...prev, activeIndex: Math.max(0, idx) }));
                }
              }}
              onClick={() => setPromptPicker(prev => ({ ...prev, category, parentId: undefined, childId: undefined, activeIndex: 0 }))}
              className={buttonClass(promptPicker.category === category || (!promptPicker.category && isActive(category)))}
            >
              <span>{PROMPT_ASSET_CATEGORY_LABELS[category]}</span>
              <ChevronRight size={13} />
            </button>
          ))}
        </div>

        {promptPicker.category && (
          <div className="w-52 shrink-0 max-h-[360px] overflow-y-auto border-r border-white/10 p-2">
            <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">
              {promptPicker.category === 'storyboard-image' ? '选择分镜' : '选择人物'}
            </div>
            {promptPicker.category === 'storyboard-image' ? (
              promptPickerScenes.length > 0 ? promptPickerScenes.map(scene => (
                <button
                  key={scene.id}
                  type="button"
                  onMouseEnter={() => {
                    if (!selectedScene) {
                      const idx = activeOptions.findIndex(option => option.key === String(scene.id));
                      setPromptPicker(prev => ({ ...prev, activeIndex: Math.max(0, idx) }));
                    }
                  }}
                  onClick={() => setPromptPicker(prev => ({ ...prev, parentId: String(scene.id), childId: undefined, activeIndex: 0 }))}
                  className={buttonClass(selectedScene?.id === scene.id || (!selectedScene && isActive(String(scene.id))))}
                >
                  <span>#{scene.index}</span>
                  <span className="ml-2 truncate text-white/35">{scene.description || '分镜'}</span>
                </button>
              )) : (
                <div className="px-3 py-6 text-center text-xs text-white/30">暂无当前分镜</div>
              )
            ) : (
              availableCharacters.length > 0 ? availableCharacters.map(character => {
                const audioMention = character.voiceAudioUrl ? buildMentionMedia(
                  'audio',
                  `char-audio-${character.id}`,
                  character.voiceAudioUrl,
                  `${character.name} · 音色`,
                  `@人物音频/${character.name}`,
                  'character-audio'
                ) : null;
                const disabled = promptPicker.category === 'character-audio' && !audioMention;
                return (
                  <button
                    key={character.id}
                    type="button"
                    disabled={disabled}
                    onMouseEnter={() => {
                      if (!selectedCharacter || promptPicker.category === 'character-audio') {
                        const idx = activeOptions.findIndex(option => option.key === String(character.id));
                        setPromptPicker(prev => ({ ...prev, activeIndex: Math.max(0, idx) }));
                      }
                    }}
                    onClick={() => {
                      if (promptPicker.category === 'character-audio') {
                        if (audioMention) addPromptMention(audioMention);
                      } else {
                        setPromptPicker(prev => ({ ...prev, parentId: String(character.id), childId: undefined, activeIndex: 0 }));
                      }
                    }}
                    className={buttonClass(selectedCharacter?.id === character.id || ((!selectedCharacter || promptPicker.category === 'character-audio') && isActive(String(character.id))), disabled)}
                  >
                    <span>{character.name}</span>
                    <span className="text-white/30">{promptPicker.category === 'character-audio' ? (audioMention ? '音色' : '未上传') : '人设'}</span>
                  </button>
                );
              }) : (
                <div className="px-3 py-6 text-center text-xs text-white/30">大纲人设里还没有角色资产</div>
              )
            )}
          </div>
        )}

        {promptPicker.category === 'character-image' && selectedCharacter && (
          <div className="w-64 shrink-0 max-h-[360px] overflow-y-auto p-2">
            <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">选择图片</div>
            {CHARACTER_IMAGE_SLOTS.map(slot => {
              const key = selectedCharacter[slot.field];
              const mention = key ? buildMentionMedia(
                'image',
                `char-img-${selectedCharacter.id}-${slot.field}`,
                key,
                `${selectedCharacter.name} · ${slot.label}`,
                `@人物图片/${selectedCharacter.name}/${slot.label}`,
                'character-image'
              ) : null;
              return (
                <button
                  key={slot.field}
                  type="button"
                  disabled={!mention}
                  onMouseEnter={() => {
                    const idx = activeOptions.findIndex(option => option.key === slot.field);
                    setPromptPicker(prev => ({ ...prev, activeIndex: Math.max(0, idx) }));
                  }}
                  onClick={() => mention && addPromptMention(mention)}
                  className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors ${buttonClass(isActive(slot.field), !mention).replace('mb-1 flex w-full items-center justify-between', '')}`}
                >
                  <div className="h-10 w-10 overflow-hidden rounded-lg border border-white/10 bg-black">
                    {mention?.url ? <img src={mention.url} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{slot.label}</div>
                    <div className="text-[10px] text-white/35">{mention ? '添加到图片参考' : '未上传'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {promptPicker.category === 'storyboard-image' && selectedScene && (
          <div className="w-56 shrink-0 max-h-[360px] overflow-y-auto border-r border-white/10 p-2">
            <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">选择帧集</div>
            {selectedFrameSets.length > 0 ? selectedFrameSets.map(frameSet => (
              <button
                key={frameSet.id}
                type="button"
                onMouseEnter={() => {
                  if (!selectedFrameSet) {
                    const idx = activeOptions.findIndex(option => option.key === String(frameSet.id));
                    setPromptPicker(prev => ({ ...prev, activeIndex: Math.max(0, idx) }));
                  }
                }}
                onClick={() => setPromptPicker(prev => ({ ...prev, childId: String(frameSet.id), activeIndex: 0 }))}
                className={buttonClass(selectedFrameSet?.id === frameSet.id || (!selectedFrameSet && isActive(String(frameSet.id))))}
              >
                <span className="truncate">{frameSet.name || `帧集 #${Math.round(frameSet.index)}`}</span>
                <ChevronRight size={13} />
              </button>
            )) : (
              <div className="px-3 py-6 text-center text-xs text-white/30">#{selectedScene.index} 暂无帧集图片</div>
            )}
          </div>
        )}

        {promptPicker.category === 'storyboard-image' && selectedScene && selectedFrameSet && (
          <div className="w-64 shrink-0 max-h-[360px] overflow-y-auto p-2">
            <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">选择首尾帧</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '首帧', key: selectedFrameSet.startFrameUrl, url: selectedFrameSet.resolvedStartFrameUrl },
                { label: '尾帧', key: selectedFrameSet.endFrameUrl, url: selectedFrameSet.resolvedEndFrameUrl },
              ].map(item => {
                const mention = item.key ? buildMentionMedia(
                  'image',
                  `storyboard-${selectedScene.id}-${selectedFrameSet.id}-${item.label}`,
                  item.key,
                  `#${selectedScene.index} ${selectedFrameSet.name || `帧集 #${Math.round(selectedFrameSet.index)}`} · ${item.label}`,
                  `@分镜图/#${selectedScene.index}/${selectedFrameSet.name || `帧集 #${Math.round(selectedFrameSet.index)}`}/${item.label}`,
                  'storyboard-image'
                ) : null;
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={!mention}
                    onMouseEnter={() => {
                      const idx = activeOptions.findIndex(option => option.key === item.label);
                      setPromptPicker(prev => ({ ...prev, activeIndex: Math.max(0, idx) }));
                    }}
                    onClick={() => mention && addPromptMention(mention)}
                    className={`overflow-hidden rounded-lg border text-left transition-colors ${isActive(item.label) ? 'border-blue-400/50 bg-blue-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/5'} disabled:opacity-30`}
                  >
                    <div className="aspect-video bg-black">
                      {item.url ? <img src={item.url} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="px-2 py-1 text-[10px] text-white/60">{item.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderReferenceMediaSection = (
    type: ReferenceMediaType,
    options: {
      title: string;
      description: string;
      accept: string;
      icon: React.ReactNode;
    }
  ) => {
    const inputRefMap = {
      image: imageReferenceInputRef,
      audio: audioReferenceInputRef,
      video: videoReferenceInputRef,
    };
    const items = referenceMedia[type];
    const isUploading = uploadingReferenceType === type;
    const inputRef = inputRefMap[type];
    const usesHorizontalRail = type === 'image' || type === 'video';
    const usesVerticalScrollableList = type === 'audio';

    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-white/5 text-white/70">{options.icon}</div>
            <div>
              <div className="text-sm font-semibold text-white">{options.title}</div>
              <p className="text-[11px] text-white/40">{options.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] text-white/80 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            {isUploading ? '上传中...' : `添加${options.title}`}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={options.accept}
          multiple
          className="hidden"
          onChange={e => handleUploadReferenceMedia(type, e.target.files)}
        />

        {items.length > 0 ? (
          usesHorizontalRail ? (
            <div className="space-y-2">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div
                  className="reference-media-rail flex gap-3 overflow-x-auto overscroll-x-contain pb-3 snap-x snap-mandatory focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/50"
                  tabIndex={0}
                  role="list"
                  aria-label={`${options.title}列表，可用鼠标滚轮或左右方向键横向滚动`}
                  onWheel={handleReferenceRailWheel}
                  onKeyDown={handleReferenceRailKeyDown}
                >
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      role="listitem"
                      className="group relative w-[230px] shrink-0 snap-start rounded-[24px] border border-white/10 bg-[#171717] p-2 shadow-[0_18px_35px_rgba(0,0,0,0.28)]"
                    >
                      <button
                        type="button"
                        onClick={() => handleRemoveReferenceMedia(type, item.id)}
                        className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-black/50 p-1.5 text-white/55 backdrop-blur hover:text-white hover:bg-black/75 transition-colors"
                        title={`删除${item.name}`}
                      >
                        <Trash2 size={12} />
                      </button>

                      <div className="overflow-hidden rounded-[18px] border border-white/10 bg-black">
                        {type === 'image' ? (
                          <button
                            type="button"
                            onClick={() => openImagePreview(item.url, item.name)}
                            className="block w-full text-left"
                          >
                            <img
                              src={item.url}
                              alt={item.name}
                              className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          </button>
                        ) : (
                          <video
                            controls
                            preload="metadata"
                            src={item.url}
                            className="h-36 w-full bg-black object-cover"
                          />
                        )}
                      </div>

                      <div className="px-1 pb-1 pt-3">
                        <p className="truncate text-sm font-medium text-white/90">{item.name}</p>
                        <p className="mt-1 text-[10px] text-white/35">
                          {REFERENCE_LABELS[type]} {index + 1}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="px-1 text-[10px] text-white/28">鼠标滚轮、拖动滚动条或左右方向键查看更多{options.title}</p>
            </div>
          ) : usesVerticalScrollableList ? (
            <div className="space-y-2">
              <div className="reference-media-list max-h-[360px] overflow-y-auto space-y-3 pr-2">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-white/10 bg-black/20 overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex shrink-0 items-center rounded-full border border-blue-400/25 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] text-blue-200">
                            {index + 1}
                          </span>
                          <p className="text-sm text-white truncate">{item.name}</p>
                        </div>
                        <p className="mt-1 text-[10px] text-white/35">{REFERENCE_LABELS[type]}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveReferenceMedia(type, item.id)}
                        className="p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="p-3">
                      <audio controls src={item.url} className="w-full h-10" />
                    </div>
                  </div>
                ))}
              </div>
              <p className="px-1 text-[10px] text-white/28">鼠标滚轮或拖动滚动条查看更多{options.title}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map(item => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-white/35">{REFERENCE_LABELS[type]}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveReferenceMedia(type, item.id)}
                      className="p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="p-3">
                    <audio controls src={item.url} className="w-full h-10" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-[12px] text-white/35">
            暂无{options.title}，可按需上传多个文件作为生成参考
          </div>
        )}
      </div>
    );
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
        {hasScene && (loadingAnimation || resolvingVersion || generatingVideo || Boolean(activeGenerationTask && (activeGenerationTask.status === 'PENDING' || activeGenerationTask.status === 'PROCESSING'))) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-2 bg-black/60 border border-white/10 rounded-lg text-white/70 text-sm backdrop-blur-sm">
              {loadingAnimation
                ? '正在同步动画数据...'
                : resolvingVersion
                  ? '正在解析历史版本...'
                  : generatingVideo
                    ? '正在创建 Seedance 视频任务...'
                    : 'Seedance 任务进行中，可稍后继续回来轮询状态...'}
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
            {storyboardReferenceList.length > 0 ? (
              <div className="space-y-3">
                {storyboardReferenceList.map(frameSet => (
                  <StoryboardReferenceCard key={frameSet.id} frameSet={frameSet} onPreview={openImagePreview} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-6 text-center text-xs text-white/30">
                当前场景暂无分镜帧集
              </div>
            )}
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

              <div className="bg-[#111111] rounded-2xl border border-white/5 p-5 space-y-5 shadow-xl">
                <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/20 text-blue-200">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white">视频制作工作台</span>
                      <p className="text-[11px] text-white/40">使用 Seedance 2.0 生成视频，结果自动沉淀为版本历史</p>
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
                      ref={directVideoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={e => handleUploadVideo(e.target.files?.[0])}
                    />
                    <button
                      onClick={() => directVideoInputRef.current?.click()}
                      disabled={!selectedAnimationId || uploadingVideo}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[11px] rounded-lg border border-white/10 flex items-center gap-1 transition-all disabled:opacity-50"
                    >
                      <UploadCloud size={12} /> {uploadingVideo ? '上传中...' : '上传现成视频'}
                    </button>
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

                    <div className="aspect-video w-full rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden relative group shadow-lg">
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
                            {currentVersionData?.generationTaskId && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReuseGenerationTaskParams(currentVersionData.generationTaskId!);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80 text-[11px]"
                                title="复用本版本的 Seedance 创作参数"
                              >
                                复用创作参数
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                directVideoInputRef.current?.click();
                              }}
                              disabled={uploadingVideo}
                              className="px-3 py-1.5 rounded-lg bg-black/70 text-white/90 border border-white/10 shadow hover:bg-black/80 text-[11px] disabled:opacity-50"
                              title="直接上传新视频版本"
                            >
                              {uploadingVideo ? '上传中...' : '上传视频版本'}
                            </button>
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
                          className="w-full h-full flex flex-col items-center justify-center gap-4 group-hover:bg-white/5 transition-colors"
                        >
                          <div className="p-6 rounded-full bg-white/5 text-white/20 group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <MonitorPlay size={48} />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-white/40 mb-1">当前片段还没有生成结果</p>
                            <p className="text-[10px] text-white/20 uppercase tracking-widest">可直接上传现成视频，或填写提示词与参考媒体生成新版本</p>
                            <button
                              type="button"
                              onClick={() => directVideoInputRef.current?.click()}
                              disabled={uploadingVideo}
                              className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[12px] border border-white/10 disabled:opacity-50"
                            >
                              {uploadingVideo ? '上传中...' : '上传现成视频'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] p-5 space-y-5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-200">
                            <Film size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-white">Seedance 视频制作 Block</h3>
                            <p className="text-[11px] text-white/45">支持图片 / 音频 / 视频参考，`generate_audio` 固定开启，`watermark` 固定关闭。</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-white/35 uppercase tracking-[0.2em]">
                          <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5">Auto Save Version</span>
                          <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5">Async Task</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">提示词</label>
                          <button
                            type="button"
                            onClick={() => setGenerationPrompt(buildDefaultVideoPrompt(activeScene))}
                            className="text-[11px] text-white/45 hover:text-white transition-colors"
                          >
                            重新带入场景信息
                          </button>
                        </div>
                        <div className="relative">
                          {!generationPrompt.trim() && (
                            <div className="pointer-events-none absolute left-4 top-4 z-[1] text-sm leading-relaxed text-white/20">
                              描述镜头构图、时序动作、氛围、运镜方式；输入 @ 快捷添加人设图、音色或分镜首尾帧...
                            </div>
                          )}
                          <div
                            ref={promptEditorRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={handlePromptEditorInput}
                            onKeyDown={handlePromptEditorKeyDown}
                            onMouseMove={handlePromptEditorMouseMove}
                            onMouseLeave={() => setHoveredPromptMention(null)}
                            onBlur={() => {
                              syncPromptFromEditor();
                            }}
                            className="w-full min-h-[180px] whitespace-pre-wrap rounded-2xl border border-white/10 bg-[#111111] px-4 py-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/40 leading-relaxed"
                          />
                          {hoveredPromptMention && (
                            <div
                              className="pointer-events-none absolute z-40 w-64 rounded-xl border border-white/10 bg-[#111] p-3 shadow-2xl"
                              style={{ left: hoveredPromptMention.x, top: hoveredPromptMention.y }}
                            >
                              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
                                {hoveredPromptMention.mention.mediaType === 'image' ? '图片预览' : '音频预览'}
                              </div>
                              {hoveredPromptMention.mention.mediaType === 'image' ? (
                                <img src={hoveredPromptMention.mention.url} className="max-h-48 w-full rounded-lg object-contain bg-black" />
                              ) : (
                                <audio controls src={hoveredPromptMention.mention.url} className="pointer-events-auto w-full h-10" />
                              )}
                              <div className="mt-2 truncate text-[11px] text-white/55">{hoveredPromptMention.mention.name}</div>
                            </div>
                          )}
                          {renderPromptAssetPicker()}
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[11px] text-white/35">
                          <span>输入 @ 可从人物图片、人物音频、当前及后三格分镜图中选择；生成时会自动替换为“图片 1 / 音频 1”。</span>
                          <span>{generationPrompt.trim().length} chars</span>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-3">
                        {renderReferenceMediaSection('image', {
                          title: '图片参考',
                          description: '可上传角色定帧、分镜首尾帧或视觉风格图。',
                          accept: 'image/*',
                          icon: <ImageIcon size={16} />,
                        })}
                        {renderReferenceMediaSection('audio', {
                          title: '音频参考',
                          description: '可上传背景音乐、声线或节奏样本，上传后可直接试听。',
                          accept: 'audio/*',
                          icon: <Music size={16} />,
                        })}
                        {renderReferenceMediaSection('video', {
                          title: '视频参考',
                          description: '可上传动作、镜头语言或节奏参考视频，上传后可直接预览。',
                          accept: 'video/*',
                          icon: <MonitorPlay size={16} />,
                        })}
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1.8fr_0.9fr]">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">生成参数</div>
                              <p className="mt-1 text-[11px] text-white/40">模型、画幅和时长放在同一块，调参更顺手。</p>
                            </div>
                          </div>

                          <div className="space-y-4 rounded-xl border border-white/8 bg-black/20 p-3">
                            <div className="space-y-3">
                              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">视频模型</div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {[
                                  { value: 'doubao-seedance-2-0-260128' as SeedanceModel, label: 'Seedance 2.0', desc: '标准质量，适合主版本制作' },
                                  { value: 'doubao-seedance-2-0-fast-260128' as SeedanceModel, label: 'Seedance 2.0 Fast', desc: '更快出结果，适合快速试稿' },
                                ].map(option => {
                                  const active = generationModel === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => setGenerationModel(option.value)}
                                      className={`rounded-xl border p-3 text-left transition-all ${
                                        active
                                          ? 'border-blue-500/60 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.12)]'
                                          : 'border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.04]'
                                      }`}
                                    >
                                      <p className="text-sm font-medium text-white">{option.label}</p>
                                      <p className="mt-1 text-[11px] text-white/40">{option.desc}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-3 border-t border-white/8 pt-3">
                              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">画面比例</div>
                              <div className="grid grid-cols-2 gap-2">
                                {(['16:9', '9:16'] as SeedanceRatio[]).map(ratio => {
                                  const active = generationRatio === ratio;
                                  return (
                                    <button
                                      key={ratio}
                                      type="button"
                                      onClick={() => setGenerationRatio(ratio)}
                                      className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                                        active
                                          ? 'border-blue-500/60 bg-blue-500/12 text-white'
                                          : 'border-white/10 bg-black/20 text-white/60 hover:border-white/25 hover:text-white'
                                      }`}
                                    >
                                      {ratio}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-3 border-t border-white/8 pt-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">视频时长</div>
                                <div className="text-sm font-semibold text-white">{generationDuration}s</div>
                              </div>
                              <input
                                type="range"
                                min={5}
                                max={15}
                                step={1}
                                value={generationDuration}
                                onChange={e => setGenerationDuration(Number(e.target.value))}
                                className="w-full accent-blue-500"
                              />
                              <div className="flex items-center justify-between text-[11px] text-white/30">
                                <span>5s</span>
                                <span>15s</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent p-4 flex flex-col justify-between gap-4">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-blue-200">
                              <Sparkles size={16} />
                              <span className="text-[10px] font-bold uppercase tracking-[0.22em]">生成设置</span>
                            </div>
                            <div className="space-y-2 text-[12px] text-white/60">
                              <div className="flex items-center justify-between gap-2">
                                <span>图片参考</span>
                                <span>{referenceMedia.image.length}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>音频参考</span>
                                <span>{referenceMedia.audio.length}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>视频参考</span>
                                <span>{referenceMedia.video.length}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>输出时长</span>
                                <span>{generationDuration}s</span>
                              </div>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">最新任务</span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                    activeGenerationTask?.status === 'SUCCEEDED'
                                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                                      : activeGenerationTask?.status === 'FAILED'
                                        ? 'border-red-500/40 bg-red-500/15 text-red-200'
                                        : activeGenerationTask
                                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-100'
                                          : 'border-white/10 bg-white/5 text-white/40'
                                  }`}
                                >
                                  {activeGenerationTask?.status || 'IDLE'}
                                </span>
                              </div>
                              {activeGenerationTask ? (
                                <div className="space-y-1 text-[11px] text-white/45">
                                  <div className="break-all">Task #{activeGenerationTask.id}{activeGenerationTask.arkTaskId ? ` · ${activeGenerationTask.arkTaskId}` : ''}</div>
                                  {activeGenerationTask.outputVersion ? (
                                    <div>已落库为版本 #{activeGenerationTask.outputVersion}</div>
                                  ) : activeGenerationTask.errorMessage ? (
                                    <div className="text-red-200/80">{activeGenerationTask.errorMessage}</div>
                                  ) : (
                                    <div>任务创建后可离开页面，稍后回来继续轮询。</div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-[11px] text-white/35">尚未创建生成任务</div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={handleGenerateVideo}
                              disabled={!canGenerateVideo}
                              className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-white/35 disabled:border-white/10 text-white text-sm font-semibold border border-blue-500/60 shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                              {generatingVideo ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                              {generatingVideo ? '正在生成视频...' : '生成并保存为新版本'}
                            </button>
                            <p className="text-[11px] text-white/35 leading-relaxed">
                              生成请求会自动轮询任务状态，完成后把结果视频保存进当前片段版本历史。
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="border border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center text-center gap-4 text-white/60">
                    <div className="p-4 rounded-full bg-white/5 text-white/20">
                      <MonitorPlay size={28} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-white font-semibold text-sm">当前场景还没有动画片段</p>
                      <p className="text-white/50 text-[12px]">先创建片段，再配置 Seedance 参考媒体和提示词</p>
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
                <span className="text-[10px] font-bold uppercase tracking-widest">当前场景还没有动画片段 · 先创建片段再生成 Seedance 视频</span>
              </div>
            ) : activeGenerationTask && (activeGenerationTask.status === 'PENDING' || activeGenerationTask.status === 'PROCESSING') ? (
              <div className="flex items-center gap-2 text-white/40">
                <Info size={14} className="text-blue-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {selectedAnimation?.name || '动画片段'} 任务进行中 · Task #{activeGenerationTask.id} 可稍后继续轮询
                </span>
              </div>
            ) : displayClipUrl ? (
              <div className="flex items-center gap-2 text-white/30">
                <CheckCircle2 size={14} className="text-green-500/50" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {selectedAnimation?.name || '动画片段'} 已生成当前版本 · 可继续追加新版本
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white/40">
                <Info size={14} className="text-amber-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {selectedAnimation?.name || '动画片段'} 暂无视频 · 填写参数后即可生成
                </span>
              </div>
            )}
          </div>
        </div>

        {isCommentPanelCollapsed ? (
          <button
            type="button"
            onClick={() => setIsCommentPanelCollapsed(false)}
            className="w-12 border-l border-white/5 bg-[#121212] flex flex-col items-center justify-center gap-3 text-white/40 hover:bg-[#171717] hover:text-white transition-colors"
            title="展开评论区"
          >
            <ChevronLeft size={16} />
            <MessageSquare size={16} />
            {activeSceneComments.length > 0 && (
              <span className="min-w-5 px-1.5 py-0.5 rounded-full bg-blue-500/15 text-[10px] font-bold text-blue-100 border border-blue-400/30">
                {activeSceneComments.length}
              </span>
            )}
          </button>
        ) : (
          <>
            <div
              className={`w-2 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors ${isResizingRight ? 'bg-white/20' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                setIsResizingRight(true);
              }}
            />

            <div
              style={{ width: rightPanelWidth }}
              className="border-l border-white/5 bg-[#121212] flex flex-col min-w-[260px] max-w-[520px]"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-bold text-white/40 uppercase tracking-widest">修改历史与讨论</span>
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-white/20" />
                  <button
                    type="button"
                    onClick={() => setIsCommentPanelCollapsed(true)}
                    className="p-1 rounded-lg text-white/35 hover:text-white hover:bg-white/5 transition-colors"
                    title="收起评论区"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
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
