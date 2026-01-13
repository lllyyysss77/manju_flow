package models

import (
	"time"

	"gorm.io/gorm"
)

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
	VideoUrl         string         `gorm:"type:text;not null" json:"videoUrl"` // 视频URL
	Version          int            `gorm:"not null" json:"version"`            // 版本号，从1开始递增
	CreatedBy        uint           `gorm:"not null" json:"createdBy"`          // 创建者ID
	CreatedAt        time.Time      `json:"createdAt"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联（无外键约束，通过业务逻辑保证数据完整性）
	SceneAnimation SceneAnimation `gorm:"foreignKey:SceneAnimationID;constraint:false" json:"-"`
	Creator        User           `gorm:"foreignKey:CreatedBy;constraint:false" json:"-"`
}

// TableName 指定表名
func (SceneAnimationVersion) TableName() string {
	return "scene_animation_versions"
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
