import { useReducer, useCallback, useRef, useEffect } from 'react';
import { Episode, Scene, Status } from '../types';
import { chapterApi, sceneApi, fileApi, ensureHttpsUrl, normalizeFileKey, isValidMediaUrl } from '../api';

// ============ State Types ============
export interface ScriptEditorState {
  // Core data
  chapters: Episode[];
  activeChapterId: number | null;
  activeScene: Scene | null;

  // Data tracking
  isDirty: boolean;
  isSynopsisDirty: boolean;

  // Async operations
  isLoading: boolean;
  loadError: string | null;
  isSaving: boolean;
  saveError: string | null;
  lastSavedAt: Date | null;
  isSavingSynopsis: boolean;
  isUploadingReference: boolean;

  // Retry mechanism
  retryCount: number;
  isRetrying: boolean;

  // Save queue
  saveQueueSize: number;

  // Resolved reference URL
  resolvedReferenceUrl: string | undefined;
}

// ============ Action Types ============
type Action =
  | { type: 'SET_CHAPTERS'; payload: Episode[] }
  | { type: 'SET_ACTIVE_CHAPTER'; payload: number | null }
  | { type: 'SET_ACTIVE_SCENE'; payload: Scene | null }
  | { type: 'UPDATE_ACTIVE_SCENE'; payload: Scene }
  | { type: 'UPDATE_CHAPTER'; payload: { chapterId: number; updates: Partial<Episode> } }
  | { type: 'ADD_CHAPTER'; payload: { chapter: Episode; insertIndex: number } }
  | { type: 'REMOVE_CHAPTER'; payload: number }
  | { type: 'ADD_SCENE'; payload: { chapterId: number; scene: Scene } }
  | { type: 'REMOVE_SCENE'; payload: { chapterId: number; sceneId: number } }
  | { type: 'SET_DIRTY'; payload: boolean }
  | { type: 'SET_SYNOPSIS_DIRTY'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_LOAD_ERROR'; payload: string | null }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_SAVE_ERROR'; payload: string | null }
  | { type: 'SET_LAST_SAVED_AT'; payload: Date | null }
  | { type: 'SET_SAVING_SYNOPSIS'; payload: boolean }
  | { type: 'SET_UPLOADING_REFERENCE'; payload: boolean }
  | { type: 'SET_RESOLVED_REFERENCE_URL'; payload: string | undefined }
  | { type: 'SELECT_CHAPTER'; payload: { chapterId: number | null; scene?: Scene | null } }
  | { type: 'SELECT_SCENE'; payload: { chapterId: number; scene: Scene } }
  | { type: 'SAVE_SUCCESS'; payload: { sceneId: number; savedAt: Date } }
  | { type: 'SAVE_FAILURE'; payload: string }
  | { type: 'SET_RETRY_COUNT'; payload: number }
  | { type: 'SET_IS_RETRYING'; payload: boolean }
  | { type: 'SET_SAVE_QUEUE_SIZE'; payload: number };

// ============ Initial State ============
export const initialState: ScriptEditorState = {
  chapters: [],
  activeChapterId: null,
  activeScene: null,
  isDirty: false,
  isSynopsisDirty: false,
  isLoading: false,
  loadError: null,
  isSaving: false,
  saveError: null,
  lastSavedAt: null,
  isSavingSynopsis: false,
  isUploadingReference: false,
  retryCount: 0,
  isRetrying: false,
  saveQueueSize: 0,
  resolvedReferenceUrl: undefined,
};

