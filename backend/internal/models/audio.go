package models

import (
	"time"

	"gorm.io/gorm"
)

// SceneAudio 场景音频轨道模型 - 每个场景可以有多个音频轨道（多人对话+旁白）
type SceneAudio struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	SceneID      uint           `gorm:"not null;index" json:"sceneId"`
	Role         string         `gorm:"size:100;not null" json:"role"` // 角色/类型（如：角色A、旁白、背景音效）
	Index        float64        `gorm:"not null" json:"index"`         // 排序索引，支持中间插入
	AudioUrl     string         `gorm:"type:text" json:"audioUrl"`     // 当前音频URL
	AudioVersion int            `gorm:"default:0" json:"audioVersion"` // 当前版本号
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联（无外键约束，通过业务逻辑保证数据完整性）
	Scene Scene `gorm:"foreignKey:SceneID;constraint:false" json:"-"`
}

// TableName 指定表名
func (SceneAudio) TableName() string {
	return "scene_audios"
}

// SceneAudioVersion 音频版本模型 - 记录每个音频轨道的版本历史
type SceneAudioVersion struct {
	ID               uint                   `gorm:"primaryKey" json:"id"`
	SceneAudioID     uint                   `gorm:"not null;index" json:"sceneAudioId"`
	AudioUrl         string                 `gorm:"type:text;not null" json:"audioUrl"` // 音频URL
	Version          int                    `gorm:"not null" json:"version"`            // 版本号，从1开始递增
	GenerationParams *AudioGenerationParams `gorm:"serializer:json;type:text" json:"generationParams"`
	CreatedBy        uint                   `gorm:"not null" json:"createdBy"` // 创建者ID
	CreatedAt        time.Time              `json:"createdAt"`
	DeletedAt        gorm.DeletedAt         `gorm:"index" json:"-"`

	// 关联（无外键约束，通过业务逻辑保证数据完整性）
	SceneAudio SceneAudio `gorm:"foreignKey:SceneAudioID;constraint:false" json:"-"`
	Creator    User       `gorm:"foreignKey:CreatedBy;constraint:false" json:"-"`
}

// AudioReferenceAsset 音频生成参考资产
type AudioReferenceAsset struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

// AudioGenerationParams Seed Audio 生成参数快照
type AudioGenerationParams struct {
	TextPrompt      string                `json:"textPrompt"`
	ReferenceAudios []AudioReferenceAsset `json:"referenceAudios"`
	PitchRate       int                   `json:"pitchRate"`     // 语调 [-12, 12]，0 为默认
	SpeechRate      int                   `json:"speechRate"`    // 语速 [-50, 100]，0 为 1 倍速
	LoudnessRate    int                   `json:"loudnessRate"`  // 音量 [-50, 100]，0 为 1 倍音量
}

// TableName 指定表名
func (SceneAudioVersion) TableName() string {
	return "scene_audio_versions"
}

// SceneAudioListResponse 音频轨道列表响应
type SceneAudioListResponse struct {
	Total int64        `json:"total"`
	Data  []SceneAudio `json:"data"`
}

// SceneAudioVersionListResponse 版本列表响应
type SceneAudioVersionListResponse struct {
	Total int64               `json:"total"`
	Data  []SceneAudioVersion `json:"data"`
}

// CreateSceneAudioRequest 创建音频轨道请求
type CreateSceneAudioRequest struct {
	Role  string  `json:"role" binding:"required"`  // 角色/类型
	Index float64 `json:"index" binding:"required"` // 排序索引
}

// UpdateSceneAudioRequest 更新音频轨道请求
type UpdateSceneAudioRequest struct {
	Role  *string  `json:"role"`  // 角色/类型
	Index *float64 `json:"index"` // 排序索引
}

// UploadAudioRequest 上传音频请求
type UploadAudioRequest struct {
	AudioUrl string `json:"audioUrl" binding:"required"`
}

// GenerateSceneAudioRequest AI 合成音频请求
type GenerateSceneAudioRequest struct {
	TextPrompt         string   `json:"textPrompt" binding:"required"`
	ReferenceAudioKeys []string `json:"referenceAudioKeys"`
	PitchRate          int      `json:"pitchRate"`     // 语调 [-12, 12]，0 为默认
	SpeechRate         int      `json:"speechRate"`    // 语速 [-50, 100]，0 为 1 倍速
	LoudnessRate       int      `json:"loudnessRate"`  // 音量 [-50, 100]，0 为 1 倍音量
}
