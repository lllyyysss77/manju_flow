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
};

// 工具函数：将后端 Book 转换为前端 Project 格式
import {
  Comment,
  CommentListResponse,
  CommentModule,
  Project,
  Status,
  Episode,
  Scene,
  ChapterVideo,
  ChapterVideoVersion,
  VideoStatus,
  SceneFrameSet,
  SceneFrameSetVersion,
  SceneAnimation,
  SceneAnimationVersion,
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
  referenceImageUrl?: string;
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

  getSignedUrl: (keyOrUrl: string) => {
    const idx = keyOrUrl.lastIndexOf('/api/files/');
    const key = idx >= 0 ? keyOrUrl.slice(idx + '/api/files/'.length) : keyOrUrl;
    const encodedKey = encodeURIComponent(key);
    return request<{ url: string }>(`/api/files/${encodedKey}?redirect=false`).then(res => ({
      ...res,
      url: ensureHttpsUrl(res.url),
    }));
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

export interface CreateAnimationPayload {
  name: string;
  index: number;
}

export interface UpdateAnimationPayload {
  name?: string;
  index?: number;
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
};
