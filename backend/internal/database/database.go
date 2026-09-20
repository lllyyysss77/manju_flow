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

// Connect 建立数据库连接，不执行任何表结构变更。
func Connect(cfg *config.DatabaseConfig) (*gorm.DB, error) {
	if cfg.Driver != "mysql" {
		return nil, fmt.Errorf("unsupported database driver: %s (only mysql is supported)", cfg.Driver)
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.User,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.DBName,
	)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Info),
		TranslateError:                           true,
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	return db, nil
}

// Init 初始化数据库连接并执行常规启动迁移。
func Init(cfg *config.DatabaseConfig) error {
	db, err := Connect(cfg)
	if err != nil {
		return err
	}

	// Scene 与 SceneAsset 的表结构变更大，必须通过 make migrate 在维护窗口显式执行。
	if err := db.AutoMigrate(
		&models.User{},
		&models.Book{},
		&models.BookFavorite{},
		&models.Chapter{},
		&models.ChapterImportTask{},
		&models.SceneReference{},
		&models.File{},
		&models.SceneFrameSet{},
		&models.SceneFrameSetVersion{},
		&models.SceneAnimation{},
		&models.SceneAnimationVersion{},
		&models.SceneAnimationGenerationTask{},
		&models.SceneAudio{},
		&models.SceneAudioVersion{},
		&models.ChapterVideo{},
		&models.ChapterVideoVersion{},
		&models.Comment{},
		&models.Character{},
		&models.Lora{},
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
