package models

import (
	"time"

	"gorm.io/gorm"
)

// ChapterStatus 章节状态
type ChapterStatus string

const (
	ChapterStatusDraft      ChapterStatus = "DRAFT"      // 草稿
	ChapterStatusInProgress ChapterStatus = "IN_PROGRESS" // 创作中
	ChapterStatusCompleted  ChapterStatus = "COMPLETED"  // 已完成
)

// Chapter 章节模型 - 每本书包含多个章节
type Chapter struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	BookID    uint           `gorm:"not null;index" json:"bookId"`
	Title     string         `gorm:"size:255;not null" json:"title"`
	Synopsis  string         `gorm:"type:text" json:"synopsis"` // 故事梗概
	Index     float64        `gorm:"not null" json:"index"`     // 使用浮点数便于中间插入
	Status    ChapterStatus  `gorm:"size:20;not null;default:'DRAFT'" json:"status"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联
	Book   Book    `gorm:"foreignKey:BookID" json:"-"`
	Scenes []Scene `gorm:"foreignKey:ChapterID" json:"scenes,omitempty"`
}

// TableName 指定表名
func (Chapter) TableName() string {
	return "chapters"
}

// ChapterListResponse 章节列表响应
type ChapterListResponse struct {
	Total int64     `json:"total"`
	Data  []Chapter `json:"data"`
}

// CreateChapterRequest 创建章节请求
type CreateChapterRequest struct {
	Title    string        `json:"title" binding:"required"`
	Synopsis string        `json:"synopsis"` // 故事梗概
	Index    float64       `json:"index" binding:"required"`
	Status   ChapterStatus `json:"status"`
}

// UpdateChapterRequest 更新章节请求
type UpdateChapterRequest struct {
	Title    *string        `json:"title"`
	Synopsis *string        `json:"synopsis"` // 故事梗概
	Index    *float64       `json:"index"`
	Status   *ChapterStatus `json:"status"`
}
