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

// GetInfo 获取场景的动画信息
// @Summary 获取动画信息
// @Description 获取指定场景的动画信息，包括当前动画和版本历史
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.AnimationInfo
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animation [get]
func (h *AnimationHandler) GetInfo(c *gin.Context) {
	sceneId := c.Param("sceneId")

	db := database.GetDB()

	// 获取场景
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	// 获取最新的动画版本信息
	var latestVersion models.AnimationVersion
	hasVersion := db.Where("scene_id = ?", scene.ID).
		Order("version DESC").First(&latestVersion).Error == nil

	info := models.AnimationInfo{
		SceneID:          scene.ID,
		AnimationUrl:     scene.AnimationUrl,
		AnimationVersion: scene.AnimationVersion,
	}

	if hasVersion {
		info.LatestVersion = &latestVersion
	}

	c.JSON(http.StatusOK, info)
}

// Update 更新动画（创建新版本）
// @Summary 更新动画
// @Description 上传新的动画视频，创建新版本
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param animation body models.UpdateAnimationRequest true "动画信息"
// @Success 200 {object} models.AnimationVersion
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animation [put]
func (h *AnimationHandler) Update(c *gin.Context) {
	sceneId := c.Param("sceneId")
	sceneIdUint, err := strconv.ParseUint(sceneId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid scene ID",
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

	// 获取场景
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var req models.UpdateAnimationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 获取当前最大版本号
	var maxVersion int
	db.Model(&models.AnimationVersion{}).
		Where("scene_id = ?", scene.ID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	newVersion := maxVersion + 1

	// 开始事务
	tx := db.Begin()

	// 创建新版本记录
	version := models.AnimationVersion{
		SceneID:   uint(sceneIdUint),
		VideoUrl:  req.VideoUrl,
		Version:   newVersion,
		CreatedBy: userId.(uint),
	}

	if err := tx.Create(&version).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create version",
		})
		return
	}

	// 更新场景的当前动画
	updates := map[string]interface{}{
		"animation_url":     req.VideoUrl,
		"animation_version": newVersion,
	}

	if err := tx.Model(&scene).Updates(updates).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update scene",
		})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, version)
}

// ListVersions 获取动画版本历史
// @Summary 获取动画版本历史
// @Description 获取指定场景动画的所有版本历史
// @Tags animation
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.AnimationVersionListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animation/versions [get]
func (h *AnimationHandler) ListVersions(c *gin.Context) {
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

	var versions []models.AnimationVersion
	if err := db.Where("scene_id = ?", scene.ID).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch versions",
		})
		return
	}

	c.JSON(http.StatusOK, models.AnimationVersionListResponse{
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
// @Param version path int true "版本号"
// @Success 200 {object} models.Scene
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/animation/revert/{version} [put]
func (h *AnimationHandler) Revert(c *gin.Context) {
	sceneId := c.Param("sceneId")
	versionStr := c.Param("version")
	targetVersion, err := strconv.Atoi(versionStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid version number",
		})
		return
	}

	db := database.GetDB()

	// 获取场景
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	// 获取目标版本
	var version models.AnimationVersion
	if err := db.Where("scene_id = ? AND version = ?",
		scene.ID, targetVersion).First(&version).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Version not found",
		})
		return
	}

	// 更新场景的当前动画
	updates := map[string]interface{}{
		"animation_url":     version.VideoUrl,
		"animation_version": version.Version,
	}

	if err := db.Model(&scene).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to revert animation",
		})
		return
	}

	// 重新加载场景
	db.First(&scene, sceneId)

	c.JSON(http.StatusOK, scene)
}
