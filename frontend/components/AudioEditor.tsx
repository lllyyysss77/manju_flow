import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Character, Episode, Scene } from '../types';
import { fileApi, audioApi, commentApi, AudioVersion as ApiAudioVersion, SceneAudio as ApiSceneAudio, animationApi, getFileUrl, downloadFile, normalizeFileKey, characterApi } from '../api';
import {
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Info,
  Play,
  Pause,
  Mic2,
  Waves,
  Volume2,
  Type,
  History,
  Film,
  MonitorPlay,
  Camera,
  Plus,
  Pencil,
  Trash2,
  Download,
  CheckCircle2,
  Sparkles,
  SlidersHorizontal,
  UserRound,
  UploadCloud
} from 'lucide-react';
import { useSceneComments } from './useSceneComments';
import { CommentItem } from './CommentItem';
import { CommentInput } from './CommentInput';
import { DEFAULT_SCENE_THUMB, STATUS_MAP } from '../constants';
import { Toast, useToast } from './Toast';
import { ChapterTabBar } from './ChapterTabBar';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface AudioEditorProps {
  bookId?: number;
  episode?: Episode;
  episodes?: Episode[];
  // 跨模块状态同步
  initialChapterId?: number | null;
  initialSceneId?: number | null;
  onActiveChapterChange?: (chapterId: number | null) => void;
  onActiveSceneChange?: (sceneId: number | null) => void;
}

type AudioVersion = ApiAudioVersion;
type SceneAudioTrack = ApiSceneAudio;
type EmotionMode = 'same_as_reference' | 'emotion_prompt' | 'emotion_vector';
type EmotionVectorState = {
  happy: number;
  angry: number;
  sad: number;
  fear: number;
  disgust: number;
  melancholic: number;
  surprised: number;
  calm: number;
};

const DEFAULT_EMOTION_VECTOR: EmotionVectorState = {
  happy: 0,
  angry: 0,
  sad: 0,
  fear: 0,
  disgust: 0,
  melancholic: 0,
  surprised: 0,
  calm: 1,
};

const EMOTION_VECTOR_FIELDS: Array<{ key: keyof EmotionVectorState; label: string }> = [
  { key: 'happy', label: '高兴' },
  { key: 'angry', label: '愤怒' },
  { key: 'sad', label: '悲伤' },
  { key: 'fear', label: '恐惧' },
  { key: 'disgust', label: '反感' },
  { key: 'melancholic', label: '低落' },
  { key: 'surprised', label: '惊讶' },
  { key: 'calm', label: '平静' },
];

