package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var sceneAssetTestDBSequence uint64

func setupSceneAssetTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dbName := fmt.Sprintf("scene_asset_test_%d", atomic.AddUint64(&sceneAssetTestDBSequence, 1))
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", dbName)), &gorm.Config{
		TranslateError:                           true,
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if sqlDB, err := db.DB(); err == nil {
		sqlDB.SetMaxOpenConns(1)
	}
	if err := db.Exec("PRAGMA foreign_keys = ON").Error; err != nil {
		t.Fatalf("enable SQLite foreign keys: %v", err)
	}

	if err := db.AutoMigrate(
		&models.Book{},
		&models.Chapter{},
		&models.SceneAsset{},
		&models.Scene{},
	); err != nil {
		t.Fatalf("migrate test schema: %v", err)
	}
	if !db.Migrator().HasConstraint(&models.Scene{}, "fk_scenes_scene_asset_binding") {
		if err := db.Migrator().DropTable(&models.Scene{}); err != nil {
			t.Fatalf("recreate scenes test table: %v", err)
		}
		if err := db.Exec(`
CREATE TABLE scenes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	chapter_id BIGINT UNSIGNED NOT NULL,
	book_id BIGINT UNSIGNED NOT NULL,
	scene_asset_book_id BIGINT UNSIGNED,
	scene_asset_code VARCHAR(20),
	"index" DOUBLE NOT NULL,
	status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
	description TEXT,
	camera_movement TEXT,
	dialogue TEXT,
	transition_effect TEXT,
	thumbnail_url TEXT,
	created_at DATETIME,
	updated_at DATETIME,
	deleted_at DATETIME,
	CONSTRAINT fk_scenes_scene_asset_binding
	FOREIGN KEY (scene_asset_book_id, scene_asset_code)
	REFERENCES scene_assets (book_id, code)
	ON DELETE SET NULL
	ON UPDATE CASCADE
)
`).Error; err != nil {
			t.Fatalf("create scenes test table: %v", err)
		}
	}

	previousDB := database.DB
	database.DB = db
	t.Cleanup(func() {
		database.DB = previousDB
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func createTestBookAndChapter(t *testing.T, db *gorm.DB, title string) (uint, uint) {
	t.Helper()
	book := models.Book{Title: title, Author: "test"}
	if err := db.Create(&book).Error; err != nil {
		t.Fatalf("create book: %v", err)
	}
	chapter := models.Chapter{BookID: book.ID, Title: title, Index: 1}
	if err := db.Create(&chapter).Error; err != nil {
		t.Fatalf("create chapter: %v", err)
	}
	return book.ID, chapter.ID
}

func createTestSceneAsset(t *testing.T, db *gorm.DB, bookID uint, code string) models.SceneAsset {
	t.Helper()
	asset := models.SceneAsset{
		BookID:             bookID,
		Name:               "场景 " + code,
		Code:               code,
		ReferenceImageUrls: []string{},
		Index:              1,
	}
	if err := db.Create(&asset).Error; err != nil {
		t.Fatalf("create scene asset: %v", err)
	}
	return asset
}

func createTestScene(t *testing.T, db *gorm.DB, bookID, chapterID uint, code *string) models.Scene {
	t.Helper()
	scene := models.Scene{
		ChapterID:        chapterID,
		BookID:           bookID,
		SceneAssetBookID: nil,
		SceneAssetCode:   code,
		Index:            1,
		Status:           models.SceneStatusDraft,
		Description:      "test scene",
	}
	if code != nil {
		scene.SceneAssetBookID = &bookID
	}
	if err := db.Create(&scene).Error; err != nil {
		t.Fatalf("create scene: %v", err)
	}
	return scene
}

func newHandlerTestContext(t *testing.T, params map[string]string, body any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	var payload []byte
	if body != nil {
		payload = []byte(body.(string))
	}
	context.Request = httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(payload))
	context.Request.Header.Set("Content-Type", "application/json")
	for key, value := range params {
		context.Params = append(context.Params, gin.Param{Key: key, Value: value})
	}
	return context, recorder
}

func TestSceneCreateRejectsCrossBookSceneAssetCode(t *testing.T) {
	db := setupSceneAssetTestDB(t)
	bookID, chapterID := createTestBookAndChapter(t, db, "Book A")
	otherBookID, _ := createTestBookAndChapter(t, db, "Book B")
	createTestSceneAsset(t, db, otherBookID, "S1")

	context, recorder := newHandlerTestContext(t, map[string]string{
		"bookId":    fmt.Sprint(bookID),
		"chapterId": fmt.Sprint(chapterID),
	}, `{"index":1,"sceneAssetCode":"S1"}`)
	NewSceneHandler().Create(context)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}
	var count int64
	db.Model(&models.Scene{}).Count(&count)
	if count != 0 {
		t.Fatalf("created cross-book bound scene, count = %d", count)
	}
}

