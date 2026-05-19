package models

import (
	"time"

	"gorm.io/gorm"
)

// AnimationTaskStatus 动画生成任务状态
type AnimationTaskStatus string

const (
	AnimationTaskStatusPending    AnimationTaskStatus = "PENDING"
	AnimationTaskStatusProcessing AnimationTaskStatus = "PROCESSING"
	AnimationTaskStatusSucceeded  AnimationTaskStatus = "SUCCEEDED"
	AnimationTaskStatusFailed     AnimationTaskStatus = "FAILED"
)

// AnimationTaskReferenceAsset 动画任务参考素材
type AnimationTaskReferenceAsset struct {
	Source   string `json:"source"`
	Name     string `json:"name"`
	MimeType string `json:"mimeType,omitempty"`
}

// SceneAnimation 场景动画模型 - 每个场景可以有多个动画
type SceneAnimation struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	SceneID          uint           `gorm:"not null;index" json:"sceneId"`
	Name             string         `gorm:"size:100;not null" json:"name"` // 动画名称（如：动画1、动画2）
	Index            float64        `gorm:"not null" json:"index"`         // 排序索引，支持中间插入
	AnimationUrl     string         `gorm:"type:text" json:"animationUrl"` // 当前动画URL
	AnimationVersion int            `gorm:"default:0" json:"animationVersion"`
	CreatedAt        time.Time      `json:"createdAt"`
	UpdatedAt        time.Time      `json:"updatedAt"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联（无外键约束，通过业务逻辑保证数据完整性）
	Scene Scene `gorm:"foreignKey:SceneID;constraint:false" json:"-"`
}

// TableName 指定表名
func (SceneAnimation) TableName() string {
	return "scene_animations"
}

// SceneAnimationVersion 动画版本模型 - 记录每个动画的版本历史
type SceneAnimationVersion struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	SceneAnimationID uint           `gorm:"not null;index" json:"sceneAnimationId"`
	GenerationTaskID *uint          `gorm:"index" json:"generationTaskId"`
	VideoUrl         string         `gorm:"type:text;not null" json:"videoUrl"` // 视频URL
	Version          int            `gorm:"not null" json:"version"`            // 版本号，从1开始递增
	CreatedBy        uint           `gorm:"not null" json:"createdBy"`          // 创建者ID
	CreatedAt        time.Time      `json:"createdAt"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联（无外键约束，通过业务逻辑保证数据完整性）
	SceneAnimation SceneAnimation               `gorm:"foreignKey:SceneAnimationID;constraint:false" json:"-"`
	GenerationTask SceneAnimationGenerationTask `gorm:"foreignKey:GenerationTaskID;constraint:false" json:"-"`
	Creator        User                         `gorm:"foreignKey:CreatedBy;constraint:false" json:"-"`
}

// TableName 指定表名
func (SceneAnimationVersion) TableName() string {
	return "scene_animation_versions"
}

