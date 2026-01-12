package models

import (
	"time"

	"gorm.io/gorm"
)

// VideoStatus 视频状态
type VideoStatus string

const (
	VideoStatusPending    VideoStatus = "PENDING"    // 待处理（等待上传预览版）
	VideoStatusProcessing VideoStatus = "PROCESSING" // 处理中（正在生成预览版）
	VideoStatusReady      VideoStatus = "READY"      // 就绪（可以播放）
	VideoStatusFailed     VideoStatus = "FAILED"     // 处理失败
)

// ChapterVideo 章节交付视频模型 - 每个章节对应一个交付视频
type ChapterVideo struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	ChapterID      uint           `gorm:"not null;uniqueIndex" json:"chapterId"` // 一对一关系
	VideoUrl       string         `gorm:"type:text" json:"videoUrl"`             // 当前原始视频URL
	PreviewUrl     string         `gorm:"type:text" json:"previewUrl"`           // 压缩预览版URL（可选）
	VideoVersion   int            `gorm:"default:0" json:"videoVersion"`         // 当前版本号
	Status         VideoStatus    `gorm:"size:20;not null;default:'PENDING'" json:"status"`
	Duration       int            `gorm:"default:0" json:"duration"`       // 时长（秒）
	FileSize       int64          `gorm:"default:0" json:"fileSize"`       // 原始文件大小（字节）
	PreviewSize    int64          `gorm:"default:0" json:"previewSize"`    // 预览版大小（字节）
	Width          int            `gorm:"default:0" json:"width"`          // 视频宽度
	Height         int            `gorm:"default:0" json:"height"`         // 视频高度
	Format         string         `gorm:"size:50" json:"format"`           // 视频格式（如 mp4, webm）
	Codec          string         `gorm:"size:50" json:"codec"`            // 编码格式（如 h264, h265）
	Bitrate        int            `gorm:"default:0" json:"bitrate"`        // 码率（kbps）
	PreviewBitrate int            `gorm:"default:0" json:"previewBitrate"` // 预览版码率（kbps）
	CreatedAt      time.Time      `json:"createdAt"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联
	Chapter Chapter `gorm:"foreignKey:ChapterID" json:"-"`
}

// TableName 指定表名
func (ChapterVideo) TableName() string {
	return "chapter_videos"
}

// ChapterVideoVersion 视频版本模型 - 记录每个章节视频的版本历史
type ChapterVideoVersion struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	ChapterVideoID uint           `gorm:"not null;index" json:"chapterVideoId"`
	VideoUrl       string         `gorm:"type:text;not null" json:"videoUrl"` // 原始视频URL
	PreviewUrl     string         `gorm:"type:text" json:"previewUrl"`        // 预览版URL（可选）
	Version        int            `gorm:"not null" json:"version"`            // 版本号，从1开始递增
	Duration       int            `gorm:"default:0" json:"duration"`          // 时长（秒）
	FileSize       int64          `gorm:"default:0" json:"fileSize"`          // 文件大小（字节）
	PreviewSize    int64          `gorm:"default:0" json:"previewSize"`       // 预览版大小（字节）
	Width          int            `gorm:"default:0" json:"width"`             // 视频宽度
	Height         int            `gorm:"default:0" json:"height"`            // 视频高度
	Remark         string         `gorm:"size:500" json:"remark"`             // 版本备注
	CreatedBy      uint           `gorm:"not null" json:"createdBy"`          // 创建者ID
	CreatedAt      time.Time      `json:"createdAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	// 关联
	ChapterVideo ChapterVideo `gorm:"foreignKey:ChapterVideoID" json:"-"`
	Creator      User         `gorm:"foreignKey:CreatedBy" json:"-"`
}

// TableName 指定表名
func (ChapterVideoVersion) TableName() string {
	return "chapter_video_versions"
}

// ChapterVideoResponse 章节视频详情响应（包含版本信息）
type ChapterVideoResponse struct {
	ChapterVideo
	VersionCount int `json:"versionCount"` // 总版本数
}

// ChapterVideoVersionListResponse 版本列表响应
type ChapterVideoVersionListResponse struct {
	Total int64                 `json:"total"`
	Data  []ChapterVideoVersion `json:"data"`
}

// UploadVideoRequest 上传视频请求
type UploadVideoRequest struct {
	VideoUrl       string `json:"videoUrl" binding:"required"` // 原始视频URL
	PreviewUrl     string `json:"previewUrl"`                  // 预览版URL（可选，如果不提供则只能用原始视频播放）
	Duration       int    `json:"duration"`                    // 时长（秒）
	FileSize       int64  `json:"fileSize"`                    // 文件大小（字节）
	PreviewSize    int64  `json:"previewSize"`                 // 预览版大小（字节）
	Width          int    `json:"width"`                       // 视频宽度
	Height         int    `json:"height"`                      // 视频高度
	Format         string `json:"format"`                      // 视频格式
	Codec          string `json:"codec"`                       // 编码格式
	Bitrate        int    `json:"bitrate"`                     // 码率（kbps）
	PreviewBitrate int    `json:"previewBitrate"`              // 预览版码率（kbps）
	Remark         string `json:"remark"`                      // 版本备注
}

// UpdateVideoStatusRequest 更新视频状态请求
type UpdateVideoStatusRequest struct {
	Status VideoStatus `json:"status" binding:"required"`
}

// UploadPreviewRequest 上传预览版请求
type UploadPreviewRequest struct {
	PreviewUrl     string `json:"previewUrl" binding:"required"` // 预览版URL
	PreviewSize    int64  `json:"previewSize"`                   // 预览版大小（字节）
	PreviewBitrate int    `json:"previewBitrate"`                // 预览版码率（kbps）
}