// 格式化时间 (秒 -> mm:ss)
const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const AudioEditor: React.FC<AudioEditorProps> = ({
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
        audios: scene.audios || [],
      }));

    return (sourceChapters || []).map(ch => ({
      ...ch,
      title: ch.title || `第 ${ch.index || 1} 章`,
      scenes: normalizeScenes(ch.scenes || []),
    }));
  }, [sourceChapters]);

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

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const referenceAudioInputRef = useRef<HTMLInputElement>(null);
  const emotionAudioInputRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const { toast, showToast, hideToast } = useToast();
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [animationPreviewMap, setAnimationPreviewMap] = useState<Record<number, { url?: string; version?: number }>>({});
  const [audioTracks, setAudioTracks] = useState<SceneAudioTrack[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(null);
  const [versionMap, setVersionMap] = useState<Record<number, AudioVersion[]>>({});
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingReferenceAudio, setUploadingReferenceAudio] = useState(false);
  const [uploadingEmotionAudio, setUploadingEmotionAudio] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [resolvingVersion, setResolvingVersion] = useState(false);
  const [audioDragOver, setAudioDragOver] = useState(false);
  const [previewPlayingVersion, setPreviewPlayingVersion] = useState<number | null>(null);
  const [creatingTrack, setCreatingTrack] = useState(false);
  const [newTrackRole, setNewTrackRole] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [referenceSource, setReferenceSource] = useState<'character' | 'upload'>('character');
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
  const [uploadedReferenceAudio, setUploadedReferenceAudio] = useState<{ key: string; name: string; url: string } | null>(null);
  const [emotionMode, setEmotionMode] = useState<EmotionMode>('same_as_reference');
  const [emotionPromptAudio, setEmotionPromptAudio] = useState<{ key: string; name: string; url: string } | null>(null);
  const [emotionAlpha, setEmotionAlpha] = useState(1);
  const [emotionVector, setEmotionVector] = useState<EmotionVectorState>(DEFAULT_EMOTION_VECTOR);
  const [ttsText, setTtsText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SceneAudioTrack | null>(null);
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
    async (audioId: number, versions: AudioVersion[]) => {
      setResolvingVersion(true);
      try {
        const resolved = versions.map(v => ({
          ...v,
          audioUrl: getFileUrl(v.audioUrl),
        }));
        setVersionMap(prev => ({ ...prev, [audioId]: resolved }));
        return resolved;
      } finally {
        setResolvingVersion(false);
      }
    },
    []
  );

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
  } = useSceneComments(activeScene?.id, 'audio');
  const activeSceneComments = activeScene?.id ? sceneCommentList : [];
  const hasScene = sortedScenes.length > 0;

  useEffect(() => {
    if (!activeScene?.id) {
      setAudioTracks([]);
      setVersionMap({});
      setResolvingVersion(false);
      setSelectedAudioId(null);
      setVersionMenuOpen(false);
      setPreviewPlayingVersion(null);
      setCreatingTrack(false);
      setNewTrackRole('');
      setAudioError(null);
      setLoadingAudio(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsAudioPlaying(false);
      setAudioCurrentTime(0);
      setAudioDuration(0);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
      return;
    }
    let cancelled = false;
    setAudioTracks([]);
    setVersionMap({});
    setResolvingVersion(false);
    setSelectedAudioId(null);
    setVersionMenuOpen(false);
    setPreviewPlayingVersion(null);
    setCreatingTrack(false);
    setNewTrackRole('');
    setAudioError(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    const loadTracks = async () => {
      setLoadingAudio(true);
      try {
        const res = await audioApi.list(activeScene.id);
        if (cancelled) return;
        const tracks = (res.data || []).sort((a, b) => a.index - b.index);
        setAudioTracks(tracks);
        const firstId = tracks[0]?.id ?? null;
        setSelectedAudioId(firstId);
        setRoleDraft(tracks[0]?.role || '');
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load audio tracks', err);
        setAudioError(err instanceof Error ? err.message : '加载音轨失败');
        showToast('音频数据加载失败', 'error');
      } finally {
        if (!cancelled) setLoadingAudio(false);
      }
    };
    loadTracks();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id]);

  useEffect(() => {
    if (!activeScene?.id) return;
    let cancelled = false;
    const loadPreview = async () => {
      try {
        const res = await animationApi.list(activeScene.id);
        if (cancelled) return;
        const first = (res.data || []).sort((a, b) => a.index - b.index)[0];
        if (!first?.animationUrl) {
          setAnimationPreviewMap(prev => ({ ...prev, [activeScene.id]: { url: undefined, version: undefined } }));
          return;
        }
        const resolved = getFileUrl(first.animationUrl);
        if (!cancelled) {
          setAnimationPreviewMap(prev => ({
            ...prev,
            [activeScene.id]: { url: resolved || undefined, version: first.animationVersion },
          }));
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load animation preview', err);
      }
    };
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [activeScene?.id]);

  useEffect(() => {
    if (!bookId) {
      setCharacters([]);
      setSelectedCharacterId(null);
      return;
    }
    let cancelled = false;
    const loadCharacters = async () => {
      setLoadingCharacters(true);
      try {
        const res = await characterApi.list(bookId);
        if (cancelled) return;
        const list = (res.data || []).sort((a, b) => a.index - b.index);
        setCharacters(list);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load characters', err);
        showToast('角色音色样本加载失败', 'error');
      } finally {
        if (!cancelled) setLoadingCharacters(false);
      }
    };
    loadCharacters();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (!activeScene?.id || !selectedAudioId) {
      setVersionMenuOpen(false);
      return;
    }
    // 确保 selectedAudioId 属于当前场景的 audioTracks 列表
    // 避免场景切换时使用旧场景的 audio ID 调用新场景的 API
    // 额外检查 track.sceneId 确保列表确实属于当前场景（防止状态异步更新问题）
    const currentTrack = audioTracks.find(t => t.id === selectedAudioId);
    if (!currentTrack || currentTrack.sceneId !== activeScene.id) {
      return;
    }
    let cancelled = false;
    setAudioError(null);
    setPreviewPlayingVersion(null);
    const loadVersions = async () => {
      setResolvingVersion(true);
      try {
        const versionsRes = await audioApi.listVersions(activeScene.id, selectedAudioId);
        if (cancelled) return;
        await resolveVersions(selectedAudioId, versionsRes.data || []);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load audio versions', err);
        setAudioError(err instanceof Error ? err.message : '加载音频数据失败');
        showToast('音频数据加载失败', 'error');
      } finally {
        if (!cancelled) setResolvingVersion(false);
      }
    };
    loadVersions();
    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsAudioPlaying(false);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
    };
  }, [activeScene?.id, selectedAudioId, audioTracks, resolveVersions]);

  // 获取场景评论数
  useEffect(() => {
    if (!bookId) return;
    commentApi.getSceneCommentCounts(bookId, 'audio').then(res => {
      setSceneCommentCounts(res.data || {});
      setSceneUnresolvedCounts(res.unresolvedCounts || {});
    }).catch(err => {
      console.error('Failed to fetch comment counts', err);
    });
  }, [bookId]);

  useEffect(() => {
    const current = audioTracks.find(t => t.id === selectedAudioId);
    setRoleDraft(current?.role || '');
  }, [selectedAudioId, audioTracks]);

  const selectedTrack = useMemo(
    () => audioTracks.find(t => t.id === selectedAudioId) || null,
    [audioTracks, selectedAudioId]
  );

  const charactersWithVoice = useMemo(
    () => characters.filter(char => Boolean(normalizeFileKey(char.voiceAudioUrl).key)),
    [characters]
  );

  const selectedCharacter = useMemo(
    () => charactersWithVoice.find(char => char.id === selectedCharacterId) || null,
    [charactersWithVoice, selectedCharacterId]
  );

  useEffect(() => {
    if (!selectedTrack) {
      setSelectedCharacterId(null);
      setTtsText('');
      setEmotionMode('same_as_reference');
      setEmotionPromptAudio(null);
      setEmotionAlpha(1);
      setEmotionVector(DEFAULT_EMOTION_VECTOR);
      return;
    }

    setTtsText(activeScene?.dialogue || '');
    setEmotionMode('same_as_reference');
    setEmotionPromptAudio(null);
    setEmotionAlpha(1);
    setEmotionVector(DEFAULT_EMOTION_VECTOR);

    if (referenceSource === 'upload' && uploadedReferenceAudio) {
      return;
    }

    const role = (selectedTrack.role || '').trim();
    const matchedCharacter = charactersWithVoice.find(
      char => char.name.trim() === role
    );

    if (matchedCharacter) {
      setReferenceSource('character');
      setSelectedCharacterId(matchedCharacter.id);
      return;
    }

    if (selectedCharacterId && charactersWithVoice.some(char => char.id === selectedCharacterId)) {
      return;
    }

    if (charactersWithVoice.length === 1) {
      setReferenceSource('character');
      setSelectedCharacterId(charactersWithVoice[0].id);
      return;
    }

    setSelectedCharacterId(null);
  }, [
    activeScene?.dialogue,
    charactersWithVoice,
    selectedTrack?.id,
    selectedTrack?.role,
  ]);

  const currentVersions = selectedTrack ? versionMap[selectedTrack.id] || [] : [];
  const normalizedTrackVersion =
    selectedTrack?.audioVersion && selectedTrack.audioVersion > 0 ? selectedTrack.audioVersion : undefined;
  const currentVersionNumber = normalizedTrackVersion ?? currentVersions[0]?.version ?? null;
  const currentVersionData =
    (currentVersionNumber ? currentVersions.find(v => v.version === currentVersionNumber) : undefined) ||
    currentVersions[0];
  const displayAudioUrl = currentVersionData?.audioUrl || selectedTrack?.audioUrl;
  const displayVideoUrl = activeScene?.id ? animationPreviewMap[activeScene.id]?.url : undefined;
  const currentVersionLabel = currentVersionNumber ?? '—';
  const hasAudio = Boolean(selectedTrack && (displayAudioUrl || currentVersions.length > 0));
  const playbackVideoUrl = displayVideoUrl ? getFileUrl(displayVideoUrl) || undefined : undefined;
  const playbackAudioUrl = displayAudioUrl ? getFileUrl(displayAudioUrl) || undefined : undefined;

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.load();
    setIsVideoPlaying(false);
  }, [playbackVideoUrl, activeScene?.id]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.load();
    setIsAudioPlaying(false);
  }, [playbackAudioUrl, activeScene?.id, selectedAudioId]);

  useEffect(() => {
    if (!hasAudio) setVersionMenuOpen(false);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewPlayingVersion(null);
  }, [hasAudio, activeScene?.id, selectedAudioId]);

  const handlePlayVersion = async (version: number) => {
    if (!activeScene?.id || !selectedTrack) return;
    const versionData = currentVersions.find(v => v.version === version);
    if (!versionData?.audioUrl) {
      showToast('该版本缺少音频链接，无法播放', 'error');
      return;
    }
    const audioUrl = getFileUrl(versionData.audioUrl);
    if (!audioUrl) {
      showToast('无法解析音频链接', 'error');
      return;
    }
    try {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
        previewAudioRef.current.onended = () => setPreviewPlayingVersion(null);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsAudioPlaying(false);
      const player = previewAudioRef.current;
      player.pause();
      player.currentTime = 0;
      player.src = audioUrl;
      const playPromise = player.play();
      setPreviewPlayingVersion(version);
      if (playPromise?.catch) {
        playPromise.catch(err => {
          console.error('Preview play failed', err);
          setPreviewPlayingVersion(null);
          showToast('无法播放该音频版本', 'error');
        });
      }
    } catch (err) {
      console.error('Preview play failed', err);
      setPreviewPlayingVersion(null);
      showToast('无法播放该音频版本', 'error');
    }
  };

  const handleSetCurrentVersion = async (version: number) => {
    if (!activeScene?.id || !selectedTrack) return;
    setLoadingAudio(true);
    setAudioError(null);
    try {
      const updated = await audioApi.revert(activeScene.id, selectedTrack.id, version);
      setAudioTracks(prev =>
        prev.map(track =>
          track.id === selectedTrack.id
            ? { ...track, ...updated, audioUrl: updated.audioUrl }
            : track
        )
      );
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
      setPreviewPlayingVersion(null);
      const versionsRes = await audioApi.listVersions(activeScene.id, selectedTrack.id);
      await resolveVersions(selectedTrack.id, versionsRes.data || []);
      showToast(`版本 #${version} 已设为交付版本`, 'success');
    } catch (err) {
      console.error('Revert audio failed', err);
      setAudioError(err instanceof Error ? err.message : '回滚失败，请重试');
      showToast('回滚失败，请重试', 'error');
    } finally {
      setLoadingAudio(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsAudioPlaying(false);
      setVersionMenuOpen(false);
    }
  };

  const selectedReferenceKey = useMemo(() => {
    if (referenceSource === 'upload') {
      return uploadedReferenceAudio?.key || null;
    }
    return normalizeFileKey(selectedCharacter?.voiceAudioUrl).key;
  }, [referenceSource, selectedCharacter?.voiceAudioUrl, uploadedReferenceAudio?.key]);

  const applyNewVersion = useCallback(
    async (version: AudioVersion, successMessage: string) => {
      if (!activeScene?.id || !selectedTrack) return;
      setAudioTracks(prev =>
        prev.map(track =>
          track.id === selectedTrack.id
            ? { ...track, audioUrl: version.audioUrl, audioVersion: version.version }
            : track
        )
      );
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
      setPreviewPlayingVersion(null);
      const versionsRes = await audioApi.listVersions(activeScene.id, selectedTrack.id);
      await resolveVersions(selectedTrack.id, versionsRes.data || []);
      showToast(successMessage, 'success');
    },
    [activeScene?.id, resolveVersions, selectedTrack, showToast]
  );

  const handleUploadReferenceAudio = async (file?: File | null) => {
    if (!file) return;
    setUploadingReferenceAudio(true);
    try {
      const uploaded = await fileApi.upload(file, 'private');
      const url = getFileUrl(uploaded.key);
      setUploadedReferenceAudio({
        key: uploaded.key,
        name: uploaded.originalName || file.name,
        url,
      });
      setReferenceSource('upload');
      showToast('已上传自定义音色样本', 'success');
    } catch (err) {
      console.error('Upload reference audio failed', err);
      showToast('上传音色样本失败，请重试', 'error');
    } finally {
      setUploadingReferenceAudio(false);
      if (referenceAudioInputRef.current) referenceAudioInputRef.current.value = '';
    }
  };

  const handleUploadEmotionAudio = async (file?: File | null) => {
    if (!file) return;
    setUploadingEmotionAudio(true);
    try {
      const uploaded = await fileApi.upload(file, 'private');
      const url = getFileUrl(uploaded.key);
      setEmotionPromptAudio({
        key: uploaded.key,
        name: uploaded.originalName || file.name,
        url,
      });
      setEmotionMode('emotion_prompt');
      showToast('已上传情感参考音频', 'success');
    } catch (err) {
      console.error('Upload emotion audio failed', err);
      showToast('上传情感参考失败，请重试', 'error');
    } finally {
      setUploadingEmotionAudio(false);
      if (emotionAudioInputRef.current) emotionAudioInputRef.current.value = '';
    }
  };

  const handleGenerateAudio = async () => {
    if (!activeScene?.id || !selectedTrack) return;
    const text = ttsText.trim();
    if (!text) {
      showToast('请输入需要朗读的文本', 'error');
      return;
    }
    if (!selectedReferenceKey) {
      showToast('请先选择声音参考音频', 'error');
      return;
    }
    if (emotionMode === 'emotion_prompt' && !emotionPromptAudio?.key) {
      showToast('请先上传情感参考音频', 'error');
      return;
    }

    setGeneratingAudio(true);
    setAudioError(null);
    try {
      const nextVector =
        emotionMode === 'emotion_vector'
          ? EMOTION_VECTOR_FIELDS.map(field => emotionVector[field.key])
          : undefined;
      const version = await audioApi.generate(activeScene.id, selectedTrack.id, {
        text,
        referenceAudioKey: selectedReferenceKey,
        emotionPromptKey: emotionMode === 'emotion_prompt' ? emotionPromptAudio?.key : undefined,
        emotionVector: nextVector,
        emotionAlpha: emotionMode === 'same_as_reference' ? undefined : emotionAlpha,
      });
      await applyNewVersion(version, 'AI 音频已生成并保存为新版本');
    } catch (err) {
      console.error('Generate audio failed', err);
      setAudioError(err instanceof Error ? err.message : '音频生成失败');
      showToast(err instanceof Error ? err.message : '音频生成失败，请重试', 'error');
    } finally {
      setGeneratingAudio(false);
      setVersionMenuOpen(false);
      setIsAudioPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  };

  const handleUploadAudio = async (file?: File | null) => {
    if (!file || !activeScene?.id) return;
    if (!selectedTrack) {
      showToast('请先创建并选择一个音轨', 'error');
      return;
    }
    setUploadingAudio(true);
    setAudioError(null);
    try {
      const uploaded = await fileApi.upload(file, 'private');
      const rawUrl = uploaded.key || uploaded.url;
      const version = await audioApi.upload(activeScene.id, selectedTrack.id, rawUrl || '');
      await applyNewVersion(version, '新音频版本已上传');
    } catch (err) {
      console.error('Upload audio failed', err);
      setAudioError(err instanceof Error ? err.message : '上传失败，请重试');
      showToast('上传失败，请重试', 'error');
    } finally {
      setUploadingAudio(false);
      setVersionMenuOpen(false);
      setIsAudioPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  const handleAudioDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadingAudio) {
      setAudioDragOver(false);
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUploadAudio(file);
    }
    setAudioDragOver(false);
  };

  const toggleVideoPlay = () => {
    if (!videoRef.current || !playbackVideoUrl) return;
    if (isVideoPlaying) {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsVideoPlaying(true)).catch(err => {
        console.error('Video play failed', err);
        showToast('无法播放参考动画，请检查链接', 'error');
      });
    }
  };

  const toggleAudioPlay = () => {
    if (!audioRef.current || !playbackAudioUrl) return;
    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
        setPreviewPlayingVersion(null);
      }
      audioRef.current.play().then(() => setIsAudioPlaying(true)).catch(err => {
        console.error('Audio play failed', err);
        showToast('无法播放该音频版本', 'error');
      });
    }
  };

  const handleCreateTrack = async () => {
    if (!activeScene?.id) return;
    const role = (newTrackRole || '').trim() || `音轨 ${audioTracks.length + 1}`;
    const nextIndex = audioTracks.length
      ? Math.max(...audioTracks.map(t => t.index)) + 1
      : 1;
    setLoadingAudio(true);
    setAudioError(null);
    try {
      const track = await audioApi.create(activeScene.id, { role, index: nextIndex });
      const nextTracks = [...audioTracks, track].sort((a, b) => a.index - b.index);
      setAudioTracks(nextTracks);
      setSelectedAudioId(track.id);
      setRoleDraft(track.role || role);
      setCreatingTrack(false);
      setNewTrackRole('');
      setVersionMenuOpen(false);
      showToast('已创建新音轨，上传音频以开始制作', 'success');
    } catch (err) {
      console.error('Create audio track failed', err);
      setAudioError(err instanceof Error ? err.message : '创建音轨失败');
      showToast('创建音轨失败，请重试', 'error');
    } finally {
      setLoadingAudio(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!activeScene?.id || !selectedTrack) return;
    const role = roleDraft.trim();
    if (!role) {
      showToast('请输入音轨名称', 'error');
      return;
    }
    if (role === selectedTrack.role) return;
    setLoadingAudio(true);
    setAudioError(null);
    try {
      const updated = await audioApi.update(activeScene.id, selectedTrack.id, { role });
      setAudioTracks(prev =>
        prev.map(track => (track.id === selectedTrack.id ? { ...track, ...updated } : track))
      );
      showToast('音轨名称已更新', 'success');
    } catch (err) {
      console.error('Update audio track failed', err);
      setAudioError(err instanceof Error ? err.message : '更新音轨失败');
      showToast('更新音轨失败，请重试', 'error');
    } finally {
      setLoadingAudio(false);
    }
  };

  const handleDeleteTrack = async (audioId: number) => {
    if (!activeScene?.id) return;
    const target = audioTracks.find(t => t.id === audioId);
    if (!target) return;
    setLoadingAudio(true);
    setAudioError(null);
    try {
      await audioApi.delete(activeScene.id, audioId);
      const nextTracks = audioTracks.filter(t => t.id !== audioId);
      setAudioTracks(nextTracks);
      setVersionMap(prev => {
        const copy = { ...prev };
        delete copy[audioId];
        return copy;
      });
      setVersionMenuOpen(false);
      setPreviewPlayingVersion(null);
      const nextId = nextTracks[0]?.id ?? null;
      setSelectedAudioId(nextId);
      setRoleDraft(nextTracks.find(t => t.id === nextId)?.role || '');
      showToast('音轨已删除', 'success');
    } catch (err) {
      console.error('Delete audio track failed', err);
      setAudioError(err instanceof Error ? err.message : '删除音轨失败');
      showToast('删除音轨失败，请重试', 'error');
    } finally {
      setLoadingAudio(false);
      setDeleteTarget(null);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsAudioPlaying(false);
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

  const selectedReferencePreviewUrl =
    referenceSource === 'upload'
      ? uploadedReferenceAudio?.url
      : getFileUrl(selectedCharacter?.voiceAudioUrl) || undefined;
  const canGenerateAudio =
    Boolean(selectedTrack) &&
    Boolean(selectedReferenceKey) &&
    Boolean(ttsText.trim()) &&
    !generatingAudio &&
    !uploadingReferenceAudio &&
    !uploadingEmotionAudio &&
    (emotionMode !== 'emotion_prompt' || Boolean(emotionPromptAudio?.key));

  const renderVoiceStudioCard = () => (
    <div className="bg-[#0b0b0b] border border-white/5 rounded-xl p-5 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-600/15 text-blue-300">
            <Sparkles size={18} />
          </div>
          <div>
            <h5 className="text-sm font-semibold text-white">克隆工作室</h5>
            <p className="text-[11px] text-white/45">参考人设音色、补充情感控制并生成音轨，结果会自动写入历史版本。</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => audioInputRef.current?.click()}
          disabled={uploadingAudio || generatingAudio}
          className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] text-white/75 transition-all disabled:opacity-50"
        >
          {uploadingAudio ? '上传中...' : '上传现成音频'}
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">声音参考音频</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => referenceAudioInputRef.current?.click()}
              disabled={uploadingReferenceAudio}
              className={`px-2.5 py-1 rounded-full border text-[10px] transition-all ${
                referenceSource === 'upload'
                  ? 'border-blue-500/50 bg-blue-500/15 text-blue-100'
                  : 'border-white/10 bg-white/5 text-white/50 hover:text-white/70'
              }`}
            >
              {uploadingReferenceAudio ? '上传中...' : '上传自定义'}
            </button>
            {uploadedReferenceAudio && (
              <button
                type="button"
                onClick={() => {
                  setReferenceSource('character');
                  setUploadedReferenceAudio(null);
                }}
                className="text-[10px] text-white/35 hover:text-white/60 transition-colors"
              >
                清除自定义
              </button>
            )}
          </div>
        </div>
        <input
          ref={referenceAudioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={e => handleUploadReferenceAudio(e.target.files?.[0])}
        />

        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 space-y-4">
          {charactersWithVoice.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {charactersWithVoice.map(character => {
                const isSelected = referenceSource === 'character' && selectedCharacterId === character.id;
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() => {
                      setReferenceSource('character');
                      setSelectedCharacterId(character.id);
                    }}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500/60 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.12)]'
                        : 'border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-500/15 text-blue-200' : 'bg-white/5 text-white/45'}`}>
                          <UserRound size={14} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{character.name}</p>
                          <p className="text-[11px] text-white/35">已同步大纲人设音色</p>
                        </div>
                      </div>
                      {selectedTrack?.role?.trim() === character.name.trim() && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-500/30">
                          音轨匹配
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-[12px] text-white/45">
              {loadingCharacters ? '正在读取大纲人设中的音色样本...' : '大纲人设里还没有可用音色样本，可以先去上传，或直接在这里补一个自定义参考音频。'}
            </div>
          )}

          {uploadedReferenceAudio && (
            <button
              type="button"
              onClick={() => setReferenceSource('upload')}
              className={`w-full rounded-xl border p-3 text-left transition-all ${
                referenceSource === 'upload'
                  ? 'border-blue-500/60 bg-blue-500/10'
                  : 'border-white/10 bg-black/20 hover:border-white/25'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${referenceSource === 'upload' ? 'bg-blue-500/15 text-blue-200' : 'bg-white/5 text-white/45'}`}>
                  <UploadCloud size={14} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{uploadedReferenceAudio.name}</p>
                  <p className="text-[11px] text-white/35">自定义上传的音色样本</p>
                </div>
              </div>
            </button>
          )}

          {selectedReferencePreviewUrl ? (
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[11px] text-white/55">
                  当前使用：
                  {referenceSource === 'upload'
                    ? uploadedReferenceAudio?.name || '自定义音色'
                    : selectedCharacter?.name || '角色音色'}
                </span>
                <span className="text-[10px] text-white/30">
                  {referenceSource === 'upload' ? '自定义参考' : '人设联动'}
                </span>
              </div>
              <audio controls src={selectedReferencePreviewUrl} className="w-full h-10" />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-[12px] text-white/40">
              请选择一个角色音色，或上传自定义参考音频
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">朗读文本</label>
        <textarea
          value={ttsText}
          onChange={e => setTtsText(e.target.value)}
          placeholder="输入当前音轨需要生成的台词、旁白或环境播报文本..."
          className="w-full min-h-[140px] rounded-2xl border border-white/10 bg-[#111111] px-4 py-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none leading-relaxed"
        />
        <div className="flex items-center justify-between gap-3 text-[11px] text-white/35">
          <span>可按音轨拆分对白；当前场景台词已自动带入，方便直接改写。</span>
          <button
            type="button"
            onClick={() => setTtsText(activeScene?.dialogue || '')}
            className="text-white/50 hover:text-white transition-colors"
          >
            重新带入场景台词
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-amber-300" />
          <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">情感控制</label>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {[
            { mode: 'same_as_reference' as EmotionMode, label: '沿用音色情绪', desc: '直接使用参考音频中的表达方式' },
            { mode: 'emotion_prompt' as EmotionMode, label: '情感参考音频', desc: '额外上传一段情绪样本' },
            { mode: 'emotion_vector' as EmotionMode, label: '情感向量', desc: '手动混合 8 维情绪强度' },
          ].map(option => {
            const active = emotionMode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => setEmotionMode(option.mode)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  active
                    ? 'border-blue-500/60 bg-blue-500/10 text-white'
                    : 'border-white/10 bg-black/20 text-white/65 hover:border-white/25'
                }`}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className="mt-1 text-[11px] text-white/40">{option.desc}</div>
              </button>
            );
          })}
        </div>

        {emotionMode === 'emotion_prompt' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-white/55">上传目标情感样本，系统会把情绪风格混入新音频。</span>
              <button
                type="button"
                onClick={() => emotionAudioInputRef.current?.click()}
                disabled={uploadingEmotionAudio}
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] text-white/75 disabled:opacity-50"
              >
                {uploadingEmotionAudio ? '上传中...' : '上传情感音频'}
              </button>
            </div>
            <input
              ref={emotionAudioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={e => handleUploadEmotionAudio(e.target.files?.[0])}
            />
            {emotionPromptAudio ? (
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm text-white">{emotionPromptAudio.name}</span>
                  <button
                    type="button"
                    onClick={() => setEmotionPromptAudio(null)}
                    className="text-[10px] text-white/35 hover:text-white/60 transition-colors"
                  >
                    清除
                  </button>
                </div>
                <audio controls src={emotionPromptAudio.url} className="w-full h-10" />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-[12px] text-white/40">
                上传一段目标语气，例如平静旁白、激动对白或压抑低声。
              </div>
            )}
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
                <span>情感强度</span>
                <span>{emotionAlpha.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={emotionAlpha}
                onChange={e => setEmotionAlpha(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}

        {emotionMode === 'emotion_vector' && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {EMOTION_VECTOR_FIELDS.map(field => (
                <div key={field.key}>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
                    <span>{field.label}</span>
                    <span>{emotionVector[field.key].toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={emotionVector[field.key]}
                    onChange={e =>
                      setEmotionVector(prev => ({
                        ...prev,
                        [field.key]: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
                <span>情感强度</span>
                <span>{emotionAlpha.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={emotionAlpha}
                onChange={e => setEmotionAlpha(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-white/40">
          {selectedTrack
            ? `${selectedTrack.role || '当前音轨'} 的生成结果会立即成为当前版本，并自动保留历史记录。`
            : '选择音轨后即可开始合成。'}
        </div>
        <button
          type="button"
          onClick={handleGenerateAudio}
          disabled={!canGenerateAudio}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white text-sm font-semibold border border-blue-500/60 shadow-lg transition-all flex items-center gap-2"
        >
          <Sparkles size={15} />
          {generatingAudio ? '正在生成新音频...' : hasAudio ? '生成新版本' : '生成第一版'}
        </button>
      </div>
    </div>
  );

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

      {/* 顶部：章节选择 + 场景切换（与动画保持一致） */}
      <div className="border-b border-white/5 bg-[#141414]">
        <ChapterTabBar
          chapters={normalizedChapters}
          activeChapterId={activeChapterId}
          onSelectChapter={(chapterId) => {
            setActiveChapterId(chapterId);
            setActiveSceneIndex(0);
            setIsVideoPlaying(false);
            setIsAudioPlaying(false);
          }}
        />
        <div className="h-20 border-t border-white/10 bg-[#161616] flex items-center px-4 gap-2 overflow-x-auto">
          {sortedScenes.length === 0 ? (
            <div className="text-white/30 text-xs px-2">该章节暂无场景</div>
          ) : (
            sortedScenes.map((scene, idx) => {
              const displayNumber = idx + 1;
              const thumb = getFileUrl(scene.thumbnailUrl) || DEFAULT_SCENE_THUMB;
              return (
              <button
                key={scene.id}
                onClick={() => {
                  setActiveSceneIndex(idx);
                  setIsVideoPlaying(false);
                  setIsAudioPlaying(false);
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
                    <Mic2 size={16} className="text-white/10" />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="p-1 rounded bg-black/50 border border-white/10">
                      <Volume2 size={10} className="text-amber-300" />
                    </div>
                  </div>
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
        <DeleteConfirmDialog
          isOpen={!!deleteTarget}
          title="删除音轨"
          message="音轨「{name}」的所有版本都会被清空，确认继续？"
          itemName={deleteTarget?.role || '未命名音轨'}
          onConfirm={() => deleteTarget && handleDeleteTrack(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
        {hasScene && audioError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
            <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-100 text-sm shadow-xl">
              音频数据加载失败：{audioError}
            </div>
          </div>
        )}
        {hasScene && (loadingAudio || (resolvingVersion && selectedTrack)) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-2 bg-black/60 border border-white/10 rounded-lg text-white/70 text-sm backdrop-blur-sm">
              {loadingAudio ? '正在同步音轨数据...' : '正在解析历史版本...'}
            </div>
          </div>
        )}
        {!hasScene ? (
          <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
            该章节暂无场景，先去剧本阶段创建场景后再上传音频
          </div>
        ) : (
          <>
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
                "{activeScene?.description || '此镜头暂无描述，请补充。'}"
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4 text-orange-400">
              <Camera size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">镜头/运镜</h3>
            </div>
            <p className="text-sm text-white/60 font-medium px-1">
              {activeScene?.cameraMovement || '未指定镜头类型'}
            </p>
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

          <section>
            <div className="flex items-center gap-2 mb-4 text-blue-400">
              <Film size={14} />
              <h3 className="text-xs font-bold uppercase tracking-widest">动画参考</h3>
            </div>
            <div className="aspect-video w-full rounded-xl border border-white/10 bg-black overflow-hidden relative group">
                {playbackVideoUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      src={playbackVideoUrl}
                      className="w-full h-full object-contain"
                      onPlay={() => setIsVideoPlaying(true)}
                      onPause={() => setIsVideoPlaying(false)}
                      onClick={toggleVideoPlay}
                    />
                    {!isVideoPlaying && (
                      <div
                        className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer"
                        onClick={toggleVideoPlay}
                      >
                        <div className="p-4 rounded-full bg-blue-600 text-white shadow-lg group-hover:scale-105 transition-transform">
                          <Play fill="currentColor" size={24} />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white/30">
                    <div className="p-4 rounded-full bg-white/5 text-white/20">
                      <MonitorPlay size={28} />
                    </div>
                    <p className="text-xs text-white/50">暂无动画片段</p>
                    <p className="text-[10px] uppercase tracking-widest text-white/30">完成动画后可对齐口型节奏</p>
                  </div>
                )}
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

          {/* 中间：动画参考 + 音频版本管理 */}
          <div className="flex-1 flex flex-col bg-[#0a0a0a]">
            <div className="flex-1 p-8 overflow-y-auto">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-white flex items-center gap-3">
                    场景 {activeSceneIndex + 1} 音频后期
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
                  audioDragOver ? 'border-blue-500/60 bg-blue-900/20' : 'border-white/5'
                }`}
                onDragOver={e => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setAudioDragOver(true);
                }}
                onDragEnter={e => {
                  e.preventDefault();
                  setAudioDragOver(true);
                }}
                onDragLeave={() => setAudioDragOver(false)}
                onDrop={handleAudioDrop}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
                      <Waves size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">音频版本管理</h4>
                      <p className="text-[11px] text-white/40">
                        {selectedTrack
                          ? `音轨：${selectedTrack.role || '未命名'} · 当前版本 #${currentVersionLabel || '—'}`
                          : '为场景添加对白、旁白、环境音等多条音轨，分别管理版本'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative flex-wrap">
                    <button
                      onClick={() => {
                        setCreatingTrack(true);
                        setNewTrackRole('');
                      }}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[11px] rounded-lg border border-white/10 flex items-center gap-1 transition-all"
                    >
                      <Plus size={12} /> 新建音轨
                    </button>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={e => handleUploadAudio(e.target.files?.[0])}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">音轨</span>
                  {audioTracks.map(track => {
                    const isActive = track.id === selectedAudioId;
                    return (
                      <button
                        key={track.id}
                        onClick={() => {
                          setSelectedAudioId(track.id);
                          setVersionMenuOpen(false);
                          setIsAudioPlaying(false);
                          setPreviewPlayingVersion(null);
                        }}
                        className={`px-3 py-1 rounded-lg border text-sm flex items-center gap-2 transition-all ${
                          isActive
                            ? 'bg-blue-600/20 border-blue-500/60 text-white shadow-[0_0_12px_rgba(59,130,246,0.35)]'
                            : 'bg-white/5 border-white/10 text-white/70 hover:border-white/30 hover:text-white'
                        }`}
                      >
                        <span>{track.role || `音轨 #${track.index}`}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 border border-white/10">
                          #{track.audioVersion ?? '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {creatingTrack && (
                  <div className="flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3">
                    <input
                      value={newTrackRole}
                      onChange={e => setNewTrackRole(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateTrack();
                        }
                      }}
                      placeholder="角色名 / 旁白 / 环境音"
                      className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleCreateTrack}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg border border-blue-500/60"
                    >
                      创建音轨
                    </button>
                    <button
                      onClick={() => {
                        setCreatingTrack(false);
                        setNewTrackRole('');
                      }}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-xs rounded-lg border border-white/10"
                    >
                      取消
                    </button>
                  </div>
                )}

                {selectedTrack ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={roleDraft}
                          onChange={e => setRoleDraft(e.target.value)}
                          onBlur={handleUpdateRole}
                          className="min-w-[180px] bg-[#0c0c0c] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="填写音轨名称"
                        />
                        <button
                          onClick={handleUpdateRole}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1"
                        >
                          <Pencil size={12} /> 保存名称
                        </button>
                        <span className="text-[11px] text-white/30">版本 #{currentVersionLabel || '—'}</span>
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
                              <div className="absolute right-0 mt-2 w-80 bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
                                <div className="px-3 py-2 border-b border-white/10 text-white/60 text-[11px]">
                                  <span>共 {currentVersions.length} 个版本</span>
                                </div>
                                <div className="max-h-80 overflow-y-auto divide-y divide-white/10">
                                  {currentVersions.map(version => {
                                    const time = version.createdAt ? new Date(version.createdAt).toLocaleString('zh-CN', { hour12: false }) : '';
                                    const isActive = previewPlayingVersion === version.version;
                                    return (
                                      <div
                                        key={version.id}
                                        className={`p-3 space-y-2 ${isActive ? 'bg-blue-600/10' : 'bg-transparent hover:bg-white/5'}`}
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
                                              handlePlayVersion(version.version);
                                            }}
                                            className={`text-[11px] px-2 py-1 rounded-lg border flex items-center gap-1 transition-all ${
                                              isActive
                                                ? 'bg-blue-600/20 border-blue-500/50 text-white'
                                                : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/80'
                                            }`}
                                          >
                                            <Play size={12} fill="currentColor" />
                                            {isActive ? '播放中' : '播放'}
                                          </button>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => handleSetCurrentVersion(version.version)}
                                              className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/50"
                                            >
                                              设为当前
                                            </button>
                                            <div className="relative group">
                                              <Info size={14} className="text-white/30" />
                                              <div className="absolute right-0 top-6 w-60 p-2 rounded-md bg-black/80 border border-white/10 text-[11px] text-white/70 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                                将预览中的版本设为交付版本（默认最新）<br/>交付版本将进入审核流程
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
                          onClick={() => setDeleteTarget(selectedTrack)}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg bg-white/5 border border-white/10 text-red-300 hover:text-white hover:border-red-500/40 hover:bg-red-500/20 flex items-center gap-1"
                        >
                          <Trash2 size={12} /> 删除音轨
                        </button>
                      </div>
                    </div>

                    {hasAudio ? (
                      <>
                        <div className="bg-[#0b0b0b] border border-white/5 rounded-xl p-4 flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={toggleAudioPlay}
                              className="w-10 h-10 rounded-full bg-blue-600/80 hover:bg-blue-500 text-white flex items-center justify-center transition-all shadow-lg"
                            >
                              {isAudioPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
                            </button>
                            <div className="flex-1">
                              <div className="flex items-center justify-between text-white/70 text-sm">
                                <span>{selectedTrack?.role || '未命名音轨'} · 当前版本 #{currentVersionLabel || '—'}</span>
                                <span className="text-[11px] text-white/50 tabular-nums">
                                  {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                                </span>
                              </div>
                              <div
                                className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden cursor-pointer"
                                onClick={(e) => {
                                  if (!audioRef.current || !audioDuration) return;
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const clickX = e.clientX - rect.left;
                                  const newTime = (clickX / rect.width) * audioDuration;
                                  audioRef.current.currentTime = newTime;
                                  setAudioCurrentTime(newTime);
                                }}
                              >
                                <div
                                  className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-100"
                                  style={{ width: `${audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0}%` }}
                                />
                              </div>
                              <div className="mt-1 text-[11px] text-white/40">若需交付，请在历史版本中设为当前</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {playbackAudioUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); downloadFile(playbackAudioUrl); }}
                                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white flex items-center justify-center transition-all border border-white/10"
                                  title="下载音频"
                                >
                                  <Download size={16} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => audioInputRef.current?.click()}
                                disabled={uploadingAudio}
                                className="px-3 py-1.5 text-[11px] rounded-lg bg-white/10 hover:bg-white/20 text-white/80 border border-white/10 transition-all disabled:opacity-60"
                              >
                                {uploadingAudio ? '上传中...' : '重新上传'}
                              </button>
                            </div>
                          </div>
                          <audio
                            ref={audioRef}
                            src={playbackAudioUrl}
                            onPlay={() => setIsAudioPlaying(true)}
                            onPause={() => setIsAudioPlaying(false)}
                            onEnded={() => {
                              setIsAudioPlaying(false);
                              setAudioCurrentTime(0);
                            }}
                            onTimeUpdate={() => setAudioCurrentTime(audioRef.current?.currentTime || 0)}
                            onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || 0)}
                            className="hidden"
                          />
                        </div>
                        {renderVoiceStudioCard()}
                      </>
                    ) : (
                      renderVoiceStudioCard()
                    )}
                  </>
                ) : (
                  <div className="bg-[#0b0b0b] border border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center text-center gap-4">
                    <div className="p-4 rounded-full bg-blue-600/15 text-blue-400 shadow-inner">
                      <Mic2 size={26} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-white font-semibold text-sm">当前场景还没有音轨</p>
                      <p className="text-white/50 text-[12px]">为不同角色/旁白创建独立音轨，方便分段管理</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        onClick={() => {
                          setCreatingTrack(true);
                          setNewTrackRole('');
                        }}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-bold border border-blue-500/60 shadow-lg transition-all"
                      >
                        新建音轨
                      </button>
                      <div className="text-[11px] text-white/50 bg-white/5 border border-white/10 rounded-full px-3 py-1 flex items-center gap-2">
                        <Volume2 size={12} className="text-amber-300" />
                        <span>支持 mp3 / wav / aac</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 bg-[#1a1a1a] border-t border-white/5 flex justify-end items-center px-10">
            {audioTracks.length === 0 ? (
              <div className="flex items-center gap-2 text-white/40">
                <Info size={14} className="text-amber-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest">当前场景还没有音轨 · 先创建音轨再上传音频</span>
              </div>
            ) : hasAudio ? (
              <div className="flex items-center gap-2 text-white/30">
                <CheckCircle2 size={14} className="text-green-500/50" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {selectedTrack?.role || '音轨'} 已就绪 (审核组可实时监听反馈)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white/40">
                <Info size={14} className="text-amber-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {selectedTrack?.role || '音轨'} 暂无音频 · 可直接生成第一版或上传现成音频
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

          {/* 右侧：修改意见 */}
          <div
            style={{ width: rightPanelWidth }}
            className="border-l border-white/5 bg-[#121212] flex flex-col min-w-[260px] max-w-[520px]"
          >
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs font-bold text-white/40 uppercase tracking-widest">音频修正意见</span>
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
                    <Volume2 size={32} />
                    <p className="text-xs">暂无音频反馈</p>
                  </div>
                )
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-3 opacity-20 italic">
                  <Volume2 size={32} />
                  <p className="text-xs">请选择场景查看评论</p>
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
