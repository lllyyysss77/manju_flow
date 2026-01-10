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

// StoryboardVersion 分镜版本模型 - 记录每个帧的版本历史
type StoryboardVersion struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	SceneID   uint           `gorm:"not null;index" json:"sceneId"`
	FrameType FrameType      `gorm:"size:20;not null;index" json:"frameType"` // START or END
	ImageUrl  string         `gorm:"type:text;not null" json:"imageUrl"`
	Version   int            `gorm:"not null" json:"version"`      // 版本号，从1开始递增
	CreatedBy uint           `gorm:"not null" json:"createdBy"`    // 创建者ID
	CreatedAt time.Time      `json:"createdAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联
	Scene   Scene `gorm:"foreignKey:SceneID" json:"-"`
	Creator User  `gorm:"foreignKey:CreatedBy" json:"-"`
}

// TableName 指定表名
func (StoryboardVersion) TableName() string {
	return "storyboard_versions"
}

// StoryboardVersionListResponse 版本列表响应
type StoryboardVersionListResponse struct {
	Total int64               `json:"total"`
	Data  []StoryboardVersion `json:"data"`
}

// StoryboardInfo 分镜信息响应
type StoryboardInfo struct {
	SceneID           uint                 `json:"sceneId"`
	StartFrameUrl     string               `json:"startFrameUrl"`
	StartFrameVersion int                  `json:"startFrameVersion"`
	EndFrameUrl       string               `json:"endFrameUrl"`
	EndFrameVersion   int                  `json:"endFrameVersion"`
	LatestStartFrame  *StoryboardVersion   `json:"latestStartFrame,omitempty"`
	LatestEndFrame    *StoryboardVersion   `json:"latestEndFrame,omitempty"`
}

// UpdateFrameRequest 更新帧请求
type UpdateFrameRequest struct {
	ImageUrl string `json:"imageUrl" binding:"required"`
}

// RevertFrameRequest 回滚帧请求
type RevertFrameRequest struct {
	Version int `json:"version" binding:"required"`
}
