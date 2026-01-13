package models

import (
	"time"

	"gorm.io/gorm"
)

// FrameType 帧类型
type FrameType string

const (
	FrameTypeStart FrameType = "START" // 起始帧
	FrameTypeEnd   FrameType = "END"   // 结束帧
)

// SceneFrameSet 场景帧集模型 - 每个场景可以有多套首尾帧
type SceneFrameSet struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	SceneID           uint           `gorm:"not null;index" json:"sceneId"`
	Name              string         `gorm:"size:100;not null" json:"name"`  // 帧集名称（如：镜头1、镜头2）
	Index             float64        `gorm:"not null" json:"index"`          // 排序索引，支持中间插入
	StartFrameUrl     string         `gorm:"type:text" json:"startFrameUrl"` // 当前起始帧URL
	StartFrameVersion int            `gorm:"default:0" json:"startFrameVersion"`
	EndFrameUrl       string         `gorm:"type:text" json:"endFrameUrl"` // 当前结束帧URL
	EndFrameVersion   int            `gorm:"default:0" json:"endFrameVersion"`
	CreatedAt         time.Time      `json:"createdAt"`
	UpdatedAt         time.Time      `json:"updatedAt"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联（无外键约束，通过业务逻辑保证数据完整性）
	Scene Scene `gorm:"foreignKey:SceneID;constraint:false" json:"-"`
}

// TableName 指定表名
func (SceneFrameSet) TableName() string {
	return "scene_frame_sets"
}

// SceneFrameSetVersion 帧集版本模型 - 记录每个帧的版本历史
type SceneFrameSetVersion struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	SceneFrameSetID uint           `gorm:"not null;index" json:"sceneFrameSetId"`
	FrameType       FrameType      `gorm:"size:20;not null;index" json:"frameType"` // START or END
	ImageUrl        string         `gorm:"type:text;not null" json:"imageUrl"`
	Version         int            `gorm:"not null" json:"version"`   // 版本号，从1开始递增
	CreatedBy       uint           `gorm:"not null" json:"createdBy"` // 创建者ID
	CreatedAt       time.Time      `json:"createdAt"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联（无外键约束，通过业务逻辑保证数据完整性）
	SceneFrameSet SceneFrameSet `gorm:"foreignKey:SceneFrameSetID;constraint:false" json:"-"`
	Creator       User          `gorm:"foreignKey:CreatedBy;constraint:false" json:"-"`
}

// TableName 指定表名
func (SceneFrameSetVersion) TableName() string {
	return "scene_frame_set_versions"
}

// SceneFrameSetListResponse 帧集列表响应
type SceneFrameSetListResponse struct {
	Total int64           `json:"total"`
	Data  []SceneFrameSet `json:"data"`
}

// SceneFrameSetVersionListResponse 版本列表响应
type SceneFrameSetVersionListResponse struct {
	Total int64                  `json:"total"`
	Data  []SceneFrameSetVersion `json:"data"`
}

// CreateSceneFrameSetRequest 创建帧集请求
type CreateSceneFrameSetRequest struct {
	Name  string  `json:"name" binding:"required"`  // 帧集名称
	Index float64 `json:"index" binding:"required"` // 排序索引
}

// UpdateSceneFrameSetRequest 更新帧集请求
type UpdateSceneFrameSetRequest struct {
	Name  *string  `json:"name"`  // 帧集名称
	Index *float64 `json:"index"` // 排序索引
}

// UpdateFrameRequest 更新帧请求
type UpdateFrameRequest struct {
	ImageUrl string `json:"imageUrl" binding:"required"`
}

// RevertFrameRequest 回滚帧请求
type RevertFrameRequest struct {
	Version int `json:"version" binding:"required"`
}