// ============ Reducer ============
export function scriptEditorReducer(state: ScriptEditorState, action: Action): ScriptEditorState {
  switch (action.type) {
    case 'SET_CHAPTERS':
      return { ...state, chapters: action.payload };

    case 'SET_ACTIVE_CHAPTER':
      return { ...state, activeChapterId: action.payload };

    case 'SET_ACTIVE_SCENE':
      return { ...state, activeScene: action.payload };

    case 'UPDATE_ACTIVE_SCENE': {
      const nextScene = action.payload;
      const chapters = state.chapters.map(ch => {
        if (ch.id !== state.activeChapterId) return ch;
        const scenes = (ch.scenes || []).map(s => (s.id === nextScene.id ? nextScene : s));
        return { ...ch, scenes };
      });
      return { ...state, chapters, activeScene: nextScene };
    }

    case 'UPDATE_CHAPTER': {
      const { chapterId, updates } = action.payload;
      const chapters = state.chapters.map(ch =>
        ch.id === chapterId ? { ...ch, ...updates } : ch
      );
      return { ...state, chapters };
    }

    case 'ADD_CHAPTER': {
      const { chapter, insertIndex } = action.payload;
      const chapters = [...state.chapters];
      chapters.splice(insertIndex, 0, chapter);
      return { ...state, chapters };
    }

    case 'REMOVE_CHAPTER': {
      const chapterId = action.payload;
      const chapters = state.chapters.filter(ch => ch.id !== chapterId);
      let activeChapterId = state.activeChapterId;
      let activeScene = state.activeScene;

      if (activeChapterId === chapterId) {
        const fallback = chapters[0];
        activeChapterId = fallback?.id || null;
        activeScene = fallback?.scenes?.[0] || null;
      } else if (activeScene) {
        const stillExists = chapters.some(ch => (ch.scenes || []).some(s => s.id === activeScene!.id));
        if (!stillExists) {
          activeScene = null;
        }
      }

      return { ...state, chapters, activeChapterId, activeScene };
    }

    case 'ADD_SCENE': {
      const { chapterId, scene } = action.payload;
      const chapters = state.chapters.map(ch => {
        if (ch.id !== chapterId) return ch;
        const scenes = [...(ch.scenes || []), scene].sort((a, b) => a.index - b.index);
        return { ...ch, scenes };
      });
      return { ...state, chapters, activeScene: scene };
    }

    case 'REMOVE_SCENE': {
      const { chapterId, sceneId } = action.payload;
      const chapters = state.chapters.map(ch => {
        if (ch.id !== chapterId) return ch;
        const scenes = (ch.scenes || []).filter(s => s.id !== sceneId);
        return { ...ch, scenes };
      });

      let activeScene = state.activeScene;
      if (activeScene?.id === sceneId) {
        const targetChapter = chapters.find(c => c.id === chapterId);
        const sortedScenes = [...(targetChapter?.scenes || [])].sort((a, b) => a.index - b.index);
        activeScene = sortedScenes[0] || null;
      }

      return { ...state, chapters, activeScene };
    }

    case 'SET_DIRTY':
      return { ...state, isDirty: action.payload };

    case 'SET_SYNOPSIS_DIRTY':
      return { ...state, isSynopsisDirty: action.payload };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_LOAD_ERROR':
      return { ...state, loadError: action.payload };

    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };

    case 'SET_SAVE_ERROR':
      return { ...state, saveError: action.payload };

    case 'SET_LAST_SAVED_AT':
      return { ...state, lastSavedAt: action.payload };

    case 'SET_SAVING_SYNOPSIS':
      return { ...state, isSavingSynopsis: action.payload };

    case 'SET_UPLOADING_REFERENCE':
      return { ...state, isUploadingReference: action.payload };

    case 'SET_RESOLVED_REFERENCE_URL':
      return { ...state, resolvedReferenceUrl: action.payload };

    case 'SELECT_CHAPTER': {
      const { chapterId, scene } = action.payload;
      return {
        ...state,
        activeChapterId: chapterId,
        activeScene: scene ?? null,
      };
    }

    case 'SELECT_SCENE': {
      const { chapterId, scene } = action.payload;
      return {
        ...state,
        activeChapterId: chapterId,
        activeScene: scene,
        saveError: null,
      };
    }

    case 'SAVE_SUCCESS':
      return {
        ...state,
        isSaving: false,
        isDirty: false,
        saveError: null,
        lastSavedAt: action.payload.savedAt,
      };

    case 'SAVE_FAILURE':
      return {
        ...state,
        isSaving: false,
        saveError: action.payload,
      };

    case 'SET_RETRY_COUNT':
      return { ...state, retryCount: action.payload };

    case 'SET_IS_RETRYING':
      return { ...state, isRetrying: action.payload };

    case 'SET_SAVE_QUEUE_SIZE':
      return { ...state, saveQueueSize: action.payload };

    default:
      return state;
  }
}

// ============ Hook ============
interface UseScriptEditorReducerOptions {
  bookId: number;
  episodes?: Episode[];
  initialChapterId?: number | null;
  initialSceneId?: number | null;
  onEpisodesChange?: (episodes: Episode[]) => void;
  onActiveChapterChange?: (chapterId: number | null) => void;
  onActiveSceneChange?: (sceneId: number | null) => void;
}

