package models

import (
	"time"

	"gorm.io/gorm"
)

// Character 角色人设模型
type Character struct {
	ID                    uint           `gorm:"primaryKey" json:"id"`
	BookID                uint           `gorm:"not null;index" json:"bookId"`
	Name                  string         `gorm:"size:100;not null" json:"name"`
	Description           string         `gorm:"type:text" json:"description"`
	CoreFeatures          string         `gorm:"type:text" json:"coreFeatures"`
	ReferenceImageUrl     string         `gorm:"size:500" json:"referenceImageUrl"`
	HalfBodyFrontImageUrl string         `gorm:"size:500" json:"halfBodyFrontImageUrl"`
	FullBodyFrontImageUrl string         `gorm:"size:500" json:"fullBodyFrontImageUrl"`
	FullBodySideImageUrl  string         `gorm:"size:500" json:"fullBodySideImageUrl"`
	FullBodyBackImageUrl  string         `gorm:"size:500" json:"fullBodyBackImageUrl"`
	VoiceAudioUrl         string         `gorm:"size:500" json:"voiceAudioUrl"`
	Index                 float64        `gorm:"not null;default:0" json:"index"`
	CreatedAt             time.Time      `json:"createdAt"`
	UpdatedAt             time.Time      `json:"updatedAt"`
	DeletedAt             gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName 指定表名
func (Character) TableName() string {
	return "characters"
}

// CreateCharacterRequest 创建角色请求
type CreateCharacterRequest struct {
	Name                  string  `json:"name" binding:"required"`
	Description           string  `json:"description"`
	CoreFeatures          string  `json:"coreFeatures"`
	ReferenceImageUrl     string  `json:"referenceImageUrl"`
	HalfBodyFrontImageUrl string  `json:"halfBodyFrontImageUrl"`
	FullBodyFrontImageUrl string  `json:"fullBodyFrontImageUrl"`
	FullBodySideImageUrl  string  `json:"fullBodySideImageUrl"`
	FullBodyBackImageUrl  string  `json:"fullBodyBackImageUrl"`
	VoiceAudioUrl         string  `json:"voiceAudioUrl"`
	Index                 float64 `json:"index"`
}

// UpdateCharacterRequest 更新角色请求
type UpdateCharacterRequest struct {
	Name                  *string  `json:"name"`
	Description           *string  `json:"description"`
	CoreFeatures          *string  `json:"coreFeatures"`
	ReferenceImageUrl     *string  `json:"referenceImageUrl"`
	HalfBodyFrontImageUrl *string  `json:"halfBodyFrontImageUrl"`
	FullBodyFrontImageUrl *string  `json:"fullBodyFrontImageUrl"`
	FullBodySideImageUrl  *string  `json:"fullBodySideImageUrl"`
	FullBodyBackImageUrl  *string  `json:"fullBodyBackImageUrl"`
	VoiceAudioUrl         *string  `json:"voiceAudioUrl"`
	Index                 *float64 `json:"index"`
}

// GenerateCharacterCoreFeaturesRequest 根据角色参考图生成核心特征请求
type GenerateCharacterCoreFeaturesRequest struct {
	ImageKey    string `json:"imageKey"`
	Model       string `json:"model"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// GenerateCharacterCoreFeaturesResponse 根据角色参考图生成核心特征响应
type GenerateCharacterCoreFeaturesResponse struct {
	CoreFeatures string `json:"coreFeatures"`
	Model        string `json:"model"`
}
