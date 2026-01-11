package models

import (
	"time"

	"gorm.io/gorm"
)

// AnimationVersion 动画版本模型 - 记录每个场景动画的版本历史
type AnimationVersion struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	SceneID   uint           `gorm:"not null;index" json:"sceneId"`
	VideoUrl  string         `gorm:"type:text;not null" json:"videoUrl"` // 视频URL
	Version   int            `gorm:"not null" json:"version"`            // 版本号，从1开始递增
	CreatedBy uint           `gorm:"not null" json:"createdBy"`          // 创建者ID
	CreatedAt time.Time      `json:"createdAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联
	Scene   Scene `gorm:"foreignKey:SceneID" json:"-"`
	Creator User  `gorm:"foreignKey:CreatedBy" json:"-"`
}

// TableName 指定表名
func (AnimationVersion) TableName() string {
	return "animation_versions"
}

// AnimationVersionListResponse 版本列表响应
type AnimationVersionListResponse struct {
	Total int64              `json:"total"`
	Data  []AnimationVersion `json:"data"`
}

// AnimationInfo 动画信息响应
type AnimationInfo struct {
	SceneID          uint              `json:"sceneId"`
	AnimationUrl     string            `json:"animationUrl"`
	AnimationVersion int               `json:"animationVersion"`
	LatestVersion    *AnimationVersion `json:"latestVersion,omitempty"`
}

// UpdateAnimationRequest 更新动画请求
type UpdateAnimationRequest struct {
	VideoUrl string `json:"videoUrl" binding:"required"`
}