export function useScriptEditorReducer(options: UseScriptEditorReducerOptions) {
  const {
    bookId,
    episodes = [],
    initialChapterId,
    initialSceneId,
    onEpisodesChange,
    onActiveChapterChange,
    onActiveSceneChange,
  } = options;

  const [state, dispatch] = useReducer(scriptEditorReducer, initialState);

  // Refs for callbacks to avoid re-renders
  const onEpisodesChangeRef = useRef(onEpisodesChange);
  const onActiveChapterChangeRef = useRef(onActiveChapterChange);
  const onActiveSceneChangeRef = useRef(onActiveSceneChange);

  useEffect(() => {
    onEpisodesChangeRef.current = onEpisodesChange;
    onActiveChapterChangeRef.current = onActiveChapterChange;
    onActiveSceneChangeRef.current = onActiveSceneChange;
  }, [onEpisodesChange, onActiveChapterChange, onActiveSceneChange]);

  // Refs for initial values to avoid dependency cycles
  const initialChapterIdRef = useRef(initialChapterId);
  const initialSceneIdRef = useRef(initialSceneId);
  const hasInitializedRef = useRef(false);

  // Signature tracking for dirty detection
  const savedSignaturesRef = useRef<Record<number, string>>({});
  const savedChapterSynopsisRef = useRef<Record<number, string>>({});
  const referenceUrlCache = useRef<Record<string, string>>({});

  // Save queue management
  interface SaveTask {
    id: string;
    type: 'scene' | 'synopsis';
    chapterId: number;
    scene?: Scene;
    synopsis?: string;
    timestamp: number;
  }

  const saveQueueRef = useRef<SaveTask[]>([]);
  const isProcessingQueueRef = useRef(false);

  // Signature helpers
  const getSignature = useCallback((scene: Scene) =>
    JSON.stringify({
      description: scene.description,
      cameraMovement: scene.cameraMovement,
      dialogue: scene.dialogue,
      transitionEffect: scene.transitionEffect,
      status: scene.status,
      index: scene.index,
      referenceImageUrl: scene.referenceImageUrl,
      referenceImageDescription: scene.referenceImageDescription,
    }), []);

  const getSynopsisSignature = useCallback((synopsis?: string) => synopsis || '', []);

  // Notify parent of chapter changes
  useEffect(() => {
    onActiveChapterChangeRef.current?.(state.activeChapterId);
  }, [state.activeChapterId]);

  // Notify parent of scene changes
  useEffect(() => {
    onActiveSceneChangeRef.current?.(state.activeScene?.id ?? null);
  }, [state.activeScene?.id]);

  // Commit chapters to parent
  const commitChapters = useCallback((chapters: Episode[]) => {
    dispatch({ type: 'SET_CHAPTERS', payload: chapters });
    onEpisodesChangeRef.current?.(chapters);
  }, []);

  // Ref for episodes prop to use in loadChapters
  const episodesRef = useRef(episodes);
  useEffect(() => {
    episodesRef.current = episodes;
  }, [episodes]);

  // Helper to initialize state from episodes data
  const initializeFromData = useCallback((data: Episode[]) => {
    // Store initial signatures
    const savedSig: Record<number, string> = {};
    data.forEach(ch => (ch.scenes || []).forEach(sc => {
      savedSig[sc.id] = getSignature(sc);
    }));
    savedSignaturesRef.current = savedSig;

    const savedChapterSig: Record<number, string> = {};
    data.forEach(ch => {
      savedChapterSig[ch.id] = getSynopsisSignature(ch.synopsis);
    });
    savedChapterSynopsisRef.current = savedChapterSig;

    // Determine initial selection
    let targetChapterId: number | null = null;
    let targetScene: Scene | null = null;
    const initChapterId = initialChapterIdRef.current;
    const initSceneId = initialSceneIdRef.current;

    if (initChapterId != null) {
      const chapter = data.find(ch => ch.id === initChapterId);
      if (chapter) {
        targetChapterId = chapter.id;
        if (initSceneId != null) {
          const scene = chapter.scenes?.find(s => s.id === initSceneId);
          if (scene) targetScene = scene;
        }
      }
    }

    if (targetChapterId == null) {
      targetChapterId = data[0]?.id ?? null;
    }

    dispatch({ type: 'SET_CHAPTERS', payload: data });
    dispatch({ type: 'SELECT_CHAPTER', payload: { chapterId: targetChapterId, scene: targetScene } });
    dispatch({ type: 'SET_DIRTY', payload: false });
    dispatch({ type: 'SET_SYNOPSIS_DIRTY', payload: false });
    onEpisodesChangeRef.current?.(data);
  }, [getSignature, getSynopsisSignature]);

  // Load chapters from API or use preloaded episodes
  const loadChapters = useCallback(async () => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // 如果 episodes prop 已有数据，直接使用，跳过 API 调用
    if (episodesRef.current && episodesRef.current.length > 0) {
      initializeFromData(episodesRef.current);
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_LOAD_ERROR', payload: null });

    try {
      const res = await chapterApi.list(bookId, true);
      const data = (res.data || []).map(ch => ({
        id: ch.id,
        title: ch.title,
        index: ch.index,
        synopsis: ch.synopsis || '',
        status: ch.status as Status,
        scenes: (ch.scenes || [])
          .map(s => ({
            id: s.id,
            chapterId: s.chapterId ?? ch.id,
            index: s.index,
            description: s.description || '',
            cameraMovement: s.cameraMovement || '',
            dialogue: s.dialogue || '',
            transitionEffect: s.transitionEffect || '',
            status: s.status as Status,
            comments: [],
            referenceImageUrl: s.referenceImageUrl,
            referenceImageDescription: s.referenceImageDescription || '',
            thumbnailUrl: s.thumbnailUrl,
            frameSets: s.frameSets,
            animations: s.animations,
            audios: s.audios,
          }) as Scene)
          .sort((a, b) => a.index - b.index),
      })) as Episode[];

      initializeFromData(data);
    } catch (err) {
      console.error('Failed to load chapters', err);
      dispatch({ type: 'SET_LOAD_ERROR', payload: err instanceof Error ? err.message : '加载失败' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [bookId, initializeFromData]);

  // Resolve reference image URL
  const resolveReferenceImage = useCallback(async (raw?: string | null) => {
    if (!raw) {
      dispatch({ type: 'SET_RESOLVED_REFERENCE_URL', payload: undefined });
      return;
    }

    const ref = ensureHttpsUrl(typeof raw === 'string' ? raw : String(raw));
    if (ref.startsWith('data:') || ref.startsWith('blob:')) {
      dispatch({ type: 'SET_RESOLVED_REFERENCE_URL', payload: ref });
      return;
    }

    const { key, externalUrl } = normalizeFileKey(ref);
    const fallback = externalUrl && isValidMediaUrl(externalUrl) ? externalUrl : undefined;

    if (!key) {
      dispatch({ type: 'SET_RESOLVED_REFERENCE_URL', payload: fallback });
      return;
    }

    if (referenceUrlCache.current[key]) {
      dispatch({ type: 'SET_RESOLVED_REFERENCE_URL', payload: referenceUrlCache.current[key] });
      return;
    }

    try {
      const signed = await fileApi.getSignedUrl(key);
      const resolved = ensureHttpsUrl(signed.url);
      if (resolved && isValidMediaUrl(resolved)) {
        referenceUrlCache.current[key] = resolved;
        dispatch({ type: 'SET_RESOLVED_REFERENCE_URL', payload: resolved });
      } else {
        dispatch({ type: 'SET_RESOLVED_REFERENCE_URL', payload: fallback });
      }
    } catch (e) {
      console.error('Failed to resolve reference image', e);
      dispatch({ type: 'SET_RESOLVED_REFERENCE_URL', payload: fallback });
    }
  }, []);

  // Internal persist scene (called by queue processor)
  const persistSceneInternal = useCallback(async (chapterId: number, scene: Scene, retryCount = 0): Promise<boolean> => {
    const currentSig = getSignature(scene);
    if (savedSignaturesRef.current[scene.id] === currentSig) {
      dispatch({ type: 'SET_DIRTY', payload: false });
      return false;
    }

    // 1. 先保存到 localStorage 作为备份
    try {
      const backupKey = `manju_scene_${scene.id}`;
      localStorage.setItem(backupKey, JSON.stringify({
        ...scene,
        backupTime: new Date().toISOString(),
      }));
    } catch (err) {
      console.warn('Failed to backup to localStorage', err);
    }

    dispatch({ type: 'SET_SAVING', payload: true });
    if (retryCount > 0) {
      dispatch({ type: 'SET_IS_RETRYING', payload: true });
      dispatch({ type: 'SET_RETRY_COUNT', payload: retryCount });
    }

    try {
      const updated = await sceneApi.update(bookId, chapterId, scene.id, {
        index: scene.index,
        status: scene.status,
        description: scene.description,
        cameraMovement: scene.cameraMovement,
        dialogue: scene.dialogue,
        transitionEffect: scene.transitionEffect,
        referenceImageUrl: scene.referenceImageUrl,
        referenceImageDescription: scene.referenceImageDescription,
      });

      savedSignaturesRef.current[scene.id] = getSignature(updated);
      dispatch({ type: 'SAVE_SUCCESS', payload: { sceneId: scene.id, savedAt: new Date() } });
      dispatch({ type: 'SET_IS_RETRYING', payload: false });
      dispatch({ type: 'SET_RETRY_COUNT', payload: 0 });

      // 保存成功后清除 localStorage 备份
      try {
        localStorage.removeItem(`manju_scene_${scene.id}`);
      } catch (err) {
        console.warn('Failed to clear backup', err);
      }

      return true;
    } catch (err) {
      console.error('Failed to save scene', err);

      // 2. 重试机制（最多3次）
      if (retryCount < 3) {
        console.log(`Retrying save... (${retryCount + 1}/3)`);
        // 延迟重试：第1次等1秒，第2次等2秒，第3次等3秒
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
        return persistSceneInternal(chapterId, scene, retryCount + 1);
      }

      // 重试失败
      dispatch({ type: 'SAVE_FAILURE', payload: '保存失败，已重试3次。数据已备份到本地' });
      dispatch({ type: 'SET_IS_RETRYING', payload: false });
      dispatch({ type: 'SET_RETRY_COUNT', payload: 0 });
      return false;
    }
  }, [bookId, getSignature]);

  // Internal persist chapter synopsis (called by queue processor)
  const persistChapterSynopsisInternal = useCallback(async (chapterId: number, synopsis: string, retryCount = 0): Promise<boolean> => {
    const currentSig = getSynopsisSignature(synopsis);
    if (savedChapterSynopsisRef.current[chapterId] === currentSig) {
      dispatch({ type: 'SET_SYNOPSIS_DIRTY', payload: false });
      return false;
    }

    // 先保存到 localStorage 作为备份
    try {
      const backupKey = `manju_synopsis_${chapterId}`;
      localStorage.setItem(backupKey, JSON.stringify({
        synopsis,
        backupTime: new Date().toISOString(),
      }));
    } catch (err) {
      console.warn('Failed to backup synopsis to localStorage', err);
    }

    dispatch({ type: 'SET_SAVING_SYNOPSIS', payload: true });

    try {
      await chapterApi.update(bookId, chapterId, { synopsis });
      savedChapterSynopsisRef.current[chapterId] = currentSig;
      dispatch({ type: 'SET_SYNOPSIS_DIRTY', payload: false });

      // 保存成功后清除备份
      try {
        localStorage.removeItem(`manju_synopsis_${chapterId}`);
      } catch (err) {
        console.warn('Failed to clear synopsis backup', err);
      }

      return true;
    } catch (err) {
      console.error('Failed to update chapter synopsis', err);

      // 重试机制
      if (retryCount < 3) {
        console.log(`Retrying synopsis save... (${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
        return persistChapterSynopsisInternal(chapterId, synopsis, retryCount + 1);
      }

      return false;
    } finally {
      dispatch({ type: 'SET_SAVING_SYNOPSIS', payload: false });
    }
  }, [bookId, getSynopsisSignature]);

  // Process save queue
  const processSaveQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || saveQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;
    dispatch({ type: 'SET_SAVE_QUEUE_SIZE', payload: saveQueueRef.current.length });

    while (saveQueueRef.current.length > 0) {
      const task = saveQueueRef.current[0];

      // 检查队列中是否有相同 ID 的更新任务，合并它们
      const duplicateIndex = saveQueueRef.current.findIndex(
        (t: SaveTask, idx: number) => idx > 0 && t.id === task.id
      );
      if (duplicateIndex > 0) {
        // 移除旧任务，使用最新的任务
        saveQueueRef.current.shift();
        dispatch({ type: 'SET_SAVE_QUEUE_SIZE', payload: saveQueueRef.current.length });
        continue;
      }

      try {
        if (task.type === 'scene' && task.scene) {
          await persistSceneInternal(task.chapterId, task.scene);
        } else if (task.type === 'synopsis' && task.synopsis !== undefined) {
          await persistChapterSynopsisInternal(task.chapterId, task.synopsis);
        }
      } catch (err) {
        console.error('Failed to process save task', err);
      }

      // 移除已处理的任务
      saveQueueRef.current.shift();
      dispatch({ type: 'SET_SAVE_QUEUE_SIZE', payload: saveQueueRef.current.length });
    }

    isProcessingQueueRef.current = false;
    dispatch({ type: 'SET_SAVE_QUEUE_SIZE', payload: 0 });
  }, [persistSceneInternal, persistChapterSynopsisInternal]);

  // Add task to save queue
  const addToSaveQueue = useCallback((task: SaveTask) => {
    // 检查队列中是否已经有相同的任务，如果有则替换（保留最新）
    const existingIndex = saveQueueRef.current.findIndex((t: SaveTask) => t.id === task.id);
    if (existingIndex >= 0) {
      saveQueueRef.current[existingIndex] = task;
    } else {
      saveQueueRef.current.push(task);
    }
    dispatch({ type: 'SET_SAVE_QUEUE_SIZE', payload: saveQueueRef.current.length });

    // 触发队列处理
    processSaveQueue();
  }, [processSaveQueue]);

  // Public persist scene (adds to queue)
  const persistScene = useCallback(async (chapterId: number, scene: Scene): Promise<boolean> => {
    const taskId = `scene_${scene.id}`;
    addToSaveQueue({
      id: taskId,
      type: 'scene',
      chapterId,
      scene,
      timestamp: Date.now(),
    });
    return true; // 返回 true 表示已加入队列
  }, [addToSaveQueue]);

  // Public persist chapter synopsis (adds to queue)
  const persistChapterSynopsis = useCallback(async (chapterId: number, synopsis: string): Promise<boolean> => {
    const taskId = `synopsis_${chapterId}`;
    addToSaveQueue({
      id: taskId,
      type: 'synopsis',
      chapterId,
      synopsis,
      timestamp: Date.now(),
    });
    return true; // 返回 true 表示已加入队列
  }, [addToSaveQueue]);

  // Update active scene with dirty tracking
  const updateActiveScene = useCallback((updater: (scene: Scene) => Scene) => {
    if (!state.activeScene || !state.activeChapterId) return;

    const nextScene = updater(state.activeScene);
    dispatch({ type: 'UPDATE_ACTIVE_SCENE', payload: nextScene });

    const sig = getSignature(nextScene);
    dispatch({ type: 'SET_DIRTY', payload: savedSignaturesRef.current[nextScene.id] !== sig });
    dispatch({ type: 'SET_SAVE_ERROR', payload: null });
  }, [state.activeScene, state.activeChapterId, getSignature]);

  // Check if scene is dirty
  const checkSceneDirty = useCallback((scene: Scene) => {
    const sig = getSignature(scene);
    return savedSignaturesRef.current[scene.id] !== sig;
  }, [getSignature]);

  // Check if synopsis is dirty
  const checkSynopsisDirty = useCallback((chapterId: number, synopsis: string) => {
    const sig = getSynopsisSignature(synopsis);
    return savedChapterSynopsisRef.current[chapterId] !== sig;
  }, [getSynopsisSignature]);

  // Store scene signature after creation
  const storeSceneSignature = useCallback((scene: Scene) => {
    savedSignaturesRef.current[scene.id] = getSignature(scene);
  }, [getSignature]);

  // Clean up scene signatures when chapter deleted
  const cleanupChapterSignatures = useCallback((chapterId: number, remainingChapters: Episode[]) => {
    delete savedChapterSynopsisRef.current[chapterId];
    const remainingScenes = remainingChapters.flatMap(ch => ch.scenes || []);
    const newSignatures: Record<number, string> = {};
    remainingScenes.forEach(s => {
      newSignatures[s.id] = savedSignaturesRef.current[s.id];
    });
    savedSignaturesRef.current = newSignatures;
  }, []);

  return {
    state,
    dispatch,
    // Computed values
    activeChapter: state.chapters.find(c => c.id === state.activeChapterId) || null,
    // Actions
    loadChapters,
    resolveReferenceImage,
    persistScene,
    persistChapterSynopsis,
    updateActiveScene,
    commitChapters,
    // Helpers
    checkSceneDirty,
    checkSynopsisDirty,
    storeSceneSignature,
    cleanupChapterSignatures,
    referenceUrlCache,
  };
}
