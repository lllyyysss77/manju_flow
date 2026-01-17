package models

import (
	"time"

	"gorm.io/gorm"
)

// Character 角色人设模型
type Character struct {
	ID                uint           `gorm:"primaryKey" json:"id"`
	BookID            uint           `gorm:"not null;index" json:"bookId"`
	Name              string         `gorm:"size:100;not null" json:"name"`
	Description       string         `gorm:"type:text" json:"description"`
	ReferenceImageUrl string         `gorm:"size:500" json:"referenceImageUrl"`
	Index             float64        `gorm:"not null;default:0" json:"index"`
	CreatedAt         time.Time      `json:"createdAt"`
	UpdatedAt         time.Time      `json:"updatedAt"`
	DeletedAt         gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName 指定表名
func (Character) TableName() string {
	return "characters"
}

// CreateCharacterRequest 创建角色请求
type CreateCharacterRequest struct {
	Name              string  `json:"name" binding:"required"`
	Description       string  `json:"description"`
	ReferenceImageUrl string  `json:"referenceImageUrl"`
	Index             float64 `json:"index"`
}

// UpdateCharacterRequest 更新角色请求
type UpdateCharacterRequest struct {
	Name              *string  `json:"name"`
	Description       *string  `json:"description"`
	ReferenceImageUrl *string  `json:"referenceImageUrl"`
	Index             *float64 `json:"index"`
}
