// API 服务层 - 连接后端接口

const isBrowser = typeof window !== 'undefined';
const shouldForceHttps = isBrowser && window.location.protocol === 'https:';

export const ensureHttpsUrl = (url?: string | null): string => {
  if (!url) return '';
  if (!shouldForceHttps) return url;
  if (!url.startsWith('http:')) return url;
  try {
    const parsed = new URL(url);
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return url.replace(/^http:/, 'https:');
  }
};

const API_BASE_URL = ensureHttpsUrl(import.meta.env.VITE_API_URL || 'http://localhost:8080');
const FILE_API_PREFIX = '/api/files/';
const API_HOST = (() => {
  try {
    return new URL(API_BASE_URL).host;
  } catch {
    return '';
  }
})();

/**
 * 检查 URL 是否可以直接用于 img/video 标签的 src 属性
 * 只有完整的 http(s) URL、data URL 或 blob URL 才是有效的
 * 文件 key（如 "abc123"）不能直接使用，会被浏览器解析为相对路径
 */
export const isValidMediaUrl = (url?: string | null): boolean => {
  if (!url) return false;
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  );
};

/**
 * 下载文件：通过 ?download=true 触发后端返回 Content-Disposition: attachment
 */
export const downloadFile = async (url: string, _filename?: string) => {
  const separator = url.includes('?') ? '&' : '?';
  const downloadUrl = `${url}${separator}download=true`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const normalizeFileKey = (input?: string | null): { key: string | null; externalUrl?: string } => {
  if (!input) return { key: null };
  const normalized = ensureHttpsUrl(typeof input === 'string' ? input : String(input));
  if (normalized.startsWith('data:') || normalized.startsWith('blob:')) {
    return { key: null, externalUrl: normalized };
  }
  const idx = normalized.lastIndexOf(FILE_API_PREFIX);
  if (idx >= 0) {
    const key = normalized.slice(idx + FILE_API_PREFIX.length).replace(/^\//, '');
    return { key: key || null };
  }
  if (/^https?:\/\//.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      const pathKey = parsed.pathname.replace(/^\//, '');
      const isSameOrigin = isBrowser && parsed.origin === window.location.origin;
      const isApiHost = API_HOST && parsed.host === API_HOST;
      if (isSameOrigin || isApiHost) {
        return { key: pathKey || null };
      }
      return { key: null, externalUrl: normalized };
    } catch {
      return { key: null, externalUrl: normalized };
    }
  }
  return { key: normalized.replace(/^\//, '') };
};

// 后端 Book 类型定义
export type BookType = 'NOVEL' | 'COMIC';
export type AdaptationStatus = 'NONE' | 'IN_PROGRESS' | 'COMPLETED';

export interface Book {
  id: number;
  title: string;
  author: string;
  cover: string;
  type: BookType;
  description: string;
  outline: string;
  adaptationStatus: AdaptationStatus;
  adaptedBy: string;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookListResponse {
  total: number;
  page: number;
  size: number;
  data: Book[];
}

export interface CreateBookRequest {
  title: string;
  author: string;
  cover?: string;
  type: BookType;
  description?: string;
  outline?: string;
}

export interface BookListParams {
  page?: number;
  size?: number;
  type?: BookType;
  keyword?: string;
}

// API 错误处理
class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'auth_token';

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const isFormData = options?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (!isFormData) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const hasAuthHeader = Object.prototype.hasOwnProperty.call(headers, 'Authorization');
  if (!hasAuthHeader) {
    const token = authStorage.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

// 认证 API
export interface AuthResponse {
  token: string;
  user: {
    id: number;
    username: string;
    nickname: string;
  };
}

export const authApi = {
  login: (payload: { username: string; password: string }) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { Authorization: '' }, // 显式移除 token
    }),
  register: (payload: { username: string; password: string; nickname?: string }) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { Authorization: '' }, // 显式移除 token
    }),
  me: () => request<AuthResponse['user']>('/api/auth/me'),
};

// 书籍 API
export const bookApi = {
  // 获取书籍列表
  list: async (params?: BookListParams): Promise<BookListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.size) searchParams.set('size', String(params.size));
    if (params?.type) searchParams.set('type', params.type);
    if (params?.keyword) searchParams.set('keyword', params.keyword);

    const queryString = searchParams.toString();
    const endpoint = `/api/books${queryString ? `?${queryString}` : ''}`;

    return request<BookListResponse>(endpoint);
  },

  // 创建书籍
  create: async (data: CreateBookRequest): Promise<Book> => {
    return request<Book>('/api/books', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 获取单个书籍详情
  getById: async (id: number): Promise<Book> => {
    return request<Book>(`/api/books/${id}`);
  },

  // 更新书籍
  update: async (id: number, data: CreateBookRequest): Promise<Book> => {
    return request<Book>(`/api/books/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // 删除书籍
  delete: async (id: number): Promise<void> => {
    return request(`/api/books/${id}`, {
      method: 'DELETE',
    });
  },

  // 更新大纲
  updateOutline: async (id: number, outline: string): Promise<Book> => {
    return request<Book>(`/api/books/${id}/outline`, {
      method: 'PUT',
      body: JSON.stringify({ outline }),
    });
  },
};

// 工具函数：将后端 Book 转换为前端 Project 格式
import {
  Comment,
  CommentListResponse,
  CommentModule,
  CommentStatus,
  Project,
  Status,
  Episode,
  Scene,
  SceneReference,
  ChapterVideo,
  ChapterVideoVersion,
  VideoStatus,
  SceneFrameSet,
  SceneFrameSetVersion,
  SceneAnimation,
  SceneAnimationGenerationTask,
  SceneAnimationVersion,
  Character,
  Lora,
  LoraListResponse,
  LoraListParams,
  CreateLoraRequest,
  UpdateLoraRequest,
} from './types';

export function bookToProject(book: Book): Project {
  // 将后端的 adaptationStatus 映射到前端的 productionStatus
  const statusMap: Record<AdaptationStatus, Status> = {
    'NONE': 'DRAFT',
    'IN_PROGRESS': 'IN_PROGRESS',
    'COMPLETED': 'COMPLETED',
  };

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    cover: book.cover || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop',
    originalWorkType: book.type,
    productionStatus: statusMap[book.adaptationStatus],
    episodes: [], // 初始化为空数组，后续可以从其他 API 获取
    assignedWriter: book.adaptedBy || undefined,
    outline: book.outline || '',
  };
}

export function booksToProjects(books: Book[]): Project[] {
  return books.map(bookToProject);
}

// 章节/场景 API
export interface Chapter {
  id: number;
  bookId: number;
  title: string;
  index: number;
  status: Status;
  synopsis?: string;
  scenes?: Scene[];
}

export interface ScenePayload {
  description: string;
  cameraMovement: string;
  dialogue: string;
  transitionEffect?: string; // 转场或剪辑手法
  referenceImageUrl?: string;
  referenceImageDescription?: string; // 参考图说明
  thumbnailUrl?: string;
}

export const chapterApi = {
  list: (bookId: number, includeScenes = true) =>
    request<{ total: number; data: Chapter[] }>(`/api/books/${bookId}/chapters?includeScenes=${includeScenes}`),
  create: (bookId: number, payload: { title: string; index: number; status?: Status; synopsis?: string }) =>
    request<Chapter>(`/api/books/${bookId}/chapters`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (bookId: number, chapterId: number, payload: Partial<{ title: string; index: number; status: Status; synopsis?: string }>) =>
    request<Chapter>(`/api/books/${bookId}/chapters/${chapterId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (bookId: number, chapterId: number) =>
    request(`/api/books/${bookId}/chapters/${chapterId}`, { method: 'DELETE' }),
};

export const sceneApi = {
  create: (bookId: number, chapterId: number, payload: { index: number } & ScenePayload & { status?: Status }) =>
    request<Scene>(`/api/books/${bookId}/chapters/${chapterId}/scenes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (bookId: number, chapterId: number, sceneId: number, payload: Partial<{ index: number; status: Status } & ScenePayload>) =>
    request<Scene>(`/api/books/${bookId}/chapters/${chapterId}/scenes/${sceneId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (bookId: number, chapterId: number, sceneId: number) =>
    request(`/api/books/${bookId}/chapters/${chapterId}/scenes/${sceneId}`, { method: 'DELETE' }),
};

// 文件上传 API（用于参考图等）
export interface FileUploadResponse {
  id: number;
  key: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploaderId: number;
  visibility: 'public' | 'private';
  url: string;
  createdAt: string;
}

/**
 * 同步函数：将原始文件 key/url 转换为可直接使用的 /api/files/{key} 代理 URL
 * 后端代理模式下浏览器自动利用 Cache-Control + ETag 缓存，无需 JS 侧缓存
 */
export interface GetFileUrlOptions {
  redirect?: boolean;
}

export const getFileUrl = (raw?: string | null, options?: GetFileUrlOptions): string => {
  if (!raw) return '';
  const { key, externalUrl } = normalizeFileKey(raw);
  if (!key) return externalUrl && isValidMediaUrl(externalUrl) ? externalUrl : '';
  const base = `${API_BASE_URL}/api/files/${key}`;
  if (options?.redirect) {
    return `${base}?redirect=true`;
  }
  return base;
};

export const fileApi = {
  upload: (file: File, visibility: 'public' | 'private' = 'private') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('visibility', visibility);
    return request<FileUploadResponse>('/api/files', {
      method: 'POST',
      body: formData,
    }).then(res => ({ ...res, url: ensureHttpsUrl(res.url) }));
  },

  // 带进度回调的上传（适合大文件）
  uploadWithProgress: (
    file: File,
    visibility: 'public' | 'private' = 'private',
    onProgress?: (percent: number) => void
  ): Promise<FileUploadResponse> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('visibility', visibility);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText) as FileUploadResponse;
            resolve({ ...parsed, url: ensureHttpsUrl(parsed.url) });
          } catch {
            reject(new ApiError(xhr.status, 'Invalid JSON response'));
          }
        } else {
          let message = `Upload failed with status ${xhr.status}`;
          try {
            const errorData = JSON.parse(xhr.responseText);
            message = errorData.error || message;
          } catch {
            // ignore parse error
          }
          reject(new ApiError(xhr.status, message));
        }
      };

      xhr.onerror = () => reject(new ApiError(0, 'Network error'));

      xhr.open('POST', `${API_BASE_URL}/api/files`);

      const token = authStorage.getToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  },

};

