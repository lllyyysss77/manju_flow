package models

import (
	"time"

	"gorm.io/gorm"
)

// FileVisibility 文件可见性
type FileVisibility string

const (
	FileVisibilityPublic  FileVisibility = "public"
	FileVisibilityPrivate FileVisibility = "private"
)

// File 文件模型
type File struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Key          string         `gorm:"size:500;not null;uniqueIndex" json:"key"`          // OSS 对象键
	OriginalName string         `gorm:"size:255;not null" json:"originalName"`             // 原始文件名
	Size         int64          `gorm:"not null" json:"size"`                              // 文件大小（字节）
	MimeType     string         `gorm:"size:100" json:"mimeType"`                          // MIME 类型
	UploaderID   uint           `gorm:"not null;index" json:"uploaderId"`                  // 上传者 ID
	Uploader     User           `gorm:"foreignKey:UploaderID" json:"uploader,omitempty"`   // 上传者
	Visibility   FileVisibility `gorm:"size:20;not null;default:private" json:"visibility"` // 可见性
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName 指定表名
func (File) TableName() string {
	return "files"
}

// FileUploadRequest 文件上传请求
type FileUploadRequest struct {
	Visibility FileVisibility `form:"visibility"` // 可见性，默认 private
}

// FileResponse 文件响应
type FileResponse struct {
	ID           uint           `json:"id"`
	Key          string         `json:"key"`
	OriginalName string         `json:"originalName"`
	Size         int64          `json:"size"`
	MimeType     string         `json:"mimeType"`
	UploaderID   uint           `json:"uploaderId"`
	Visibility   FileVisibility `json:"visibility"`
	URL          string         `json:"url"` // 访问 URL
	CreatedAt    time.Time      `json:"createdAt"`
}

// ToResponse 转换为响应结构
func (f *File) ToResponse(baseURL string) FileResponse {
	return FileResponse{
		ID:           f.ID,
		Key:          f.Key,
		OriginalName: f.OriginalName,
		Size:         f.Size,
		MimeType:     f.MimeType,
		UploaderID:   f.UploaderID,
		Visibility:   f.Visibility,
		URL:          baseURL + "/api/files/" + f.Key,
		CreatedAt:    f.CreatedAt,
	}
}
