package handlers

import (
	"fmt"
	"strings"
	"sync/atomic"
	"testing"

	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var animationPromptDraftTestDBSequence uint64

func setupAnimationPromptDraftTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dbName := fmt.Sprintf("animation_prompt_draft_test_%d", atomic.AddUint64(&animationPromptDraftTestDBSequence, 1))
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

	if err := db.AutoMigrate(&models.Character{}, &models.Scene{}, &models.SceneAudio{}); err != nil {
		t.Fatalf("migrate test schema: %v", err)
	}
	return db
}

func TestDetectAnimationPromptDraftCharacters(t *testing.T) {
	db := setupAnimationPromptDraftTestDB(t)
	scene := models.Scene{ID: 1, BookID: 10, ChapterID: 100, Index: 1}
	if err := db.Create(&scene).Error; err != nil {
		t.Fatalf("create scene: %v", err)
	}

	seedCharacter := func(id uint, name, description, coreFeatures string) {
		character := models.Character{ID: id, BookID: 10, Name: name, Description: description, CoreFeatures: coreFeatures}
		if err := db.Create(&character).Error; err != nil {
			t.Fatalf("create character %s: %v", name, err)
		}
	}
	seedCharacter(1, "连瑟", "女主", "黑长发红瞳")
	seedCharacter(2, "归一宗弟子", "配角", "灰袍弟子")
	seedCharacter(3, "未出场者", "路人", "无参考")

	// 分镜 1：画面描述提到连瑟；音频轨道 role 命中归一宗弟子
	mergedScenes := []models.Scene{{
		ID: 1, BookID: 10, ChapterID: 100, Index: 1,
		Description: "广场上连瑟啃着面包，远处归一宗弟子侧目。",
		Dialogue:    "",
	}}
	if err := db.Create(&models.SceneAudio{SceneID: 1, Role: "归一宗弟子", Index: 1}).Error; err != nil {
		t.Fatalf("create scene audio: %v", err)
	}

	got := detectAnimationPromptDraftCharacters(db, scene, []uint{1}, mergedScenes)
	if len(got) != 2 {
		t.Fatalf("detectAnimationPromptDraftCharacters() matched %d characters, want 2", len(got))
	}
	if got[0].Name != "连瑟" || got[1].Name != "归一宗弟子" {
		t.Errorf("matched characters = [%s, %s], want [连瑟, 归一宗弟子]", got[0].Name, got[1].Name)
	}

	// 台词文本同样参与匹配
	dialogueScene := []models.Scene{{
		ID: 1, BookID: 10, ChapterID: 100, Index: 1,
		Description: "空旷广场，无人。",
		Dialogue:    "归一宗弟子：她又在吃了。",
	}}
	got = detectAnimationPromptDraftCharacters(db, scene, []uint{1}, dialogueScene)
	if len(got) != 1 || got[0].Name != "归一宗弟子" {
		t.Errorf("dialogue matching got %v, want only 归一宗弟子", got)
	}
}

func TestDetectAnimationPromptDraftCharactersDedupesByName(t *testing.T) {
	db := setupAnimationPromptDraftTestDB(t)
	scene := models.Scene{ID: 1, BookID: 10, ChapterID: 100, Index: 1}
	if err := db.Create(&scene).Error; err != nil {
		t.Fatalf("create scene: %v", err)
	}
	for _, id := range []uint{1, 2} {
		character := models.Character{ID: id, BookID: 10, Name: "连瑟", Index: float64(id)}
		if err := db.Create(&character).Error; err != nil {
			t.Fatalf("create character: %v", err)
		}
	}

	got := detectAnimationPromptDraftCharacters(db, scene, nil, []models.Scene{{
		ID: 1, BookID: 10, ChapterID: 100, Index: 1, Description: "连瑟出场",
	}})
	if len(got) != 1 {
		t.Fatalf("detectAnimationPromptDraftCharacters() matched %d characters, want 1 (dedup by name)", len(got))
	}
}

