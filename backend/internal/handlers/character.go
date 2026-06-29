package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"manju-flow/internal/ai"
	"manju-flow/internal/config"
	"manju-flow/internal/database"
	"manju-flow/internal/models"
	"manju-flow/internal/oss"

	"github.com/gin-gonic/gin"
)

// CharacterHandler 角色人设处理器
type CharacterHandler struct{}

// NewCharacterHandler 创建角色处理器
func NewCharacterHandler() *CharacterHandler {
	return &CharacterHandler{}
}

// CharacterListResponse 角色列表响应
type CharacterListResponse struct {
	Total int64              `json:"total"`
	Data  []models.Character `json:"data"`
}

func defaultCharacterCoreFeaturesImage(char models.Character) string {
	candidates := []string{
		char.ReferenceImageUrl,
		char.HalfBodyFrontImageUrl,
		char.FullBodyFrontImageUrl,
		char.FullBodySideImageUrl,
		char.FullBodyBackImageUrl,
	}
	for _, candidate := range candidates {
		if value := strings.TrimSpace(candidate); value != "" {
			return value
		}
	}
	return ""
}

func normalizeCharacterGeneratedFeatures(raw string) string {
	text := strings.TrimSpace(raw)
	text = strings.Trim(text, "` \n\t")
	text = strings.TrimPrefix(text, "角色核心特征：")
	text = strings.TrimPrefix(text, "核心特征：")
	text = strings.TrimSpace(text)
	return text
}

func arkLLMModelSupported(modelID string) bool {
	if len(config.Cfg.ArkAgentPlan.SupportedLLMModels) == 0 {
		return false
	}
	for _, supported := range config.Cfg.ArkAgentPlan.SupportedLLMModels {
		if strings.TrimSpace(supported) == modelID {
			return true
		}
	}
	return false
}

func buildCharacterCoreFeaturesPrompt(name string, description string) string {
	var contextLines []string
	if strings.TrimSpace(name) != "" {
		contextLines = append(contextLines, "角色名："+strings.TrimSpace(name))
	}
	if strings.TrimSpace(description) != "" {
		contextLines = append(contextLines, "角色描述："+strings.TrimSpace(description))
	}
	contextText := ""
	if len(contextLines) > 0 {
		contextText = "\n\n补充上下文：\n" + strings.Join(contextLines, "\n")
	}

	return "请观察图片中的角色主体，生成“角色核心特征”+“主体类别”的一句话。要求：\n" +
		"1. 只输出一行中文短语，不要解释、不要编号、不要 Markdown、不要句尾加标点符号。\n" +
		"2. 角色核心特征只需要使用 2-3 个清晰、稳定的静态特征，如服饰、发型、外观。\n" +
		"3. 特征要能帮助视频生成模型从人物参考图中快速定位并唯一识别该角色。\n" +
		"4. 避免动作、情绪、光影、背景、镜头角度等临时状态。\n" +
		"5. 主体类别可能是男/女人,动物,虚拟生物(兽人,机器人,魔法生物等),虚构生物(龙,精灵,天使等)。\n" +
		"示例1：银色短发、身穿红色斗篷、左眼为机械义眼的男人\n" +
		"示例2：穿红色连衣裙、戴草帽的女人\n" +
		"示例3：金色波浪卷发，脚踝金色纹饰脚环的粉色小猪\n" +
		"示例4：蓬松白毛，紫色眼瞳的黑白狼兽人" + contextText
}

func resolveCoreFeaturesImageSignedURL(key string) (string, error) {
	normalizedKey := strings.TrimSpace(key)
	if normalizedKey == "" {
		return "", fmt.Errorf("参考图不能为空")
	}

	var file models.File
	if err := database.GetDB().Where("`key` = ?", normalizedKey).First(&file).Error; err != nil {
		return "", err
	}

	ossClient := oss.GetClient()
	if ossClient == nil {
		return "", fmt.Errorf("文件服务未配置")
	}
	return ossClient.GetSignedURL(file.Key, 3600)
}

// List 获取角色列表
// @Summary 获取角色列表
// @Description 获取指定书籍的所有角色人设，按 index 排序
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Success 200 {object} CharacterListResponse
// @Router /api/books/{bookId}/characters [get]
func (h *CharacterHandler) List(c *gin.Context) {
	bookId := c.Param("bookId")

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	// 获取角色列表
	var characters []models.Character
	if err := db.Where("book_id = ?", bookId).Order("`index` ASC").Find(&characters).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch characters",
		})
		return
	}

	c.JSON(http.StatusOK, CharacterListResponse{
		Total: int64(len(characters)),
		Data:  characters,
	})
}

// Create 创建角色
// @Summary 创建新角色
// @Description 为指定书籍创建新角色人设
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param character body models.CreateCharacterRequest true "角色信息"
// @Success 201 {object} models.Character
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/characters [post]
func (h *CharacterHandler) Create(c *gin.Context) {
	bookId := c.Param("bookId")
	bookIdUint, err := strconv.ParseUint(bookId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid book ID",
		})
		return
	}

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	var req models.CreateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	character := models.Character{
		BookID:                uint(bookIdUint),
		Name:                  req.Name,
		Description:           req.Description,
		CoreFeatures:          req.CoreFeatures,
		ReferenceImageUrl:     req.ReferenceImageUrl,
		HalfBodyFrontImageUrl: req.HalfBodyFrontImageUrl,
		FullBodyFrontImageUrl: req.FullBodyFrontImageUrl,
		FullBodySideImageUrl:  req.FullBodySideImageUrl,
		FullBodyBackImageUrl:  req.FullBodyBackImageUrl,
		VoiceAudioUrl:         req.VoiceAudioUrl,
		Index:                 req.Index,
	}

	if err := db.Create(&character).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create character",
		})
		return
	}

	c.JSON(http.StatusCreated, character)
}

