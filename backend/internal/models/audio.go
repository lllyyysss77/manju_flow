package models

import (
	"time"

	"gorm.io/gorm"
)

// AudioVersion 音频版本模型 - 记录每个场景音频的版本历史
type AudioVersion struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	SceneID   uint           `gorm:"not null;index" json:"sceneId"`
	AudioUrl  string         `gorm:"type:text;not null" json:"audioUrl"` // 音频URL
	Version   int            `gorm:"not null" json:"version"`            // 版本号，从1开始递增
	CreatedBy uint           `gorm:"not null" json:"createdBy"`          // 创建者ID
	CreatedAt time.Time      `json:"createdAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联
	Scene   Scene `gorm:"foreignKey:SceneID" json:"-"`
	Creator User  `gorm:"foreignKey:CreatedBy" json:"-"`
}

// TableName 指定表名
func (AudioVersion) TableName() string {
	return "audio_versions"
}

// AudioVersionListResponse 版本列表响应
type AudioVersionListResponse struct {
	Total int64          `json:"total"`
	Data  []AudioVersion `json:"data"`
}

// AudioInfo 音频信息响应
type AudioInfo struct {
	SceneID       uint          `json:"sceneId"`
	AudioUrl      string        `json:"audioUrl"`
	AudioVersion  int           `json:"audioVersion"`
	LatestVersion *AudioVersion `json:"latestVersion,omitempty"`
}

// UpdateAudioRequest 更新音频请求
type UpdateAudioRequest struct {
	AudioUrl string `json:"audioUrl" binding:"required"`
}
