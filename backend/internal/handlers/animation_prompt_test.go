package handlers

import (
	"strings"
	"testing"
)

func TestAnimationPromptOptimizeSystemPromptRequiresDetailedSoundDirection(t *testing.T) {
	prompt := buildAnimationPromptOptimizeSystemPrompt()
	requiredDirections := []string{
		"背景音乐（如果有）",
		"环境音与动作音效",
		"停顿、重音与句内转折",
		"内心 OS / 内心独白",
		"声画协同",
		"有音效，无音乐",
		"不得改变台词核心含义",
	}

	for _, direction := range requiredDirections {
		if !strings.Contains(prompt, direction) {
			t.Errorf("optimize system prompt is missing sound direction %q", direction)
		}
	}
}

func TestAnimationPromptOptimizeSystemPromptIncludesNormalizedSoundExamples(t *testing.T) {
	prompt := buildAnimationPromptOptimizeSystemPrompt()
	examples := []string{
		"范例1｜史诗战争·情绪逐级爆发",
		"范例2｜四川茶馆·环境声衬托动作反转",
		"范例3｜深夜敲门·无音乐的留白与空间感",
		"范例4｜战争反转·音乐骤停制造情绪坠落",
		"范例5｜情侣信用卡·同一角色句间情绪急转",
		"范例6｜新闻整活·专业口吻被喜剧停顿打破",
		"范例7｜甲方改需求·克制、爆发与疲惫回落",
	}

	for _, example := range examples {
		if !strings.Contains(prompt, example) {
			t.Errorf("optimize system prompt is missing normalized example %q", example)
		}
	}

	if strings.Contains(prompt, "2秒钟的停顿") {
		t.Error("sound examples should not prescribe exact timing")
	}
}
