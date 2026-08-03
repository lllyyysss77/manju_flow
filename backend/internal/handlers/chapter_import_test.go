package handlers

import (
	"encoding/json"
	"strings"
	"testing"

	"manju-flow/internal/models"
)

func TestParseImportedChapterDraftAcceptsJSONCodeFence(t *testing.T) {
	raw := "```json\n" + `{
  "title": "第三集",
  "synopsis": "男主发现追杀者的线索并开始谋划反击。",
  "scenes": [
    {
      "description": "【矿场、室外、白天】【回顾】男主手捧宝石。",
      "cameraMovement": "",
      "dialogue": "旁白/男主OS：被抓到矿场打黑工。",
      "transitionEffect": "回顾"
    }
  ]
}` + "\n```"

	draft, err := parseImportedChapterDraft(raw)
	if err != nil {
		t.Fatalf("parseImportedChapterDraft() error = %v", err)
	}
	if draft.Title != "第三集" || len(draft.Scenes) != 1 {
		t.Fatalf("unexpected draft: %#v", draft)
	}
}

func TestParseImportedChapterDraftRejectsMissingSceneDescription(t *testing.T) {
	raw := `{"title":"第三集","synopsis":"故事梗概","scenes":[{"description":""}]}`
	if _, err := parseImportedChapterDraft(raw); err == nil {
		t.Fatal("expected missing scene description to be rejected")
	}
}

func TestChapterImportPromptPreservesNumberedShots(t *testing.T) {
	prompt := buildChapterImportSystemPrompt()
	for _, expected := range []string{"每个编号都生成一个 scene", "不得合并、遗漏或改变顺序", "只输出一个合法 JSON 对象"} {
		if !strings.Contains(prompt, expected) {
			t.Errorf("system prompt is missing %q", expected)
		}
	}
}

func TestChapterImportTaskJSONHidesPersistedPayload(t *testing.T) {
	task := models.ChapterImportTask{
		Status:          models.ChapterImportTaskStatusAnalyzing,
		ScriptContent:   "private script",
		AIResponse:      `{"title":"private response"}`,
		ProcessingToken: "private token",
	}
	raw, err := json.Marshal(task)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	for _, secret := range []string{"private script", "private response", "private token"} {
		if strings.Contains(string(raw), secret) {
			t.Errorf("task API response leaked %q", secret)
		}
	}
}
