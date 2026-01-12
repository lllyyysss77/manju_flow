import { useCallback, useEffect, useState } from 'react';
import { commentApi, SceneCommentModule } from '../api';
import { Comment } from '../types';

export function useSceneComments(sceneId?: number | null, module?: SceneCommentModule) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sceneId || !module) {
      setComments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await commentApi.listScene(sceneId, module);
      setComments(res.data || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '获取评论失败';
      setError(msg);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [module, sceneId]);

  useEffect(() => {
    setComments([]);
    setError(null);
    refresh();
  }, [refresh]);

  const addComment = useCallback(
    async (content: string, meta?: string) => {
      if (!sceneId || !module) {
        throw new Error('缺少场景或模块信息，无法创建评论');
      }
      setPosting(true);
      try {
        const created = await commentApi.createScene(sceneId, module, { content, meta });
        setComments(prev => [created, ...prev]);
        return created;
      } finally {
        setPosting(false);
      }
    },
    [module, sceneId]
  );

  return {
    comments,
    loading,
    posting,
    error,
    refresh,
    addComment,
  };
}
