package models

import (
	"time"

	"gorm.io/gorm"
)

// CommentModule 评论所属模块
type CommentModule string

const (
	CommentModuleScript     CommentModule = "script"     // 剧本创作
	CommentModuleStoryboard CommentModule = "storyboard" // 分镜绘制
	CommentModuleAnimation  CommentModule = "animation"  // 动画制作
	CommentModuleAudio      CommentModule = "audio"      // 音频后期
	CommentModuleReview     CommentModule = "review"     // 审核交付
)

// CommentTargetType 评论目标类型
type CommentTargetType string

const (
	CommentTargetScene   CommentTargetType = "scene"   // 场景
	CommentTargetChapter CommentTargetType = "chapter" // 章节
)

// CommentStatus 评论状态
type CommentStatus string

const (
	CommentStatusUnresolved CommentStatus = "unresolved" // 未解决
	CommentStatusResolved   CommentStatus = "resolved"   // 已解决
)

// Comment 评论模型
// 支持多种评论对象（场景、章节）和多种模块上下文
type Comment struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// 评论内容
	Content string `gorm:"type:text;not null" json:"content"`

	// 评论目标 - 多态关联
	TargetType CommentTargetType `gorm:"size:20;not null;index:idx_target" json:"targetType"` // scene / chapter
	TargetID   uint              `gorm:"not null;index:idx_target" json:"targetId"`

	// 模块上下文 - 同一个目标在不同模块的评论互相隔离
	Module CommentModule `gorm:"size:20;not null;index" json:"module"`

	// 作者（无外键约束，通过业务逻辑保证数据完整性）
	UserID uint `gorm:"not null;index" json:"userId"`
	User   User `gorm:"foreignKey:UserID;constraint:false" json:"user,omitempty"`

	// 元数据 - JSON 格式，存储特殊信息
	// 审核交付模块的时间点: {"timecode": "3:56", "seconds": 236}
	Meta string `gorm:"type:text" json:"meta,omitempty"`

	// 状态 - 未解决/已解决
	Status CommentStatus `gorm:"size:20;not null;default:unresolved" json:"status"`
}

// TableName 指定表名
func (Comment) TableName() string {
	return "comments"
}

// CommentListResponse 评论列表响应
type CommentListResponse struct {
	Total int64     `json:"total"`
	Data  []Comment `json:"data"`
}

// CreateCommentRequest 创建评论请求
type CreateCommentRequest struct {
	Content string `json:"content" binding:"required"`
	Meta    string `json:"meta,omitempty"` // JSON 格式的元数据
}

// UpdateCommentRequest 更新评论请求
type UpdateCommentRequest struct {
	Content *string        `json:"content,omitempty"`
	Meta    *string        `json:"meta,omitempty"`
	Status  *CommentStatus `json:"status,omitempty"`
}
