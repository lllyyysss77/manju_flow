// API 服务层 - 连接后端接口

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

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
import { Project, Status, Episode, Scene } from './types';

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
    });
  },
  getSignedUrl: (keyOrUrl: string) => {
    const idx = keyOrUrl.lastIndexOf('/api/files/');
    const key = idx >= 0 ? keyOrUrl.slice(idx + '/api/files/'.length) : keyOrUrl;
    const encodedKey = encodeURIComponent(key);
    return request<{ url: string }>(`/api/files/${encodedKey}?redirect=false`);
  },
};
