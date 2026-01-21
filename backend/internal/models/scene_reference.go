package models

import (
	"time"

	"gorm.io/gorm"
)

// SceneReference 场景参考资料（一个场景可以有多个参考图/描述）
type SceneReference struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	SceneID     uint           `gorm:"not null;index" json:"sceneId"`
	Index       float64        `gorm:"not null" json:"index"`       // 排序索引
	ImageUrl    string         `gorm:"type:text" json:"imageUrl"`   // 参考图 URL（可选）
	Description string         `gorm:"type:text" json:"description"` // 描述（可选）
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联（无外键约束）
	Scene Scene `gorm:"foreignKey:SceneID;constraint:false" json:"-"`
}

// TableName 指定表名
func (SceneReference) TableName() string {
	return "scene_references"
}

// SceneReferenceListResponse 参考资料列表响应
type SceneReferenceListResponse struct {
	Total int64              `json:"total"`
	Data  []SceneReference   `json:"data"`
}

// CreateSceneReferenceRequest 创建参考资料请求
type CreateSceneReferenceRequest struct {
	Index       *float64 `json:"index" binding:"required"`
	ImageUrl    string   `json:"imageUrl"`
	Description string   `json:"description"`
}

// UpdateSceneReferenceRequest 更新参考资料请求
type UpdateSceneReferenceRequest struct {
	Index       *float64 `json:"index"`
	ImageUrl    *string  `json:"imageUrl"`
	Description *string  `json:"description"`
}

// BatchCreateSceneReferenceRequest 批量创建参考资料请求
type BatchCreateSceneReferenceRequest struct {
	References []CreateSceneReferenceRequest `json:"references" binding:"required,dive"`
}