func TestBuildAnimationPromptDraftCharacterReferences(t *testing.T) {
	slotPriorityCharacter := models.Character{
		ID: 1, Name: "连瑟", CoreFeatures: "黑长发红瞳",
		ReferenceImageUrl: "uploads/lianse-sanshi.png", HalfBodyFrontImageUrl: "uploads/lianse-half.png",
		VoiceAudioUrl: "uploads/lianse-voice.mp3",
	}
	references := buildAnimationPromptDraftCharacterReferences([]models.Character{slotPriorityCharacter})
	if len(references) != 1 {
		t.Fatalf("got %d references, want 1", len(references))
	}
	reference := references[0]
	if reference.ImageKey != "uploads/lianse-sanshi.png" {
		t.Errorf("ImageKey = %q, want 三视图 to take priority over 半身正面", reference.ImageKey)
	}
	if reference.ImageSlot != "referenceImageUrl" || reference.ImageSlotLabel != "三视图" {
		t.Errorf("image slot = %q/%q, want referenceImageUrl/三视图", reference.ImageSlot, reference.ImageSlotLabel)
	}
	if reference.VoiceAudioKey != "uploads/lianse-voice.mp3" {
		t.Errorf("VoiceAudioKey = %q, want uploads/lianse-voice.mp3", reference.VoiceAudioKey)
	}

	fallbackSlotCharacter := models.Character{ID: 2, Name: "阿羽", HalfBodyFrontImageUrl: "uploads/ayu-half.png"}
	references = buildAnimationPromptDraftCharacterReferences([]models.Character{fallbackSlotCharacter})
	if len(references) != 1 || references[0].ImageSlot != "halfBodyFrontImageUrl" {
		t.Fatalf("fallback slot = %+v, want halfBodyFrontImageUrl", references)
	}

	// 未配置任何参考的人物被过滤
	unconfigured := models.Character{ID: 3, Name: "路人甲"}
	if references = buildAnimationPromptDraftCharacterReferences([]models.Character{unconfigured}); len(references) != 0 {
		t.Errorf("unconfigured character should be skipped, got %+v", references)
	}

	// 超过上限时按大纲顺序截断
	var many []models.Character
	for i := 0; i < maxAnimationDraftCharacterReferences+2; i++ {
		many = append(many, models.Character{
			ID: uint(i + 1), Name: fmt.Sprintf("角色%d", i), Index: float64(i),
			ReferenceImageUrl: fmt.Sprintf("uploads/char-%d.png", i),
		})
	}
	if references = buildAnimationPromptDraftCharacterReferences(many); len(references) != maxAnimationDraftCharacterReferences {
		t.Errorf("got %d references, want capped at %d", len(references), maxAnimationDraftCharacterReferences)
	}
}

func TestBuildAnimationPromptDraftCharacterContext(t *testing.T) {
	if context := buildAnimationPromptDraftCharacterContext(nil); context != "" {
		t.Errorf("empty characters should produce empty context, got %q", context)
	}

	context := buildAnimationPromptDraftCharacterContext([]models.Character{
		{Name: " 连瑟 ", CoreFeatures: " 黑长发红瞳少女 "},
		{Name: "阿羽", Description: "白发少年剑客，背着长剑"},
	})
	for _, want := range []string{"【出场人物人设", "- 连瑟：黑长发红瞳少女", "- 阿羽：白发少年剑客，背着长剑"} {
		if !strings.Contains(context, want) {
			t.Errorf("character context missing %q:\n%s", want, context)
		}
	}
}

func TestBuildAnimationPromptDraftUserPromptIncludesCharacterContext(t *testing.T) {
	prompt := buildAnimationPromptDraftUserPrompt(
		[]animationPromptDraftScene{{
			Position: 1,
			Scene:    models.Scene{Description: "连瑟在广场啃面包"},
		}},
		"",
		"【出场人物人设｜来自大纲人设模块】\n- 连瑟：黑长发红瞳少女",
	)
	characterIndex := strings.Index(prompt, "【出场人物人设")
	sceneInfoIndex := strings.Index(prompt, "【分镜文字信息")
	if sceneInfoIndex < 0 || characterIndex < 0 || characterIndex < sceneInfoIndex {
		t.Errorf("character context should follow scene text section, got sceneInfo=%d character=%d", sceneInfoIndex, characterIndex)
	}
	if !strings.Contains(prompt, "连瑟在广场啃面包") {
		t.Error("user prompt should keep scene description")
	}

	withoutCharacters := buildAnimationPromptDraftUserPrompt(
		[]animationPromptDraftScene{{Position: 1, Scene: models.Scene{Description: "连瑟在广场啃面包"}}},
		"",
		"",
	)
	if strings.Contains(withoutCharacters, "出场人物人设") {
		t.Error("empty character context should not add a section")
	}
}
