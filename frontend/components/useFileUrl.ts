import { useCallback } from 'react';
import { getFileUrl } from '../api';

/**
 * 文件 URL 解析 Hook
 * 后端代理模式下直接拼接 URL，浏览器通过 Cache-Control + ETag 自动缓存
 * 保持 async 签名兼容，防止遗漏的调用点报错
 */
export function useFileUrl() {
  const resolveFileUrl = useCallback(async (raw?: string | null): Promise<string> => {
    return Promise.resolve(getFileUrl(raw));
  }, []);

  const clearCache = useCallback(() => {
    // no-op: 浏览器原生缓存，无需手动清理
  }, []);

  return { resolveFileUrl, clearCache };
}
