package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// LoraHandler LoRA 处理器
type LoraHandler struct{}

// NewLoraHandler 创建 LoRA 处理器
func NewLoraHandler() *LoraHandler {
	return &LoraHandler{}
}

// List 获取 LoRA 列表
// @Summary 获取 LoRA 列表
// @Description 获取 LoRA 库列表，支持分页、模型类型、标签和关键词筛选
// @Tags loras
// @Accept json
// @Produce json
// @Param page query int false "页码" default(1)
// @Param size query int false "每页数量" default(10)
// @Param modelType query string false "模型类型 (SD_1.5/SD_2.1/SDXL/SD3)"
// @Param tag query string false "标签筛选"
// @Param keyword query string false "搜索关键词（名称或描述）"
// @Success 200 {object} models.LoraListResponse
// @Router /api/loras [get]
func (h *LoraHandler) List(c *gin.Context) {
	db := database.GetDB()

	// 分页参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 10
	}
	offset := (page - 1) * size

	// 过滤参数
	modelType := c.Query("modelType")
	tag := c.Query("tag")
	keyword := c.Query("keyword")

	// 构建查询
	query := db.Model(&models.Lora{})

	// 模型类型过滤
	if modelType != "" {
		validTypes := map[string]bool{
			string(models.LoraModelSD15): true,
			string(models.LoraModelSDXL): true,
		}
		if validTypes[modelType] {
			query = query.Where("model_type = ?", modelType)
		}
	}

	// 标签过滤 (LIKE 查询 JSON 数组)
	if tag != "" {
		query = query.Where("tags LIKE ?", "%\""+tag+"\"%")
	}

	// 关键词搜索（名称或描述）
	if keyword != "" {
		query = query.Where("name LIKE ? OR description LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	// 获取总数
	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to count loras",
		})
		return
	}

	// 获取数据
	var loras []models.Lora
	if err := query.Order("created_at DESC").Offset(offset).Limit(size).Find(&loras).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch loras",
		})
		return
	}

	c.JSON(http.StatusOK, models.LoraListResponse{
		Total: total,
		Page:  page,
		Size:  size,
		Data:  loras,
	})
}

// Create 创建 LoRA
// @Summary 创建新 LoRA
// @Description 上传新的 LoRA 模型到库中
// @Tags loras
// @Accept json
// @Produce json
// @Param lora body models.CreateLoraRequest true "LoRA 信息"
// @Success 201 {object} models.Lora
// @Failure 400 {object} map[string]string
// @Router /api/loras [post]
func (h *LoraHandler) Create(c *gin.Context) {
	var req models.CreateLoraRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 获取当前用户 ID
	userID, exists := c.Get("userId")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Unauthorized",
		})
		return
	}

	lora := models.Lora{
		Name:        req.Name,
		Description: req.Description,
		ModelType:   req.ModelType,
		FileUrl:     req.FileUrl,
		FileSize:    req.FileSize,
		PreviewUrl:  req.PreviewUrl,
		ConfigUrl:   req.ConfigUrl,
		UploaderID:  userID.(uint),
	}
	lora.SetTags(req.Tags)

	db := database.GetDB()
	if err := db.Create(&lora).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create lora",
		})
		return
	}

	c.JSON(http.StatusCreated, lora)
}

// GetByID 根据 ID 获取 LoRA 详情
// @Summary 获取 LoRA 详情
// @Description 根据 ID 获取 LoRA 的详细信息
// @Tags loras
// @Accept json
// @Produce json
// @Param id path int true "LoRA ID"
// @Success 200 {object} models.Lora
// @Failure 404 {object} map[string]string
// @Router /api/loras/{id} [get]
func (h *LoraHandler) GetByID(c *gin.Context) {
	id := c.Param("id")

	var lora models.Lora
	db := database.GetDB()
	if err := db.First(&lora, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Lora not found",
		})
		return
	}

	c.JSON(http.StatusOK, lora)
}

// Update 更新 LoRA 信息
// @Summary 更新 LoRA
// @Description 更新 LoRA 的信息（仅上传者可操作）
// @Tags loras
// @Accept json
// @Produce json
// @Param id path int true "LoRA ID"
// @Param lora body models.UpdateLoraRequest true "LoRA 信息"
// @Success 200 {object} models.Lora
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/loras/{id} [put]
func (h *LoraHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var lora models.Lora
	db := database.GetDB()
	if err := db.First(&lora, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Lora not found",
		})
		return
	}

	// 权限检查：仅上传者可操作
	userID, exists := c.Get("userId")
	if !exists || userID.(uint) != lora.UploaderID {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Only uploader can update this lora",
		})
		return
	}

	var req models.UpdateLoraRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 更新字段
	if req.Name != "" {
		lora.Name = req.Name
	}
	if req.Description != "" {
		lora.Description = req.Description
	}
	if req.ModelType != "" {
		lora.ModelType = req.ModelType
	}
	if req.Tags != nil {
		lora.SetTags(req.Tags)
	}
	if req.FileUrl != "" {
		lora.FileUrl = req.FileUrl
	}
	if req.FileSize > 0 {
		lora.FileSize = req.FileSize
	}
	if req.PreviewUrl != "" {
		lora.PreviewUrl = req.PreviewUrl
	}
	if req.ConfigUrl != "" {
		lora.ConfigUrl = req.ConfigUrl
	}

	if err := db.Save(&lora).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update lora",
		})
		return
	}

	c.JSON(http.StatusOK, lora)
}

// Delete 删除 LoRA
// @Summary 删除 LoRA
// @Description 从库中删除 LoRA（软删除，仅上传者可操作）
// @Tags loras
// @Accept json
// @Produce json
// @Param id path int true "LoRA ID"
// @Success 200 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/loras/{id} [delete]
func (h *LoraHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	var lora models.Lora
	db := database.GetDB()
	if err := db.First(&lora, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Lora not found",
		})
		return
	}

	// 权限检查：仅上传者可操作
	userID, exists := c.Get("userId")
	if !exists || userID.(uint) != lora.UploaderID {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Only uploader can delete this lora",
		})
		return
	}

	if err := db.Delete(&lora).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete lora",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Lora deleted successfully",
	})
}

// GetTags 获取所有标签
// @Summary 获取所有标签
// @Description 获取 LoRA 库中所有不重复的标签
// @Tags loras
// @Accept json
// @Produce json
// @Success 200 {object} models.LoraTagResponse
// @Router /api/loras/tags [get]
func (h *LoraHandler) GetTags(c *gin.Context) {
	db := database.GetDB()

	var loras []models.Lora
	if err := db.Select("tags").Where("tags != ''").Find(&loras).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch tags",
		})
		return
	}

	// 收集所有不重复的标签
	tagSet := make(map[string]bool)
	for _, lora := range loras {
		var tags []string
		if err := json.Unmarshal([]byte(lora.Tags), &tags); err == nil {
			for _, tag := range tags {
				tagSet[tag] = true
			}
		}
	}

	// 转换为数组
	tags := make([]string, 0, len(tagSet))
	for tag := range tagSet {
		tags = append(tags, tag)
	}

	c.JSON(http.StatusOK, models.LoraTagResponse{
		Tags: tags,
	})
}
