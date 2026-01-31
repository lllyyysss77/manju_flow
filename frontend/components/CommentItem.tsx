import React, { useState, useMemo } from 'react';
import { Pencil, Trash2, X, Check, CheckCircle, Circle, ZoomIn } from 'lucide-react';
import { Comment, CommentMeta } from '../types';

export interface CommentItemProps {
  comment: Comment;
  onUpdate?: (commentId: number, content: string) => Promise<void>;
  onDelete?: (commentId: number) => Promise<void>;
  onResolve?: (commentId: number) => Promise<void>;
  onUnresolve?: (commentId: number) => Promise<void>;
  /** 作者名字的颜色 class，默认 text-blue-400 */
  authorColorClass?: string;
  /** 额外显示在作者名旁边的内容，如时间码标签 */
  extraBadge?: React.ReactNode;
  /** 点击评论时的回调 */
  onClick?: () => void;
  /** 编辑内容变化时的回调，用于实现 @ 自动补全等功能，返回处理后的内容 */
  onEditContentChange?: (prevContent: string, newContent: string) => string;
}

const formatCommentTime = (value?: string) =>
  value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '';

const getCommentAuthor = (c: Comment) => c.user?.nickname || c.user?.username || '匿名用户';

/** 判断评论是否被编辑过：updatedAt 比 createdAt 晚超过 1 秒 */
const isEdited = (c: Comment) => {
  if (!c.createdAt || !c.updatedAt) return false;
  const created = new Date(c.createdAt).getTime();
  const updated = new Date(c.updatedAt).getTime();
  return updated - created > 1000;
};

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  onUpdate,
  onDelete,
  onResolve,
  onUnresolve,
  authorColorClass = 'text-blue-400',
  extraBadge,
  onClick,
  onEditContentChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditContent(comment.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async () => {
    if (!onUpdate || !editContent.trim()) return;
    setIsSaving(true);
    try {
      await onUpdate(comment.id, editContent.trim());
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update comment', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(comment.id);
    } catch (err) {
      console.error('Failed to delete comment', err);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleToggleResolve = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isResolving) return;
    setIsResolving(true);
    try {
      if (comment.status === 'resolved') {
        if (onUnresolve) await onUnresolve(comment.id);
      } else {
        if (onResolve) await onResolve(comment.id);
      }
    } catch (err) {
      console.error('Failed to toggle resolve status', err);
    } finally {
      setIsResolving(false);
    }
  };

  const edited = isEdited(comment);
  const canEdit = !!onUpdate;
  const canDelete = !!onDelete;
  const canResolve = !!onResolve || !!onUnresolve;
  const isResolved = comment.status === 'resolved';

  // 解析评论元数据中的图片
  const commentMeta = useMemo<CommentMeta | null>(() => {
    if (!comment.meta) return null;
    try {
      return JSON.parse(comment.meta);
    } catch {
      return null;
    }
  }, [comment.meta]);

  const [showImagePreview, setShowImagePreview] = useState(false);

  return (
    <div
      className={`bg-[#1a1a1a] p-4 rounded-2xl border transition-all group relative ${
        isResolved
          ? 'border-green-500/20 opacity-60'
          : 'border-white/5 hover:border-blue-500/20'
      } ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-10 bg-black/80 rounded-2xl flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-sm text-white mb-3">确定删除这条评论吗？</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(false);
                }}
                className="px-3 py-1.5 text-xs rounded-lg border border-white/20 text-white/70 hover:bg-white/10 transition-colors"
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-60"
                disabled={isDeleting}
              >
                {isDeleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          {extraBadge}
          <span className={`text-[10px] font-bold uppercase tracking-tighter ${authorColorClass}`}>
            {getCommentAuthor(comment)}
          </span>
          {isResolved && (
            <span className="flex items-center gap-0.5 text-[9px] text-green-400">
              <CheckCircle size={10} /> 已解决
            </span>
          )}
          {edited && (
            <span className="text-[9px] text-white/30 italic">已编辑</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/30">{formatCommentTime(comment.createdAt)}</span>
          {/* 操作按钮 - hover 时显示 */}
          {(canEdit || canDelete || canResolve) && !isEditing && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {canResolve && (
                <button
                  onClick={handleToggleResolve}
                  className={`p-1 rounded transition-colors ${
                    isResolved
                      ? 'hover:bg-yellow-500/20 text-green-400 hover:text-yellow-400'
                      : 'hover:bg-green-500/20 text-white/40 hover:text-green-400'
                  }`}
                  title={isResolved ? '标记为未解决' : '标记为已解决'}
                  disabled={isResolving}
                >
                  {isResolved ? <CheckCircle size={12} /> : <Circle size={12} />}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={handleStartEdit}
                  className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                  title="编辑"
                >
                  <Pencil size={12} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
                  className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                  title="删除"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            className="w-full bg-[#0f0f0f] border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500/50 min-h-[60px] resize-none"
            value={editContent}
            onChange={(e) => {
              const newValue = e.target.value;
              if (onEditContentChange) {
                setEditContent(onEditContentChange(editContent, newValue));
              } else {
                setEditContent(newValue);
              }
            }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSaveEdit();
              } else if (e.key === 'Escape') {
                handleCancelEdit();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border border-white/10 text-white/60 hover:bg-white/5 transition-colors"
              disabled={isSaving}
            >
              <X size={12} /> 取消
            </button>
            <button
              onClick={handleSaveEdit}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-60"
              disabled={isSaving || !editContent.trim()}
            >
              <Check size={12} /> {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* 文字内容 */}
          {comment.content && comment.content !== '（图片）' && (
            <p className="text-sm text-white/70 leading-relaxed font-medium whitespace-pre-line">
              {comment.content}
            </p>
          )}
          {/* 图片附件 */}
          {commentMeta?.imageUrl && (
            <div className="mt-2">
              <div
                className="relative inline-block cursor-pointer group/img"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowImagePreview(true);
                }}
              >
                <img
                  src={commentMeta.imageUrl}
                  alt={commentMeta.imageName || '评论图片'}
                  className="max-h-40 rounded-lg border border-white/10 hover:border-blue-500/50 transition-colors"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/30 rounded-lg transition-colors">
                  <ZoomIn size={20} className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 图片放大预览弹窗 */}
      {showImagePreview && commentMeta?.imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={(e) => {
            e.stopPropagation();
            setShowImagePreview(false);
          }}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowImagePreview(false);
            }}
          >
            <X size={24} />
          </button>
          <img
            src={commentMeta.imageUrl}
            alt={commentMeta.imageName || '评论图片'}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
