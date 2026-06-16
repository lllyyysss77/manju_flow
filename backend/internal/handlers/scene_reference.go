package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// SceneReferenceHandler 场景参考资料处理器
type SceneReferenceHandler struct{}

// NewSceneReferenceHandler 创建场景参考资料处理器
func NewSceneReferenceHandler() *SceneReferenceHandler {
	return &SceneReferenceHandler{}
}

func normalizeReferenceFileKey(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	const marker = "/api/files/"
	if idx := strings.LastIndex(value, marker); idx >= 0 {
		return strings.TrimPrefix(value[idx+len(marker):], "/")
	}
	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") ||
		strings.HasPrefix(value, "data:") || strings.HasPrefix(value, "blob:") {
		return ""
	}
	return strings.TrimPrefix(value, "/")
}

func hydrateReferenceImageUploadedAt(db *gorm.DB, references ...*models.SceneReference) {
	byKey := make(map[string][]*models.SceneReference)
	for _, reference := range references {
		if reference == nil || reference.ImageUploadedAt != nil {
			continue
		}
		key := normalizeReferenceFileKey(reference.ImageUrl)
		if key == "" {
			continue
		}
		byKey[key] = append(byKey[key], reference)
	}
	if len(byKey) == 0 {
		return
	}

	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}

	var files []models.File
	if err := db.Where("`key` IN ?", keys).Order("created_at DESC").Find(&files).Error; err != nil {
		return
	}
	seen := make(map[string]bool)
	for _, file := range files {
		if seen[file.Key] {
			continue
		}
		seen[file.Key] = true
		uploadedAt := file.CreatedAt
		for _, reference := range byKey[file.Key] {
			reference.ImageUploadedAt = &uploadedAt
		}
	}
}

func findReferenceFileUploadedAt(db *gorm.DB, imageUrl string) *time.Time {
	key := normalizeReferenceFileKey(imageUrl)
	if key == "" {
		return nil
	}
	var file models.File
	if err := db.Where("`key` = ?", key).Order("created_at DESC").First(&file).Error; err != nil {
		return nil
	}
	uploadedAt := file.CreatedAt
	return &uploadedAt
}

func currentSceneReferenceUserID(c *gin.Context) (uint, bool) {
	userID, exists := c.Get("userId")
	if !exists {
		return 0, false
	}
	id, ok := userID.(uint)
	return id, ok
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
	referencePtrs := make([]*models.SceneReference, 0, len(references))
	for i := range references {
		referencePtrs = append(referencePtrs, &references[i])
	}
	hydrateReferenceImageUploadedAt(db, referencePtrs...)

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
	userID, ok := currentSceneReferenceUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Unauthorized",
		})
		return
	}

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

	var imageUploadedAt *time.Time
	if req.ImageUrl != "" {
		imageUploadedAt = findReferenceFileUploadedAt(db, req.ImageUrl)
		if imageUploadedAt == nil {
			now := time.Now()
			imageUploadedAt = &now
		}
	}

	reference := models.SceneReference{
		SceneID:         uint(sceneIdUint),
		Index:           *req.Index,
		ImageUrl:        req.ImageUrl,
		ImageUploadedAt: imageUploadedAt,
		Description:     req.Description,
		CreatedBy:       userID,
		UpdatedBy:       userID,
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
	userID, ok := currentSceneReferenceUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Unauthorized",
		})
		return
	}

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
		var imageUploadedAt *time.Time
		if r.ImageUrl != "" {
			imageUploadedAt = findReferenceFileUploadedAt(db, r.ImageUrl)
			if imageUploadedAt == nil {
				now := time.Now()
				imageUploadedAt = &now
			}
		}
		references = append(references, models.SceneReference{
			SceneID:         uint(sceneIdUint),
			Index:           *r.Index,
			ImageUrl:        r.ImageUrl,
			ImageUploadedAt: imageUploadedAt,
			Description:     r.Description,
			CreatedBy:       userID,
			UpdatedBy:       userID,
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
	hydrateReferenceImageUploadedAt(db, &reference)

	c.JSON(http.StatusOK, reference)
}

// Update 更新参考资料
func (h *SceneReferenceHandler) Update(c *gin.Context) {
	sceneId := c.Param("sceneId")
	id := c.Param("referenceId")

	db := database.GetDB()
	userID, ok := currentSceneReferenceUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Unauthorized",
		})
		return
	}

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
		if *req.ImageUrl != reference.ImageUrl {
			if *req.ImageUrl == "" {
				reference.ImageUploadedAt = nil
			} else {
				reference.ImageUploadedAt = findReferenceFileUploadedAt(db, *req.ImageUrl)
				if reference.ImageUploadedAt == nil {
					now := time.Now()
					reference.ImageUploadedAt = &now
				}
			}
		}
		reference.ImageUrl = *req.ImageUrl
	}
	if req.Description != nil {
		reference.Description = *req.Description
	}
	reference.UpdatedBy = userID

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
