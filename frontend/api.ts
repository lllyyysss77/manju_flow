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

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

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
import { Project, Status } from './types';

export function bookToProject(book: Book): Project {
  // 将后端的 adaptationStatus 映射到前端的 productionStatus
  const statusMap: Record<AdaptationStatus, Status> = {
    'NONE': 'PENDING',
    'IN_PROGRESS': 'IN_PROGRESS',
    'COMPLETED': 'COMPLETED',
  };

  return {
    id: String(book.id),
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
