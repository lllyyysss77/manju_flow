package handlers

import (
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// AnimationHandler 动画处理器
type AnimationHandler struct{}

// NewAnimationHandler 创建动画处理器
func NewAnimationHandler() *AnimationHandler {
	return &AnimationHandler{}
}

// List 获取场景的所有动画
// @Summary 获取动画列表
// @Description 获取指定场景的所有动画
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.SceneAnimationListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animations [get]
func (h *AnimationHandler) List(c *gin.Context) {
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

	var animations []models.SceneAnimation
	if err := db.Where("scene_id = ?", scene.ID).
		Order("`index` ASC").
		Find(&animations).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch animations",
		})
		return
	}

	c.JSON(http.StatusOK, models.SceneAnimationListResponse{
		Total: int64(len(animations)),
		Data:  animations,
	})
}

// Create 创建新的动画
// @Summary 创建动画
// @Description 为场景创建新的动画
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param animation body models.CreateSceneAnimationRequest true "动画信息"
// @Success 201 {object} models.SceneAnimation
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animations [post]
func (h *AnimationHandler) Create(c *gin.Context) {
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

	var req models.CreateSceneAnimationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	animation := models.SceneAnimation{
		SceneID: uint(sceneIdUint),
		Name:    req.Name,
		Index:   req.Index,
	}

	if err := db.Create(&animation).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create animation",
		})
		return
	}

	c.JSON(http.StatusCreated, animation)
}

// GetByID 获取单个动画详情
// @Summary 获取动画详情
// @Description 获取指定动画的详细信息
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param animationId path int true "动画ID"
// @Success 200 {object} models.SceneAnimation
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animations/{animationId} [get]
func (h *AnimationHandler) GetByID(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var animation models.SceneAnimation
	if err := db.Where("id = ? AND scene_id = ?", animationId, scene.ID).First(&animation).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Animation not found",
		})
		return
	}

	c.JSON(http.StatusOK, animation)
}

// Update 更新动画信息（名称、排序等）
// @Summary 更新动画
// @Description 更新动画的基本信息
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param animationId path int true "动画ID"
// @Param animation body models.UpdateSceneAnimationRequest true "更新信息"
// @Success 200 {object} models.SceneAnimation
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animations/{animationId} [put]
func (h *AnimationHandler) Update(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var animation models.SceneAnimation
	if err := db.Where("id = ? AND scene_id = ?", animationId, scene.ID).First(&animation).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Animation not found",
		})
		return
	}

	var req models.UpdateSceneAnimationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	updates := make(map[string]interface{})
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Index != nil {
		updates["`index`"] = *req.Index
	}

	if len(updates) > 0 {
		if err := db.Model(&animation).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to update animation",
			})
			return
		}
	}

	// 重新加载
	db.First(&animation, animation.ID)

	c.JSON(http.StatusOK, animation)
}

// Delete 删除动画
// @Summary 删除动画
// @Description 删除指定的动画及其版本历史
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param animationId path int true "动画ID"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animations/{animationId} [delete]
func (h *AnimationHandler) Delete(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var animation models.SceneAnimation
	if err := db.Where("id = ? AND scene_id = ?", animationId, scene.ID).First(&animation).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Animation not found",
		})
		return
	}

	// 开始事务：删除版本历史和动画
	tx := db.Begin()

	// 删除版本历史
	if err := tx.Where("scene_animation_id = ?", animation.ID).Delete(&models.SceneAnimationVersion{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete animation versions",
		})
		return
	}

	// 删除动画
	if err := tx.Delete(&animation).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete animation",
		})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, gin.H{
		"message": "Animation deleted successfully",
	})
}

// Upload 上传新版本动画
// @Summary 上传动画
// @Description 为动画上传新版本视频
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param animationId path int true "动画ID"
// @Param animation body models.UploadAnimationRequest true "动画URL"
// @Success 200 {object} models.SceneAnimationVersion
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animations/{animationId}/upload [put]
func (h *AnimationHandler) Upload(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")
	animationIdUint, err := strconv.ParseUint(animationId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid animation ID",
		})
		return
	}

	// 获取当前用户ID
	userId, exists := c.Get("userId")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
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

	// 检查动画是否存在
	var animation models.SceneAnimation
	if err := db.Where("id = ? AND scene_id = ?", animationId, scene.ID).First(&animation).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Animation not found",
		})
		return
	}

	var req models.UploadAnimationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 获取当前最大版本号
	var maxVersion int
	db.Model(&models.SceneAnimationVersion{}).
		Where("scene_animation_id = ?", animation.ID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	newVersion := maxVersion + 1

	// 开始事务
	tx := db.Begin()

	// 创建新版本记录
	version := models.SceneAnimationVersion{
		SceneAnimationID: uint(animationIdUint),
		VideoUrl:         req.VideoUrl,
		Version:          newVersion,
		CreatedBy:        userId.(uint),
	}

	if err := tx.Create(&version).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create version",
		})
		return
	}

	// 更新动画的当前视频
	updates := map[string]interface{}{
		"animation_url":     req.VideoUrl,
		"animation_version": newVersion,
	}

	if err := tx.Model(&animation).Updates(updates).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update animation",
		})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, version)
}

// ListVersions 获取动画版本历史
// @Summary 获取动画版本历史
// @Description 获取指定动画的所有版本历史
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param animationId path int true "动画ID"
// @Success 200 {object} models.SceneAnimationVersionListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animations/{animationId}/versions [get]
func (h *AnimationHandler) ListVersions(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	// 检查动画是否存在
	var animation models.SceneAnimation
	if err := db.Where("id = ? AND scene_id = ?", animationId, scene.ID).First(&animation).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Animation not found",
		})
		return
	}

	var versions []models.SceneAnimationVersion
	if err := db.Where("scene_animation_id = ?", animation.ID).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch versions",
		})
		return
	}

	c.JSON(http.StatusOK, models.SceneAnimationVersionListResponse{
		Total: int64(len(versions)),
		Data:  versions,
	})
}

// Revert 回滚动画到指定版本
// @Summary 回滚动画
// @Description 将动画回滚到指定版本
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param animationId path int true "动画ID"
// @Param version path int true "版本号"
// @Success 200 {object} models.SceneAnimation
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animations/{animationId}/revert/{version} [put]
func (h *AnimationHandler) Revert(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")
	versionStr := c.Param("version")
	targetVersion, err := strconv.Atoi(versionStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid version number",
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

	// 检查动画是否存在
	var animation models.SceneAnimation
	if err := db.Where("id = ? AND scene_id = ?", animationId, scene.ID).First(&animation).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Animation not found",
		})
		return
	}

	// 获取目标版本
	var version models.SceneAnimationVersion
	if err := db.Where("scene_animation_id = ? AND version = ?",
		animation.ID, targetVersion).First(&version).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Version not found",
		})
		return
	}

	// 更新动画的当前视频
	updates := map[string]interface{}{
		"animation_url":     version.VideoUrl,
		"animation_version": version.Version,
	}

	if err := db.Model(&animation).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to revert animation",
		})
		return
	}

	// 重新加载
	db.First(&animation, animation.ID)

	c.JSON(http.StatusOK, animation)
}
