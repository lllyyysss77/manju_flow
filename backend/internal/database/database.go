package database

import (
	"fmt"
	"log"

	"manju-flow/internal/config"
	"manju-flow/internal/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// Init 初始化数据库连接
func Init(cfg *config.DatabaseConfig) error {
	var dialector gorm.Dialector

	if cfg.Driver != "mysql" {
		return fmt.Errorf("unsupported database driver: %s (only mysql is supported)", cfg.Driver)
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.User,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.DBName,
	)
	dialector = mysql.Open(dsn)

	db, err := gorm.Open(dialector, &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Info),
		DisableForeignKeyConstraintWhenMigrating: true, // 禁用外键约束，通过业务逻辑保证数据完整性
	})
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// 自动迁移表结构
	if err := db.AutoMigrate(
		&models.User{},
		&models.Book{},
		&models.Chapter{},
		&models.Scene{},
		&models.SceneReference{},        // 场景参考资料（一对多）
		&models.File{},
		&models.SceneFrameSet{},         // 场景帧集（支持多套首尾帧）
		&models.SceneFrameSetVersion{},  // 帧集版本历史
		&models.SceneAnimation{},        // 场景动画（支持多套动画）
		&models.SceneAnimationVersion{}, // 动画版本历史
		&models.SceneAudio{},            // 场景音频轨道（支持多音频）
		&models.SceneAudioVersion{},     // 音频版本历史
		&models.ChapterVideo{},          // 章节交付视频
		&models.ChapterVideoVersion{},   // 视频版本历史
		&models.Comment{},               // 评论
		&models.Character{},             // 角色人设
	); err != nil {
		return fmt.Errorf("failed to migrate database: %w", err)
	}

	DB = db
	log.Println("Database connected successfully")
	return nil
}

// GetDB 获取数据库实例
func GetDB() *gorm.DB {
	return DB
}
