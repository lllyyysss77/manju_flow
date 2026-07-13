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
