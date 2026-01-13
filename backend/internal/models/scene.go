package models

import (
	"time"

	"gorm.io/gorm"
)

// SceneStatus 场景状态
type SceneStatus string

const (
	SceneStatusDraft      SceneStatus = "DRAFT"       // 草稿
	SceneStatusInProgress SceneStatus = "IN_PROGRESS" // 创作中
	SceneStatusCompleted  SceneStatus = "COMPLETED"   // 已完成
)

// Scene 场景模型 - 每个章节包含多个场景
type Scene struct {
	ID                uint        `gorm:"primaryKey" json:"id"`
	ChapterID         uint        `gorm:"not null;index" json:"chapterId"`
	Index             float64     `gorm:"not null" json:"index"` // 使用浮点数便于中间插入
	Status            SceneStatus `gorm:"size:20;not null;default:'DRAFT'" json:"status"`
	Description       string      `gorm:"type:text;not null" json:"description"` // 场景描述（必须）
	CameraMovement    string      `gorm:"type:text" json:"cameraMovement"`       // 运镜
	Dialogue          string      `gorm:"type:text" json:"dialogue"`             // 台词/旁白
	ReferenceImageUrl string      `gorm:"type:text" json:"referenceImageUrl"`    // 参考图
	// 分镜绘制 - 使用 SceneFrameSet 表存储多套首尾帧，不再在 Scene 表中存储
	// 动画制作 - 使用 SceneAnimation 表存储多个动画，不再在 Scene 表中存储
	// 音频后期 - 使用 SceneAudio 表存储多音频轨道，不再在 Scene 表中存储
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联（无外键约束，通过业务逻辑保证数据完整性）
	Chapter Chapter `gorm:"foreignKey:ChapterID;constraint:false" json:"-"`
}

// TableName 指定表名
func (Scene) TableName() string {
	return "scenes"
}

// SceneListResponse 场景列表响应
type SceneListResponse struct {
	Total int64   `json:"total"`
	Data  []Scene `json:"data"`
}

// CreateSceneRequest 创建场景请求
type CreateSceneRequest struct {
	Index             float64     `json:"index" binding:"required"`
	Status            SceneStatus `json:"status"`
	Description       string      `json:"description" binding:"required"`
	CameraMovement    string      `json:"cameraMovement"`
	Dialogue          string      `json:"dialogue"`
	ReferenceImageUrl string      `json:"referenceImageUrl"`
}

// UpdateSceneRequest 更新场景请求
type UpdateSceneRequest struct {
	Index             *float64     `json:"index"`
	Status            *SceneStatus `json:"status"`
	Description       *string      `json:"description"`
	CameraMovement    *string      `json:"cameraMovement"`
	Dialogue          *string      `json:"dialogue"`
	ReferenceImageUrl *string      `json:"referenceImageUrl"`
}
