package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// LoraModelType LoRA 适用模型类型
type LoraModelType string

const (
	LoraModelSD15 LoraModelType = "SD_1.5"
	LoraModelSDXL LoraModelType = "SDXL"
)

// Lora LoRA 模型
type Lora struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"size:255;not null" json:"name"`
	Description string         `gorm:"type:text" json:"description"`
	ModelType   LoraModelType  `gorm:"size:20;not null" json:"modelType"`
	Tags        string         `gorm:"type:text" json:"tags"` // JSON 数组存储标签
	FileUrl     string         `gorm:"size:500" json:"fileUrl"`
	FileSize    int64          `gorm:"default:0" json:"fileSize"`
	PreviewUrl  string         `gorm:"size:500" json:"previewUrl"`
	ConfigUrl   string         `gorm:"size:500" json:"configUrl"`
	UploaderID  uint           `gorm:"not null;index" json:"uploaderId"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName 指定表名
func (Lora) TableName() string {
	return "loras"
}

// GetTags 解析标签 JSON 数组
func (l *Lora) GetTags() []string {
	if l.Tags == "" {
		return []string{}
	}
	var tags []string
	if err := json.Unmarshal([]byte(l.Tags), &tags); err != nil {
		return []string{}
	}
	return tags
}

// SetTags 设置标签 JSON 数组
func (l *Lora) SetTags(tags []string) {
	if len(tags) == 0 {
		l.Tags = ""
		return
	}
	data, _ := json.Marshal(tags)
	l.Tags = string(data)
}

// LoraListResponse 列表响应
type LoraListResponse struct {
	Total int64  `json:"total"`
	Page  int    `json:"page"`
	Size  int    `json:"size"`
	Data  []Lora `json:"data"`
}

// CreateLoraRequest 创建 LoRA 请求
type CreateLoraRequest struct {
	Name        string         `json:"name" binding:"required"`
	Description string         `json:"description"`
	ModelType   LoraModelType  `json:"modelType" binding:"required,oneof=SD_1.5 SDXL"`
	Tags        []string       `json:"tags"`
	FileUrl     string         `json:"fileUrl"`
	FileSize    int64          `json:"fileSize"`
	PreviewUrl  string         `json:"previewUrl"`
	ConfigUrl   string         `json:"configUrl"`
}

// UpdateLoraRequest 更新 LoRA 请求
type UpdateLoraRequest struct {
	Name        string        `json:"name"`
	Description string        `json:"description"`
	ModelType   LoraModelType `json:"modelType" binding:"omitempty,oneof=SD_1.5 SDXL"`
	Tags        []string      `json:"tags"`
	FileUrl     string        `json:"fileUrl"`
	FileSize    int64         `json:"fileSize"`
	PreviewUrl  string        `json:"previewUrl"`
	ConfigUrl   string        `json:"configUrl"`
}

// LoraTagResponse 标签响应
type LoraTagResponse struct {
	Tags []string `json:"tags"`
}
