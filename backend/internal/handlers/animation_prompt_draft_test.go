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

func TestListAnimationPromptDraftAudioRoles(t *testing.T) {
	db := setupAnimationPromptDraftTestDB(t)
	scene := models.Scene{ID: 1, BookID: 10, ChapterID: 100, Index: 1}
	if err := db.Create(&scene).Error; err != nil {
		t.Fatalf("create scene: %v", err)
	}

	tracks := []models.SceneAudio{
		{SceneID: 1, Role: "连瑟", Index: 1},
		{SceneID: 1, Role: "旁白", Index: 2},
		{SceneID: 1, Role: "连瑟", Index: 3},
		{SceneID: 1, Role: "   ", Index: 4},
	}
	for _, track := range tracks {
		if err := db.Create(&track).Error; err != nil {
			t.Fatalf("create scene audio: %v", err)
		}
	}

	got := listAnimationPromptDraftAudioRoles(db, []uint{1})
	if len(got) != 2 || got[0] != "连瑟" || got[1] != "旁白" {
		t.Errorf("listAnimationPromptDraftAudioRoles() = %v, want [连瑟 旁白]", got)
	}
}

func TestLoadAnimationPromptDraftRosterCharacters(t *testing.T) {
	db := setupAnimationPromptDraftTestDB(t)
	scene := models.Scene{ID: 1, BookID: 10, ChapterID: 100, Index: 1}
	if err := db.Create(&scene).Error; err != nil {
		t.Fatalf("create scene: %v", err)
	}
	seedCharacter := func(id uint, name string, index float64) {
		character := models.Character{ID: id, BookID: 10, Name: name, Index: index}
		if err := db.Create(&character).Error; err != nil {
			t.Fatalf("create character %s: %v", name, err)
		}
	}
	seedCharacter(1, "连瑟", 2)
	seedCharacter(2, "阿羽", 1)
	seedCharacter(3, "路人", 3)
	// 其他作品的 character 不进入名单
	if err := db.Create(&models.Character{ID: 4, BookID: 99, Name: "外传角色", Index: 1}).Error; err != nil {
		t.Fatalf("create other book character: %v", err)
	}

	got := loadAnimationPromptDraftRosterCharacters(db, scene)
	if len(got) != 3 {
		t.Fatalf("loadAnimationPromptDraftRosterCharacters() got %d characters, want 3", len(got))
	}
	if got[0].Name != "阿羽" || got[1].Name != "连瑟" || got[2].Name != "路人" {
		t.Errorf("roster order = [%s, %s, %s], want [阿羽, 连瑟, 路人]", got[0].Name, got[1].Name, got[2].Name)
	}
}

