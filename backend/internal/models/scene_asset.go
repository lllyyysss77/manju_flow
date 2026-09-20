package models

import (
	"time"
)

// SceneAsset 场景资产模型
type SceneAsset struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	BookID             uint      `gorm:"not null;uniqueIndex:uq_scene_assets_book_code,priority:1" json:"bookId"`
	Name               string    `gorm:"size:100;not null" json:"name"`
	Code               string    `gorm:"size:20;not null;uniqueIndex:uq_scene_assets_book_code,priority:2" json:"code"`
	Description        string    `gorm:"type:text" json:"description"`
	ReferenceImageUrls []string  `gorm:"serializer:json;type:text" json:"referenceImageUrls"`
	Index              float64   `gorm:"not null;default:0" json:"index"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

// TableName 指定表名
func (SceneAsset) TableName() string {
	return "scene_assets"
}

// SceneAssetListResponse 场景资产列表响应
type SceneAssetListResponse struct {
	Total int64        `json:"total"`
	Data  []SceneAsset `json:"data"`
}

// CreateSceneAssetRequest 创建场景资产请求
type CreateSceneAssetRequest struct {
	Name               string   `json:"name" binding:"required"`
	Code               string   `json:"code" binding:"required"`
	Description        string   `json:"description"`
	ReferenceImageUrls []string `json:"referenceImageUrls"`
	Index              float64  `json:"index"`
}

// UpdateSceneAssetRequest 更新场景资产请求
type UpdateSceneAssetRequest struct {
	Name               *string   `json:"name"`
	Code               *string   `json:"code"`
	Description        *string   `json:"description"`
	ReferenceImageUrls *[]string `json:"referenceImageUrls"`
	Index              *float64  `json:"index"`
}