// 分镜（帧集）API
export interface SceneFrameSetListResponse {
  total: number;
  data: SceneFrameSet[];
}

export interface SceneFrameSetVersionListResponse {
  total: number;
  data: SceneFrameSetVersion[];
}

export interface CreateFrameSetPayload {
  name: string;
  index: number;
}

export interface UpdateFrameSetPayload {
  name?: string;
  index?: number;
}

export const storyboardApi = {
  list: (sceneId: number) => request<SceneFrameSetListResponse>(`/api/scenes/${sceneId}/frame-sets`),
  create: (sceneId: number, payload: CreateFrameSetPayload) =>
    request<SceneFrameSet>(`/api/scenes/${sceneId}/frame-sets`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (sceneId: number, frameSetId: number, payload: UpdateFrameSetPayload) =>
    request<SceneFrameSet>(`/api/scenes/${sceneId}/frame-sets/${frameSetId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (sceneId: number, frameSetId: number) =>
    request(`/api/scenes/${sceneId}/frame-sets/${frameSetId}`, {
      method: 'DELETE',
    }),
  updateStartFrame: (sceneId: number, frameSetId: number, imageUrl: string) =>
    request<SceneFrameSetVersion>(`/api/scenes/${sceneId}/frame-sets/${frameSetId}/start-frame`, {
      method: 'PUT',
      body: JSON.stringify({ imageUrl }),
    }),
  updateEndFrame: (sceneId: number, frameSetId: number, imageUrl: string) =>
    request<SceneFrameSetVersion>(`/api/scenes/${sceneId}/frame-sets/${frameSetId}/end-frame`, {
      method: 'PUT',
      body: JSON.stringify({ imageUrl }),
    }),
  listStartVersions: (sceneId: number, frameSetId: number) =>
    request<SceneFrameSetVersionListResponse>(
      `/api/scenes/${sceneId}/frame-sets/${frameSetId}/start-frame/versions`
    ),
  listEndVersions: (sceneId: number, frameSetId: number) =>
    request<SceneFrameSetVersionListResponse>(
      `/api/scenes/${sceneId}/frame-sets/${frameSetId}/end-frame/versions`
    ),
  revertStartFrame: (sceneId: number, frameSetId: number, version: number) =>
    request<SceneFrameSet>(`/api/scenes/${sceneId}/frame-sets/${frameSetId}/start-frame/revert/${version}`, {
      method: 'PUT',
    }),
  revertEndFrame: (sceneId: number, frameSetId: number, version: number) =>
    request<SceneFrameSet>(`/api/scenes/${sceneId}/frame-sets/${frameSetId}/end-frame/revert/${version}`, {
      method: 'PUT',
    }),
};

// 动画制作 API（多动画）
export interface SceneAnimationListResponse {
  total: number;
  data: SceneAnimation[];
}

export interface SceneAnimationVersionListResponse {
  total: number;
  data: SceneAnimationVersion[];
}

export interface SceneAnimationGenerationTaskListResponse {
  total: number;
  data: SceneAnimationGenerationTask[];
}

export interface CreateAnimationPayload {
  name: string;
  index: number;
}

export interface UpdateAnimationPayload {
  name?: string;
  index?: number;
}

export interface GenerateAnimationPayload {
  text: string;
  ratio: '16:9' | '9:16';
  duration: number;
  model: 'doubao-seedance-2-0-260128' | 'doubao-seedance-2-0-fast-260128';
  referenceImageKeys?: string[];
  referenceAudioKeys?: string[];
  referenceVideoKeys?: string[];
}

export const animationApi = {
  list: (sceneId: number) => request<SceneAnimationListResponse>(`/api/scenes/${sceneId}/animations`),
  create: (sceneId: number, payload: CreateAnimationPayload) =>
    request<SceneAnimation>(`/api/scenes/${sceneId}/animations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (sceneId: number, animationId: number, payload: UpdateAnimationPayload) =>
    request<SceneAnimation>(`/api/scenes/${sceneId}/animations/${animationId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (sceneId: number, animationId: number) =>
    request(`/api/scenes/${sceneId}/animations/${animationId}`, {
      method: 'DELETE',
    }),
  upload: (sceneId: number, animationId: number, videoUrl: string) =>
    request<SceneAnimationVersion>(`/api/scenes/${sceneId}/animations/${animationId}/upload`, {
      method: 'PUT',
      body: JSON.stringify({ videoUrl }),
    }),
  listGenerationTasks: (sceneId: number, animationId: number) =>
    request<SceneAnimationGenerationTaskListResponse>(
      `/api/scenes/${sceneId}/animations/${animationId}/generation-tasks`
    ),
  createGenerationTask: (sceneId: number, animationId: number, payload: GenerateAnimationPayload) =>
    request<SceneAnimationGenerationTask>(`/api/scenes/${sceneId}/animations/${animationId}/generation-tasks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getGenerationTask: (sceneId: number, animationId: number, taskId: number) =>
    request<SceneAnimationGenerationTask>(
      `/api/scenes/${sceneId}/animations/${animationId}/generation-tasks/${taskId}`
    ),
  pollGenerationTask: (sceneId: number, animationId: number, taskId: number) =>
    request<SceneAnimationGenerationTask>(
      `/api/scenes/${sceneId}/animations/${animationId}/generation-tasks/${taskId}/poll`,
      {
        method: 'POST',
      }
    ),
  listVersions: (sceneId: number, animationId: number) =>
    request<SceneAnimationVersionListResponse>(`/api/scenes/${sceneId}/animations/${animationId}/versions`),
  revert: (sceneId: number, animationId: number, version: number) =>
    request<SceneAnimation>(`/api/scenes/${sceneId}/animations/${animationId}/revert/${version}`, {
      method: 'PUT',
    }),
};

// 音频后期 API（多音轨）
export interface SceneAudio {
  id: number;
  sceneId: number;
  role: string;
  index: number;
  audioUrl?: string;
  audioVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AudioVersion {
  id: number;
  sceneAudioId: number;
  audioUrl: string;
  version: number;
  createdBy: number;
  createdAt: string;
}

export interface AudioVersionListResponse {
  total: number;
  data: AudioVersion[];
}

export interface SceneAudioListResponse {
  total: number;
  data: SceneAudio[];
}

export interface GenerateSceneAudioPayload {
  text: string;
  referenceAudioKey: string;
  emotionPromptKey?: string;
  emotionVector?: number[];
  emotionAlpha?: number;
}

export const audioApi = {
  list: (sceneId: number) => request<SceneAudioListResponse>(`/api/scenes/${sceneId}/audios`),
  create: (sceneId: number, payload: { role: string; index: number }) =>
    request<SceneAudio>(`/api/scenes/${sceneId}/audios`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (sceneId: number, audioId: number, payload: { role?: string; index?: number }) =>
    request<SceneAudio>(`/api/scenes/${sceneId}/audios/${audioId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (sceneId: number, audioId: number) =>
    request(`/api/scenes/${sceneId}/audios/${audioId}`, {
      method: 'DELETE',
    }),
  upload: (sceneId: number, audioId: number, audioUrl: string) =>
    request<AudioVersion>(`/api/scenes/${sceneId}/audios/${audioId}/upload`, {
      method: 'PUT',
      body: JSON.stringify({ audioUrl }),
    }),
  generate: (sceneId: number, audioId: number, payload: GenerateSceneAudioPayload) =>
    request<AudioVersion>(`/api/scenes/${sceneId}/audios/${audioId}/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listVersions: (sceneId: number, audioId: number) =>
    request<AudioVersionListResponse>(`/api/scenes/${sceneId}/audios/${audioId}/versions`),
  revert: (sceneId: number, audioId: number, version: number) =>
    request<SceneAudio>(`/api/scenes/${sceneId}/audios/${audioId}/revert/${version}`, {
      method: 'PUT',
    }),
};

// 章节交付视频 API
export interface ChapterVideoResponse extends ChapterVideo {
  versionCount: number;
}

export interface ChapterVideoVersionListResponse {
  total: number;
  data: ChapterVideoVersion[];
}

export interface UploadChapterVideoPayload {
  videoUrl: string;
  previewUrl?: string;
  duration?: number;
  fileSize?: number;
  previewSize?: number;
  width?: number;
  height?: number;
  format?: string;
  codec?: string;
  bitrate?: number;
  previewBitrate?: number;
  remark?: string;
}

export interface UploadPreviewPayload {
  previewUrl: string;
  previewSize?: number;
  previewBitrate?: number;
}

export interface UpdateVideoStatusPayload {
  status: VideoStatus;
}

export const videoApi = {
  getInfo: (chapterId: number) => request<ChapterVideoResponse>(`/api/chapters/${chapterId}/video`),
  upload: (chapterId: number, payload: UploadChapterVideoPayload) =>
    request<ChapterVideoVersion>(`/api/chapters/${chapterId}/video`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  uploadPreview: (chapterId: number, payload: UploadPreviewPayload) =>
    request<ChapterVideo>(`/api/chapters/${chapterId}/video/preview`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateStatus: (chapterId: number, payload: UpdateVideoStatusPayload) =>
    request<ChapterVideo>(`/api/chapters/${chapterId}/video/status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  listVersions: (chapterId: number) =>
    request<ChapterVideoVersionListResponse>(`/api/chapters/${chapterId}/video/versions`),
  revert: (chapterId: number, version: number) =>
    request<ChapterVideo>(`/api/chapters/${chapterId}/video/revert/${version}`, {
      method: 'PUT',
    }),
  delete: (chapterId: number) =>
    request(`/api/chapters/${chapterId}/video`, {
      method: 'DELETE',
    }),
};

// 评论 API
export type SceneCommentModule = Extract<CommentModule, 'script' | 'storyboard' | 'animation' | 'audio'>;

export interface CreateCommentPayload {
  content: string;
  meta?: string;
}

export interface UpdateCommentPayload {
  content?: string;
  meta?: string;
}

export interface CommentCountsResponse {
  data: Record<number, number>;
  unresolvedCounts: Record<number, number>;
}

export const commentApi = {
  listScene: (sceneId: number, module: SceneCommentModule) =>
    request<CommentListResponse>(`/api/scenes/${sceneId}/comments?module=${module}`),
  createScene: (sceneId: number, module: SceneCommentModule, payload: CreateCommentPayload) =>
    request<Comment>(`/api/scenes/${sceneId}/comments?module=${module}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listChapter: (chapterId: number) => request<CommentListResponse>(`/api/chapters/${chapterId}/comments`),
  createChapter: (chapterId: number, payload: CreateCommentPayload) =>
    request<Comment>(`/api/chapters/${chapterId}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UpdateCommentPayload) =>
    request<Comment>(`/api/comments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (id: number) =>
    request(`/api/comments/${id}`, {
      method: 'DELETE',
    }),
  resolve: (id: number) =>
    request<Comment>(`/api/comments/${id}/resolve`, {
      method: 'PUT',
    }),
  unresolve: (id: number) =>
    request<Comment>(`/api/comments/${id}/unresolve`, {
      method: 'PUT',
    }),
  // 评论数统计（用于显示徽章）
  getSceneCommentCounts: (bookId: number, module: SceneCommentModule) =>
    request<CommentCountsResponse>(`/api/books/${bookId}/scenes/comment-counts?module=${module}`),
  getChapterCommentCounts: (bookId: number) =>
    request<CommentCountsResponse>(`/api/books/${bookId}/chapters/comment-counts`),
};

// 角色人设 API
export interface CharacterListResponse {
  total: number;
  data: Character[];
}

export interface CreateCharacterPayload {
  name: string;
  description?: string;
  referenceImageUrl?: string;
  halfBodyFrontImageUrl?: string;
  fullBodyFrontImageUrl?: string;
  fullBodySideImageUrl?: string;
  fullBodyBackImageUrl?: string;
  voiceAudioUrl?: string;
  index: number;
}

export interface UpdateCharacterPayload {
  name?: string;
  description?: string;
  referenceImageUrl?: string;
  halfBodyFrontImageUrl?: string;
  fullBodyFrontImageUrl?: string;
  fullBodySideImageUrl?: string;
  fullBodyBackImageUrl?: string;
  voiceAudioUrl?: string;
  index?: number;
}

export const characterApi = {
  list: (bookId: number) => request<CharacterListResponse>(`/api/books/${bookId}/characters`),
  create: (bookId: number, payload: CreateCharacterPayload) =>
    request<Character>(`/api/books/${bookId}/characters`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (bookId: number, characterId: number, payload: UpdateCharacterPayload) =>
    request<Character>(`/api/books/${bookId}/characters/${characterId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (bookId: number, characterId: number) =>
    request(`/api/books/${bookId}/characters/${characterId}`, {
      method: 'DELETE',
    }),
};

// 场景参考资料 API
export interface SceneReferenceListResponse {
  total: number;
  data: SceneReference[];
}

export interface CreateSceneReferencePayload {
  index: number;
  imageUrl?: string;
  description?: string;
}

export interface UpdateSceneReferencePayload {
  index?: number;
  imageUrl?: string;
  description?: string;
}

export const sceneReferenceApi = {
  list: (sceneId: number) =>
    request<SceneReferenceListResponse>(`/api/scenes/${sceneId}/references`),
  create: (sceneId: number, payload: CreateSceneReferencePayload) =>
    request<SceneReference>(`/api/scenes/${sceneId}/references`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (sceneId: number, referenceId: number, payload: UpdateSceneReferencePayload) =>
    request<SceneReference>(`/api/scenes/${sceneId}/references/${referenceId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (sceneId: number, referenceId: number) =>
    request(`/api/scenes/${sceneId}/references/${referenceId}`, {
      method: 'DELETE',
    }),
  deleteAll: (sceneId: number) =>
    request(`/api/scenes/${sceneId}/references`, {
      method: 'DELETE',
    }),
};

// LoRA 库 API
export const loraApi = {
  // 获取 LoRA 列表
  list: async (params?: LoraListParams): Promise<LoraListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.size) searchParams.set('size', String(params.size));
    if (params?.modelType) searchParams.set('modelType', params.modelType);
    if (params?.tag) searchParams.set('tag', params.tag);
    if (params?.keyword) searchParams.set('keyword', params.keyword);

    const queryString = searchParams.toString();
    const endpoint = `/api/loras${queryString ? `?${queryString}` : ''}`;

    return request<LoraListResponse>(endpoint);
  },

  // 创建 LoRA
  create: async (data: CreateLoraRequest): Promise<Lora> => {
    return request<Lora>('/api/loras', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 获取单个 LoRA 详情
  getById: async (id: number): Promise<Lora> => {
    return request<Lora>(`/api/loras/${id}`);
  },

  // 更新 LoRA
  update: async (id: number, data: UpdateLoraRequest): Promise<Lora> => {
    return request<Lora>(`/api/loras/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // 删除 LoRA
  delete: async (id: number): Promise<void> => {
    return request(`/api/loras/${id}`, {
      method: 'DELETE',
    });
  },

  // 获取所有标签
  getTags: async (): Promise<{ tags: string[] }> => {
    return request<{ tags: string[] }>('/api/loras/tags');
  },
};
