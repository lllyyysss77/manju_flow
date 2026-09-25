package handlers

import (
	"strings"
	"testing"

	"manju-flow/internal/models"
)

func buildPromptOptimizeTestScene() models.Scene {
	return models.Scene{
		ID:          1,
		ChapterID:   1,
		BookID:      1,
		Index:       1,
		Description: "测试场景描述",
	}
}

func TestSeedanceAnimationPromptOptimizeSystemPromptRequiresDetailedSoundDirection(t *testing.T) {
	prompt := buildSeedanceAnimationPromptOptimizeSystemPrompt()
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
			t.Errorf("seedance optimize system prompt is missing sound direction %q", direction)
		}
	}
}

func TestSeedanceAnimationPromptOptimizeSystemPromptIncludesNormalizedSoundExamples(t *testing.T) {
	prompt := buildSeedanceAnimationPromptOptimizeSystemPrompt()
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
			t.Errorf("seedance optimize system prompt is missing normalized example %q", example)
		}
	}

	if strings.Contains(prompt, "2秒钟的停顿") {
		t.Error("sound examples should not prescribe exact timing")
	}
}

// TestWanAnimationPromptOptimizeSystemPromptCoversOfficialGuide 万相优化系统提示词须覆盖
// 官方提示词指南的核心要求：五段请求结构、硬性约束、素材职责与交付约定
func TestWanAnimationPromptOptimizeSystemPromptCoversOfficialGuide(t *testing.T) {
	prompt := buildWanAnimationPromptOptimizeSystemPrompt()
	requiredSections := []string{
		"【核心任务】",
		"【情节概要】",
		"【音频风格】",
		"【运镜与核心约束】",
		"【负面提示词】",
	}
	for _, section := range requiredSections {
		if !strings.Contains(prompt, section) {
			t.Errorf("wan optimize system prompt is missing section %q", section)
		}
	}

	requiredDirections := []string{
		"格式化整理",
		"忠实原文",
		"事实与观察分离",
		"主体基数匹配",
		"用户映射优先",
		"素材逐份负责",
		"引用保真",
		"不滥加约束",
		"台词逐字保留",
		"镜头时间戳",
		"提示词增强（PE）",
		"音色参考音频N",
		"用户明确指定 > 请求正文描述 > 素材自身内容 > 文件名与元数据 > 上传顺序",
		"画风提示词由系统在生成视频时自动追加",
	}
	for _, direction := range requiredDirections {
		if !strings.Contains(prompt, direction) {
			t.Errorf("wan optimize system prompt is missing direction %q", direction)
		}
	}
}

// TestWanAnimationPromptOptimizeUserPromptAdaptsToVideoModel 万相模型下用户提示词须切换为
// 万相整理指令与上下文取舍规则，Seedance 模型保持原有优化指令
func TestWanAnimationPromptOptimizeUserPromptAdaptsToVideoModel(t *testing.T) {
	scene := buildPromptOptimizeTestScene()
	userPromptWan := buildAnimationPromptOptimizeUserPrompt(
		scene, "原始提示词", "剧情上下文", nil, nil, nil, true,
	)
	if !strings.Contains(userPromptWan, "万相 3.0 官方提示词指南") {
		t.Error("wan user prompt should reference the wan 3.0 official guide instruction")
	}
	if !strings.Contains(userPromptWan, "不要把原始提示词没写的上下文内容补进请求正文") {
		t.Error("wan user prompt should keep narrative context read-only")
	}

	userPromptSeedance := buildAnimationPromptOptimizeUserPrompt(
		scene, "原始提示词", "剧情上下文", nil, nil, nil, false,
	)
	if !strings.Contains(userPromptSeedance, "优秀样例可迁移规则") {
		t.Error("seedance user prompt should keep the original optimization instruction")
	}
	if !strings.Contains(userPromptSeedance, "才纳入优化后的镜头内容") {
		t.Error("seedance user prompt should keep the original context rule")
	}
}
