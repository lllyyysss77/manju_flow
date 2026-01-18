import { useCallback, useRef } from 'react';
import { ensureHttpsUrl, fileApi, isValidMediaUrl, normalizeFileKey } from '../api';

/**
 * 文件 URL 解析 Hook
 * 统一处理 OSS 文件 key 到签名 URL 的转换，带本地缓存
 */
export function useFileUrl() {
  const urlCache = useRef<Record<string, string>>({});

  const resolveFileUrl = useCallback(async (raw?: string | null): Promise<string> => {
    if (!raw) return '';
    // 支持 blob: 和 data: URL 直接返回
    if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw;
    const normalized = ensureHttpsUrl(raw);
    const { key, externalUrl } = normalizeFileKey(normalized);
    // 如果没有 key，只有当 externalUrl 是有效媒体 URL 时才返回
    if (!key) return externalUrl && isValidMediaUrl(externalUrl) ? externalUrl : '';
    const cached = urlCache.current[key];
    if (cached) return cached;
    try {
      const res = await fileApi.getSignedUrl(key);
      if (!res.url) return '';
      const resolved = ensureHttpsUrl(res.url);
      urlCache.current[key] = resolved;
      return resolved;
    } catch (err) {
      console.error('Failed to resolve file url', err);
      return '';
    }
  }, []);

  const clearCache = useCallback(() => {
    urlCache.current = {};
  }, []);

  return { resolveFileUrl, clearCache, urlCache };
}
