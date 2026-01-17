import { useCallback, useRef } from 'react';
import { ensureHttpsUrl, fileApi, normalizeFileKey } from '../api';

/**
 * 文件 URL 解析 Hook
 * 统一处理 OSS 文件 key 到签名 URL 的转换，带本地缓存
 */
export function useFileUrl() {
  const urlCache = useRef<Record<string, string>>({});

  const resolveFileUrl = useCallback(async (raw?: string | null): Promise<string> => {
    if (!raw) return '';
    const normalized = ensureHttpsUrl(raw);
    const { key, externalUrl } = normalizeFileKey(normalized);
    const fallback = externalUrl || normalized;
    if (!key) return fallback;
    const cacheKey = key || fallback;
    const cached = urlCache.current[cacheKey];
    if (cached) return cached;
    try {
      const res = await fileApi.getSignedUrl(key);
      const resolved = ensureHttpsUrl(res.url || fallback);
      urlCache.current[cacheKey] = resolved;
      return resolved;
    } catch (err) {
      console.error('Failed to resolve file url', err);
      return fallback;
    }
  }, []);

  const clearCache = useCallback(() => {
    urlCache.current = {};
  }, []);

  return { resolveFileUrl, clearCache, urlCache };
}