func TestSceneUpdateEmptySceneAssetCodeClearsBinding(t *testing.T) {
	db := setupSceneAssetTestDB(t)
	bookID, chapterID := createTestBookAndChapter(t, db, "Book")
	createTestSceneAsset(t, db, bookID, "S1")
	code := "S1"
	scene := createTestScene(t, db, bookID, chapterID, &code)

	context, recorder := newHandlerTestContext(t, map[string]string{
		"bookId":    fmt.Sprint(bookID),
		"chapterId": fmt.Sprint(chapterID),
		"sceneId":   fmt.Sprint(scene.ID),
	}, `{"sceneAssetCode":""}`)
	NewSceneHandler().Update(context)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var updated models.Scene
	if err := db.First(&updated, scene.ID).Error; err != nil {
		t.Fatalf("load updated scene: %v", err)
	}
	if updated.SceneAssetCode != nil {
		t.Fatalf("sceneAssetCode = %q, want nil", *updated.SceneAssetCode)
	}
}

func TestSceneUpdateOmittedSceneAssetCodeKeepsBinding(t *testing.T) {
	db := setupSceneAssetTestDB(t)
	bookID, chapterID := createTestBookAndChapter(t, db, "Book")
	createTestSceneAsset(t, db, bookID, "S1")
	code := "S1"
	scene := createTestScene(t, db, bookID, chapterID, &code)

	context, recorder := newHandlerTestContext(t, map[string]string{
		"bookId":    fmt.Sprint(bookID),
		"chapterId": fmt.Sprint(chapterID),
		"sceneId":   fmt.Sprint(scene.ID),
	}, `{"description":"updated without binding"}`)
	NewSceneHandler().Update(context)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var updated models.Scene
	if err := db.First(&updated, scene.ID).Error; err != nil {
		t.Fatalf("load updated scene: %v", err)
	}
	if updated.SceneAssetCode == nil || *updated.SceneAssetCode != "S1" {
		t.Fatalf("sceneAssetCode = %v, want S1", updated.SceneAssetCode)
	}
	if updated.Description != "updated without binding" {
		t.Fatalf("description = %q", updated.Description)
	}
}

func TestSceneAssetCreateDuplicateCodeReturnsConflict(t *testing.T) {
	db := setupSceneAssetTestDB(t)
	bookID, _ := createTestBookAndChapter(t, db, "Book")
	createTestSceneAsset(t, db, bookID, "S1")

	context, recorder := newHandlerTestContext(t, map[string]string{
		"bookId": fmt.Sprint(bookID),
	}, `{"name":"Duplicate","code":"S1"}`)
	NewSceneAssetHandler().Create(context)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusConflict, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "场景编号已存在") {
		t.Fatalf("body = %s, want duplicate-code error", recorder.Body.String())
	}
}

