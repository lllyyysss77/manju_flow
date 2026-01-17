package models

import (
	"time"

	"gorm.io/gorm"
)

// BookType 书籍类型
type BookType string

const (
	BookTypeNovel BookType = "NOVEL" // 小说
	BookTypeComic BookType = "COMIC" // 漫画
)

// AdaptationStatus 改编状态
type AdaptationStatus string

const (
	AdaptationStatusNone       AdaptationStatus = "NONE"        // 未开始改编
	AdaptationStatusInProgress AdaptationStatus = "IN_PROGRESS" // 改编中
	AdaptationStatusCompleted  AdaptationStatus = "COMPLETED"   // 改编完成
)

// Book 书库模型 - 存储小说和漫画的原始作品
type Book struct {
	ID               uint             `gorm:"primaryKey" json:"id"`
	Title            string           `gorm:"size:255;not null" json:"title"`
	Author           string           `gorm:"size:100;not null" json:"author"`
	Cover            string           `gorm:"size:500" json:"cover"`
	Type             BookType         `gorm:"size:20;not null;default:'NOVEL'" json:"type"`
	Description      string           `gorm:"type:text" json:"description"`
	AdaptationStatus AdaptationStatus `gorm:"size:20;default:'NONE'" json:"adaptationStatus"`
	AdaptedBy        string           `gorm:"size:100" json:"adaptedBy"` // 正在改编此作品的编剧
	ChapterCount     int              `gorm:"default:0" json:"chapterCount"`
	Outline          string           `gorm:"type:text" json:"outline"` // 大纲（纯文本）
	CreatedAt        time.Time        `json:"createdAt"`
	UpdatedAt        time.Time        `json:"updatedAt"`
	DeletedAt        gorm.DeletedAt   `gorm:"index" json:"-"`
}

// TableName 指定表名
func (Book) TableName() string {
	return "books"
}

// BookListResponse 列表响应
type BookListResponse struct {
	Total int64  `json:"total"`
	Page  int    `json:"page"`
	Size  int    `json:"size"`
	Data  []Book `json:"data"`
}

// CreateBookRequest 创建书籍请求
type CreateBookRequest struct {
	Title       string   `json:"title" binding:"required"`
	Author      string   `json:"author" binding:"required"`
	Cover       string   `json:"cover"`
	Type        BookType `json:"type" binding:"required,oneof=NOVEL COMIC"`
	Description string   `json:"description"`
	Outline     string   `json:"outline"`
}
