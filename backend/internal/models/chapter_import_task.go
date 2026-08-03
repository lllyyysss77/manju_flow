package models

import (
	"time"

	"gorm.io/gorm"
)

type ChapterImportTaskStatus string

const (
	ChapterImportTaskStatusPending   ChapterImportTaskStatus = "PENDING"
	ChapterImportTaskStatusAnalyzing ChapterImportTaskStatus = "ANALYZING"
	ChapterImportTaskStatusImporting ChapterImportTaskStatus = "IMPORTING"
	ChapterImportTaskStatusSucceeded ChapterImportTaskStatus = "SUCCEEDED"
	ChapterImportTaskStatusFailed    ChapterImportTaskStatus = "FAILED"
)

// ChapterImportTask 持久化 txt 脚本从 AI 分析到章节落库的完整生命周期。
type ChapterImportTask struct {
	ID               uint                    `gorm:"primaryKey" json:"id"`
	BookID           uint                    `gorm:"not null;index" json:"bookId"`
	Status           ChapterImportTaskStatus `gorm:"size:20;not null;default:'PENDING';index" json:"status"`
	OriginalFilename string                  `gorm:"size:255;not null" json:"originalFilename"`
	ScriptContent    string                  `gorm:"type:longtext;not null" json:"-"`
	AIResponse       string                  `gorm:"type:longtext" json:"-"`
	Model            string                  `gorm:"size:100;not null" json:"model"`
	OutputChapterID  *uint                   `gorm:"index" json:"outputChapterId"`
	ErrorMessage     string                  `gorm:"type:text" json:"errorMessage"`
	AttemptCount     int                     `gorm:"not null;default:0" json:"attemptCount"`
	ProcessingToken  string                  `gorm:"size:64;index" json:"-"`
	LeaseExpiresAt   *time.Time              `gorm:"index" json:"-"`
	StartedAt        *time.Time              `json:"startedAt"`
	CompletedAt      *time.Time              `json:"completedAt"`
	CreatedBy        uint                    `gorm:"not null;index" json:"createdBy"`
	CreatedAt        time.Time               `json:"createdAt"`
	UpdatedAt        time.Time               `json:"updatedAt"`
	DeletedAt        gorm.DeletedAt          `gorm:"index" json:"-"`
}

func (ChapterImportTask) TableName() string {
	return "chapter_import_tasks"
}

type ChapterImportTaskListResponse struct {
	Total int64               `json:"total"`
	Data  []ChapterImportTask `json:"data"`
}