// GetByID 根据ID获取角色详情
// @Summary 获取角色详情
// @Description 根据ID获取角色的详细信息
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "角色ID"
// @Success 200 {object} models.Character
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/characters/{id} [get]
func (h *CharacterHandler) GetByID(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("characterId")

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	var character models.Character
	if err := db.Where("book_id = ?", bookId).First(&character, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Character not found",
		})
		return
	}

	c.JSON(http.StatusOK, character)
}

// Update 更新角色信息
// @Summary 更新角色
// @Description 更新角色的信息
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "角色ID"
// @Param character body models.UpdateCharacterRequest true "角色信息"
// @Success 200 {object} models.Character
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/characters/{id} [put]
func (h *CharacterHandler) Update(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("characterId")

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	var character models.Character
	if err := db.Where("book_id = ?", bookId).First(&character, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Character not found",
		})
		return
	}

	var req models.UpdateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 部分更新
	if req.Name != nil {
		character.Name = *req.Name
	}
	if req.Description != nil {
		character.Description = *req.Description
	}
	if req.CoreFeatures != nil {
		character.CoreFeatures = *req.CoreFeatures
	}
	if req.ReferenceImageUrl != nil {
		character.ReferenceImageUrl = *req.ReferenceImageUrl
	}
	if req.HalfBodyFrontImageUrl != nil {
		character.HalfBodyFrontImageUrl = *req.HalfBodyFrontImageUrl
	}
	if req.FullBodyFrontImageUrl != nil {
		character.FullBodyFrontImageUrl = *req.FullBodyFrontImageUrl
	}
	if req.FullBodySideImageUrl != nil {
		character.FullBodySideImageUrl = *req.FullBodySideImageUrl
	}
	if req.FullBodyBackImageUrl != nil {
		character.FullBodyBackImageUrl = *req.FullBodyBackImageUrl
	}
	if req.VoiceAudioUrl != nil {
		character.VoiceAudioUrl = *req.VoiceAudioUrl
	}
	if req.Index != nil {
		character.Index = *req.Index
	}

	if err := db.Save(&character).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update character",
		})
		return
	}

	c.JSON(http.StatusOK, character)
}

// GenerateCoreFeatures 根据角色参考图生成角色核心特征
// @Summary 生成角色核心特征
// @Description 使用角色参考图生成用于人物定位的核心静态特征
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "角色ID"
// @Param payload body models.GenerateCharacterCoreFeaturesRequest true "生成参数"
// @Success 200 {object} models.GenerateCharacterCoreFeaturesResponse
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/characters/{id}/core-features/generate [post]
func (h *CharacterHandler) GenerateCoreFeatures(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("characterId")

	if _, ok := c.Get("userId"); !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户未认证"})
		return
	}

	db := database.GetDB()

	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Book not found"})
		return
	}

	var character models.Character
	if err := db.Where("book_id = ?", bookId).First(&character, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Character not found"})
		return
	}

	var req models.GenerateCharacterCoreFeaturesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	imageKey := strings.TrimSpace(req.ImageKey)
	if imageKey == "" {
		imageKey = defaultCharacterCoreFeaturesImage(character)
	}
	if imageKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先上传角色参考图"})
		return
	}

	signedURL, err := resolveCoreFeaturesImageSignedURL(imageKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "角色参考图不可用"})
		return
	}

	modelID := strings.TrimSpace(req.Model)
	if modelID == "" && len(config.Cfg.ArkAgentPlan.SupportedLLMModels) > 0 {
		modelID = config.Cfg.ArkAgentPlan.SupportedLLMModels[0]
	}
	if modelID == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ARK_AGENT_PLAN_SUPPORTED_LLM_MODELS 未配置"})
		return
	}
	if !arkLLMModelSupported(modelID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前 Ark Agent Plan LLM 模型不在 ARK_AGENT_PLAN_SUPPORTED_LLM_MODELS 中"})
		return
	}

	name := req.Name
	if strings.TrimSpace(name) == "" {
		name = character.Name
	}
	description := req.Description
	if strings.TrimSpace(description) == "" {
		description = character.Description
	}

	client := ai.NewArkClient(config.Cfg.ArkAgentPlan.APIBaseURL, config.Cfg.ArkAgentPlan.APIKey)
	features, err := client.GenerateTextFromImage(
		c.Request.Context(),
		modelID,
		signedURL,
		buildCharacterCoreFeaturesPrompt(name, description),
	)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "生成角色核心特征失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.GenerateCharacterCoreFeaturesResponse{
		CoreFeatures: normalizeCharacterGeneratedFeatures(features),
		Model:        modelID,
	})
}

// Delete 删除角色
// @Summary 删除角色
// @Description 删除角色（软删除）
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "角色ID"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/characters/{id} [delete]
func (h *CharacterHandler) Delete(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("characterId")

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	// 删除角色
	result := db.Where("book_id = ?", bookId).Delete(&models.Character{}, id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete character",
		})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Character not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Character deleted successfully",
	})
}
