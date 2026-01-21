package handlers

import (
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// SceneReferenceHandler 场景参考资料处理器
type SceneReferenceHandler struct{}

// NewSceneReferenceHandler 创建场景参考资料处理器
func NewSceneReferenceHandler() *SceneReferenceHandler {
	return &SceneReferenceHandler{}
}

// List 获取场景参考资料列表
func (h *SceneReferenceHandler) List(c *gin.Context) {
	sceneId := c.Param("sceneId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var references []models.SceneReference
	if err := db.Where("scene_id = ?", sceneId).Order("`index` ASC").Find(&references).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch scene references",
		})
		return
	}

	c.JSON(http.StatusOK, models.SceneReferenceListResponse{
		Total: int64(len(references)),
		Data:  references,
	})
}

// Create 创建场景参考资料
func (h *SceneReferenceHandler) Create(c *gin.Context) {
	sceneId := c.Param("sceneId")
	sceneIdUint, err := strconv.ParseUint(sceneId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid scene ID",
		})
		return
	}

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var req models.CreateSceneReferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	reference := models.SceneReference{
		SceneID:     uint(sceneIdUint),
		Index:       *req.Index,
		ImageUrl:    req.ImageUrl,
		Description: req.Description,
	}

	if err := db.Create(&reference).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create scene reference",
		})
		return
	}

	c.JSON(http.StatusCreated, reference)
}

// BatchCreate 批量创建场景参考资料
func (h *SceneReferenceHandler) BatchCreate(c *gin.Context) {
	sceneId := c.Param("sceneId")
	sceneIdUint, err := strconv.ParseUint(sceneId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid scene ID",
		})
		return
	}

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var req models.BatchCreateSceneReferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	var references []models.SceneReference
	for _, r := range req.References {
		references = append(references, models.SceneReference{
			SceneID:     uint(sceneIdUint),
			Index:       *r.Index,
			ImageUrl:    r.ImageUrl,
			Description: r.Description,
		})
	}

	if err := db.Create(&references).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create scene references",
		})
		return
	}

	c.JSON(http.StatusCreated, models.SceneReferenceListResponse{
		Total: int64(len(references)),
		Data:  references,
	})
}

// GetByID 根据ID获取参考资料详情
func (h *SceneReferenceHandler) GetByID(c *gin.Context) {
	sceneId := c.Param("sceneId")
	id := c.Param("referenceId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var reference models.SceneReference
	if err := db.Where("scene_id = ?", sceneId).First(&reference, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene reference not found",
		})
		return
	}

	c.JSON(http.StatusOK, reference)
}

// Update 更新参考资料
func (h *SceneReferenceHandler) Update(c *gin.Context) {
	sceneId := c.Param("sceneId")
	id := c.Param("referenceId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var reference models.SceneReference
	if err := db.Where("scene_id = ?", sceneId).First(&reference, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene reference not found",
		})
		return
	}

	var req models.UpdateSceneReferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 部分更新
	if req.Index != nil {
		reference.Index = *req.Index
	}
	if req.ImageUrl != nil {
		reference.ImageUrl = *req.ImageUrl
	}
	if req.Description != nil {
		reference.Description = *req.Description
	}

	if err := db.Save(&reference).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update scene reference",
		})
		return
	}

	c.JSON(http.StatusOK, reference)
}

// Delete 删除参考资料
func (h *SceneReferenceHandler) Delete(c *gin.Context) {
	sceneId := c.Param("sceneId")
	id := c.Param("referenceId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	result := db.Where("scene_id = ?", sceneId).Delete(&models.SceneReference{}, id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete scene reference",
		})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene reference not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Scene reference deleted successfully",
	})
}

// DeleteAll 删除场景的所有参考资料
func (h *SceneReferenceHandler) DeleteAll(c *gin.Context) {
	sceneId := c.Param("sceneId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	if err := db.Where("scene_id = ?", sceneId).Delete(&models.SceneReference{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete scene references",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "All scene references deleted successfully",
	})
}