// SceneAnimationGenerationTask 动画生成任务模型
type SceneAnimationGenerationTask struct {
	ID                       uint                `gorm:"primaryKey" json:"id"`
	SceneID                  uint                `gorm:"not null;index" json:"sceneId"`
	SceneAnimationID         uint                `gorm:"not null;index" json:"sceneAnimationId"`
	ArkTaskID                string              `gorm:"size:100;index" json:"arkTaskId"`
	Status                   AnimationTaskStatus `gorm:"size:20;not null;default:'PENDING';index" json:"status"`
	Text                     string              `gorm:"type:text;not null" json:"text"`
	Ratio                    string              `gorm:"size:20;not null" json:"ratio"`
	Duration                 int                 `gorm:"not null" json:"duration"`
	Model                    string              `gorm:"size:100;not null" json:"model"`
	ActualModel              string              `gorm:"column:actual_model;size:100" json:"actualModel"`
	ReferenceImageKeysJSON   string              `gorm:"column:reference_image_keys;type:text" json:"-"`
	ReferenceAudioKeysJSON   string              `gorm:"column:reference_audio_keys;type:text" json:"-"`
	ReferenceVideoKeysJSON   string              `gorm:"column:reference_video_keys;type:text" json:"-"`
	ReferenceImageAssetsJSON string              `gorm:"column:reference_image_assets;type:text" json:"-"`
	ReferenceAudioAssetsJSON string              `gorm:"column:reference_audio_assets;type:text" json:"-"`
	ReferenceVideoAssetsJSON string              `gorm:"column:reference_video_assets;type:text" json:"-"`
	ResultVideoUrl           string              `gorm:"type:text" json:"resultVideoUrl"`
	OutputVersion            int                 `gorm:"default:0" json:"outputVersion"`
	ErrorMessage             string              `gorm:"type:text" json:"errorMessage"`
	LastPolledAt             *time.Time          `json:"lastPolledAt"`
	CompletedAt              *time.Time          `json:"completedAt"`
	CreatedBy                uint                `gorm:"not null;index" json:"createdBy"`
	CreatedAt                time.Time           `json:"createdAt"`
	UpdatedAt                time.Time           `json:"updatedAt"`
	DeletedAt                gorm.DeletedAt      `gorm:"index" json:"-"`

	ReferenceImageKeys   []string                      `gorm:"-" json:"referenceImageKeys"`
	ReferenceAudioKeys   []string                      `gorm:"-" json:"referenceAudioKeys"`
	ReferenceVideoKeys   []string                      `gorm:"-" json:"referenceVideoKeys"`
	ReferenceImageAssets []AnimationTaskReferenceAsset `gorm:"-" json:"referenceImageAssets"`
	ReferenceAudioAssets []AnimationTaskReferenceAsset `gorm:"-" json:"referenceAudioAssets"`
	ReferenceVideoAssets []AnimationTaskReferenceAsset `gorm:"-" json:"referenceVideoAssets"`
}

// TableName 指定表名
func (SceneAnimationGenerationTask) TableName() string {
	return "scene_animation_generation_tasks"
}

// SceneAnimationListResponse 动画列表响应
type SceneAnimationListResponse struct {
	Total int64            `json:"total"`
	Data  []SceneAnimation `json:"data"`
}

// SceneAnimationVersionListResponse 版本列表响应
type SceneAnimationVersionListResponse struct {
	Total int64                   `json:"total"`
	Data  []SceneAnimationVersion `json:"data"`
}

// SceneAnimationGenerationTaskListResponse 生成任务列表响应
type SceneAnimationGenerationTaskListResponse struct {
	Total int64                          `json:"total"`
	Data  []SceneAnimationGenerationTask `json:"data"`
}

// CreateSceneAnimationRequest 创建动画请求
type CreateSceneAnimationRequest struct {
	Name  string  `json:"name" binding:"required"`  // 动画名称
	Index float64 `json:"index" binding:"required"` // 排序索引
}

// UpdateSceneAnimationRequest 更新动画请求
type UpdateSceneAnimationRequest struct {
	Name  *string  `json:"name"`  // 动画名称
	Index *float64 `json:"index"` // 排序索引
}

// UploadAnimationRequest 上传动画请求
type UploadAnimationRequest struct {
	VideoUrl string `json:"videoUrl" binding:"required"`
}

// GenerateSceneAnimationRequest 使用视频模型生成动画请求
type GenerateSceneAnimationRequest struct {
	Text               string   `json:"text" binding:"required"`
	Ratio              string   `json:"ratio" binding:"required"`
	Duration           int      `json:"duration" binding:"required"`
	Model              string   `json:"model" binding:"required"`
	ReferenceImageKeys []string `json:"referenceImageKeys"`
	ReferenceAudioKeys []string `json:"referenceAudioKeys"`
	ReferenceVideoKeys []string `json:"referenceVideoKeys"`
}