func TestExtractAnimationPromptDraftCharacterNames(t *testing.T) {
	draft := "镜头 1：连瑟在广场啃面包。\n镜头 2：弟子侧目。\n【出场人物】连瑟、归一宗弟子"
	cleaned, names := extractAnimationPromptDraftCharacterNames(draft)
	if cleaned != "镜头 1：连瑟在广场啃面包。\n镜头 2：弟子侧目。" {
		t.Errorf("cleaned draft = %q, want marker line stripped", cleaned)
	}
	if len(names) != 2 || names[0] != "连瑟" || names[1] != "归一宗弟子" {
		t.Errorf("names = %v, want [连瑟 归一宗弟子]", names)
	}

	// 标注为无出场人物
	_, names = extractAnimationPromptDraftCharacterNames("镜头 1：空镜。\n【出场人物】无")
	if len(names) != 0 {
		t.Errorf("names = %v, want empty for 无", names)
	}
	_, names = extractAnimationPromptDraftCharacterNames("镜头 1：空镜。\n【出场人物】无。")
	if len(names) != 0 {
		t.Errorf("names = %v, want empty for 无。", names)
	}

	// 未标注名单行：草稿保持原样、名单为空
	unchanged := "镜头 1：纯画面。"
	cleaned, names = extractAnimationPromptDraftCharacterNames(unchanged)
	if cleaned != unchanged || len(names) != 0 {
		t.Errorf("draft without marker should stay unchanged, got %q / %v", cleaned, names)
	}

	// 标记行变体：无括号带冒号、英文逗号、重复标注去重
	variant := "镜头 1：开场。\n出场人物：连瑟, 阿羽\n【出场人物】连瑟、阿羽"
	_, names = extractAnimationPromptDraftCharacterNames(variant)
	if len(names) != 2 || names[0] != "连瑟" || names[1] != "阿羽" {
		t.Errorf("variant names = %v, want [连瑟 阿羽]", names)
	}

	// 名单写在标记行的下一行
	nextLine := "镜头 1：开场。\n【出场人物】\n连瑟、阿羽"
	cleaned, names = extractAnimationPromptDraftCharacterNames(nextLine)
	if len(names) != 2 || names[0] != "连瑟" || names[1] != "阿羽" {
		t.Errorf("next-line names = %v, want [连瑟 阿羽]", names)
	}
	if strings.Contains(cleaned, "连瑟、阿羽") {
		t.Errorf("next-line list should be stripped from draft, got %q", cleaned)
	}

	// LLM 附带括号补充说明时只取括号前的名字
	annotated := "镜头 1：开场。\n【出场人物】连瑟（女主）、阿羽"
	_, names = extractAnimationPromptDraftCharacterNames(annotated)
	if len(names) != 2 || names[0] != "连瑟" || names[1] != "阿羽" {
		t.Errorf("annotated names = %v, want [连瑟 阿羽]", names)
	}
}

func TestMatchAnimationPromptDraftCharacters(t *testing.T) {
	roster := []models.Character{
		{ID: 1, Name: " 连瑟 ", CoreFeatures: "黑长发红瞳"},
		{ID: 2, Name: "连瑟"},
		{ID: 3, Name: "归一宗弟子"},
		{ID: 4, Name: "  "},
	}

	got := matchAnimationPromptDraftCharacters(roster, []string{"归一宗弟子", "连瑟", "不存在"})
	if len(got) != 2 {
		t.Fatalf("matched %d characters, want 2", len(got))
	}
	if got[0].ID != 3 || got[1].ID != 1 {
		t.Errorf("matched IDs = [%d, %d], want [3, 1] (LLM 顺序、重名取排位靠前)", got[0].ID, got[1].ID)
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
	if context := buildAnimationPromptDraftCharacterContext(nil, nil); context != "" {
		t.Errorf("empty roster should produce empty context, got %q", context)
	}

	context := buildAnimationPromptDraftCharacterContext([]models.Character{
		{Name: " 连瑟 ", CoreFeatures: " 黑长发红瞳少女 "},
		{Name: "阿羽", Description: "白发少年剑客，背着长剑"},
	}, []string{"连瑟", "旁白"})
	for _, want := range []string{"【人物人设名单", "- 连瑟：黑长发红瞳少女", "- 阿羽：白发少年剑客，背着长剑", "连瑟、旁白"} {
		if !strings.Contains(context, want) {
			t.Errorf("character context missing %q:\n%s", want, context)
		}
	}

	withoutRoles := buildAnimationPromptDraftCharacterContext([]models.Character{{Name: "连瑟"}}, nil)
	if strings.Contains(withoutRoles, "音频轨道角色") {
		t.Error("empty audio roles should not add a section")
	}
}

func TestBuildAnimationPromptDraftSystemPromptRequiresCharacterLine(t *testing.T) {
	prompt := buildAnimationPromptDraftSystemPrompt()
	for _, want := range []string{"出场人物判断", "【出场人物】人物A、人物B", "提及", "不算出场", "最多 4 位"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("system prompt missing %q", want)
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
		"【人物人设名单｜来自大纲人设模块】\n- 连瑟：黑长发红瞳少女",
	)
	characterIndex := strings.Index(prompt, "【人物人设名单")
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
	if strings.Contains(withoutCharacters, "人物人设名单") {
		t.Error("empty character context should not add a section")
	}
}