func TestSceneAssetCreateAllowsSameCodeInDifferentBooks(t *testing.T) {
	db := setupSceneAssetTestDB(t)
	firstBookID, _ := createTestBookAndChapter(t, db, "Book A")
	secondBookID, _ := createTestBookAndChapter(t, db, "Book B")
	createTestSceneAsset(t, db, firstBookID, "S1")

	context, recorder := newHandlerTestContext(t, map[string]string{
		"bookId": fmt.Sprint(secondBookID),
	}, `{"name":"Other book scene","code":"S1"}`)
	NewSceneAssetHandler().Create(context)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusCreated, recorder.Body.String())
	}
}

func TestSceneAssetDatabaseEnforcesUniqueBookCode(t *testing.T) {
	db := setupSceneAssetTestDB(t)
	bookID, _ := createTestBookAndChapter(t, db, "Book")
	createTestSceneAsset(t, db, bookID, "S1")

	duplicate := models.SceneAsset{BookID: bookID, Name: "Duplicate", Code: "S1"}
	if err := db.Create(&duplicate).Error; err == nil {
		t.Fatal("expected database unique constraint to reject duplicate book/code")
	}
}

func TestSceneAssetDeleteClearsBoundSceneCodes(t *testing.T) {
	db := setupSceneAssetTestDB(t)
	bookID, chapterID := createTestBookAndChapter(t, db, "Book")
	asset := createTestSceneAsset(t, db, bookID, "S1")
	code := asset.Code
	scene := createTestScene(t, db, bookID, chapterID, &code)

	context, recorder := newHandlerTestContext(t, map[string]string{
		"bookId":       fmt.Sprint(bookID),
		"sceneAssetId": fmt.Sprint(asset.ID),
	}, nil)
	NewSceneAssetHandler().Delete(context)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var updated models.Scene
	if err := db.First(&updated, scene.ID).Error; err != nil {
		t.Fatalf("load scene after asset deletion: %v", err)
	}
	if updated.SceneAssetCode != nil {
		t.Fatalf("sceneAssetCode = %q, want nil after deletion", *updated.SceneAssetCode)
	}
	var count int64
	db.Unscoped().Model(&models.SceneAsset{}).Where("id = ?", asset.ID).Count(&count)
	if count != 0 {
		t.Fatalf("scene asset was soft-deleted, count = %d", count)
	}
}

func TestSceneAssetUpdateCodeCascadesToBoundScenes(t *testing.T) {
	db := setupSceneAssetTestDB(t)
	bookID, chapterID := createTestBookAndChapter(t, db, "Book")
	asset := createTestSceneAsset(t, db, bookID, "S1")
	code := asset.Code
	scene := createTestScene(t, db, bookID, chapterID, &code)

	context, recorder := newHandlerTestContext(t, map[string]string{
		"bookId":       fmt.Sprint(bookID),
		"sceneAssetId": fmt.Sprint(asset.ID),
	}, `{"code":"S2"}`)
	NewSceneAssetHandler().Update(context)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var updated models.Scene
	if err := db.First(&updated, scene.ID).Error; err != nil {
		t.Fatalf("load scene after code update: %v", err)
	}
	if updated.SceneAssetCode == nil || *updated.SceneAssetCode != "S2" {
		t.Fatalf("sceneAssetCode = %v, want S2", updated.SceneAssetCode)
	}
}

func TestSceneAssetCreateValidatesNameAndIndex(t *testing.T) {
	db := setupSceneAssetTestDB(t)
	bookID, _ := createTestBookAndChapter(t, db, "Book")
	handler := NewSceneAssetHandler()

	longName := strings.Repeat("场", 101)
	payload := fmt.Sprintf(`{"name":%q,"code":"S1"}`, longName)
	context, recorder := newHandlerTestContext(t, map[string]string{"bookId": fmt.Sprint(bookID)}, payload)
	handler.Create(context)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("long-name status = %d, want %d, body = %s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}

	context, recorder = newHandlerTestContext(t, map[string]string{"bookId": fmt.Sprint(bookID)}, `{"name":"Scene","code":"S1","index":-1}`)
	handler.Create(context)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("negative-index status = %d, want %d, body = %s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}
}
