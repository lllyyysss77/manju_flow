package database

import (
	"fmt"
	"strings"

	"manju-flow/internal/models"

	"gorm.io/gorm"
)

// MigrateSceneAssets explicitly migrates scene assets and scene bindings.
//
// This migration intentionally is not run by database.Init: scenes is a large
// production table, and adding columns/indexes can take metadata locks. Run it
// from backend with `make migrate` during a maintenance window after a backup.
func MigrateSceneAssets(db *gorm.DB) error {
	migrator := db.Migrator()

	if !migrator.HasTable(&models.Scene{}) {
		if err := db.AutoMigrate(&models.Scene{}); err != nil {
			return fmt.Errorf("create scenes table: %w", err)
		}
	}
	if !migrator.HasTable(&models.SceneAsset{}) {
		if err := db.AutoMigrate(&models.SceneAsset{}); err != nil {
			return fmt.Errorf("create scene_assets table: %w", err)
		}
	}

	if migrator.HasColumn(&models.SceneAsset{}, "deleted_at") {
		if err := db.Exec("DELETE FROM scene_assets WHERE deleted_at IS NOT NULL").Error; err != nil {
			return fmt.Errorf("hard-delete soft-deleted scene assets: %w", err)
		}
		if err := migrator.DropColumn(&models.SceneAsset{}, "deleted_at"); err != nil {
			return fmt.Errorf("drop scene_assets.deleted_at: %w", err)
		}
	}

	var addColumns []string
	if !migrator.HasColumn(&models.Scene{}, "book_id") {
		addColumns = append(addColumns, "book_id BIGINT UNSIGNED NULL")
	}
	if !migrator.HasColumn(&models.Scene{}, "scene_asset_code") {
		addColumns = append(addColumns, "scene_asset_code VARCHAR(20) NULL")
	}
	if !migrator.HasColumn(&models.Scene{}, "scene_asset_book_id") {
		addColumns = append(addColumns, "scene_asset_book_id BIGINT UNSIGNED NULL")
	}
	if len(addColumns) > 0 {
		if err := db.Exec("ALTER TABLE scenes ADD COLUMN " + strings.Join(addColumns, ", ADD COLUMN ")).Error; err != nil {
			return fmt.Errorf("add scenes binding columns: %w", err)
		}
	}

	if err := db.Exec(`
UPDATE scenes s
JOIN chapters c ON c.id = s.chapter_id
SET s.book_id = c.book_id
WHERE s.book_id IS NULL OR s.book_id = 0
`).Error; err != nil {
		return fmt.Errorf("backfill scenes.book_id: %w", err)
	}

	if migrator.HasColumn(&models.Scene{}, "scene_asset_id") {
		if err := db.Exec(`
UPDATE scenes s
JOIN scene_assets a ON a.id = s.scene_asset_id AND a.book_id = s.book_id
SET s.scene_asset_code = a.code, s.scene_asset_book_id = a.book_id
WHERE s.scene_asset_id IS NOT NULL
`).Error; err != nil {
			return fmt.Errorf("migrate scene_asset_id bindings: %w", err)
		}
		if err := migrator.DropColumn(&models.Scene{}, "scene_asset_id"); err != nil {
			return fmt.Errorf("drop scenes.scene_asset_id: %w", err)
		}
	}

	if err := db.Exec(`
UPDATE scenes
SET scene_asset_book_id = book_id
WHERE scene_asset_code IS NOT NULL AND scene_asset_book_id IS NULL
`).Error; err != nil {
		return fmt.Errorf("backfill scenes.scene_asset_book_id: %w", err)
	}

	bookIDNullable := false
	columnTypes, err := migrator.ColumnTypes(&models.Scene{})
	if err != nil {
		return fmt.Errorf("inspect scenes columns: %w", err)
	}
	for _, column := range columnTypes {
		if column.Name() != "book_id" {
			continue
		}
		if nullable, ok := column.Nullable(); ok && nullable {
			bookIDNullable = true
		}
	}
	if bookIDNullable {
		if err := db.Exec("ALTER TABLE scenes MODIFY book_id BIGINT UNSIGNED NOT NULL").Error; err != nil {
			return fmt.Errorf("make scenes.book_id required: %w", err)
		}
	}

	if !migrator.HasIndex(&models.SceneAsset{}, "uq_scene_assets_book_code") {
		if err := db.Exec("CREATE UNIQUE INDEX uq_scene_assets_book_code ON scene_assets(book_id, code)").Error; err != nil {
			return fmt.Errorf("create scene_assets unique index: %w", err)
		}
	}
	if migrator.HasIndex(&models.Scene{}, "idx_scenes_book_scene_asset_code") {
		if err := migrator.DropIndex(&models.Scene{}, "idx_scenes_book_scene_asset_code"); err != nil {
			return fmt.Errorf("drop legacy scenes binding index: %w", err)
		}
	}
	if !migrator.HasIndex(&models.Scene{}, "idx_scenes_scene_asset_binding") {
		if err := db.Exec("CREATE INDEX idx_scenes_scene_asset_binding ON scenes(scene_asset_book_id, scene_asset_code)").Error; err != nil {
			return fmt.Errorf("create scenes binding index: %w", err)
		}
	}
	if migrator.HasConstraint(&models.Scene{}, "fk_scenes_scene_asset_code") {
		if err := migrator.DropConstraint(&models.Scene{}, "fk_scenes_scene_asset_code"); err != nil {
			return fmt.Errorf("drop legacy scenes scene-asset foreign key: %w", err)
		}
	}
	if !migrator.HasConstraint(&models.Scene{}, "fk_scenes_scene_asset_binding") {
		if err := db.Exec(`
ALTER TABLE scenes
ADD CONSTRAINT fk_scenes_scene_asset_binding
FOREIGN KEY (scene_asset_book_id, scene_asset_code)
REFERENCES scene_assets (book_id, code)
ON DELETE SET NULL
ON UPDATE CASCADE
`).Error; err != nil {
			return fmt.Errorf("create scenes scene-asset foreign key: %w", err)
		}
	}

	return nil
}
