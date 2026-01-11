package handlers

import (
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// AudioHandler 音频处理器
type AudioHandler struct{}

// NewAudioHandler 创建音频处理器
func NewAudioHandler() *AudioHandler {
	return &AudioHandler{}
}

// GetInfo 获取场景的音频信息
// @Summary 获取音频信息
// @Description 获取指定场景的音频信息，包括当前音频和版本历史
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.AudioInfo
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audio [get]
func (h *AudioHandler) GetInfo(c *gin.Context) {
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

	// 获取最新的音频版本信息
	var latestVersion models.AudioVersion
	hasVersion := db.Where("scene_id = ?", scene.ID).
		Order("version DESC").First(&latestVersion).Error == nil

	info := models.AudioInfo{
		SceneID:      scene.ID,
		AudioUrl:     scene.AudioUrl,
		AudioVersion: scene.AudioVersion,
	}

	if hasVersion {
		info.LatestVersion = &latestVersion
	}

	c.JSON(http.StatusOK, info)
}

// Update 更新音频（创建新版本）
// @Summary 更新音频
// @Description 上传新的音频文件，创建新版本
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param audio body models.UpdateAudioRequest true "音频信息"
// @Success 200 {object} models.AudioVersion
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audio [put]
func (h *AudioHandler) Update(c *gin.Context) {
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

	var req models.UpdateAudioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 获取当前最大版本号
	var maxVersion int
	db.Model(&models.AudioVersion{}).
		Where("scene_id = ?", scene.ID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	newVersion := maxVersion + 1

	// 开始事务
	tx := db.Begin()

	// 创建新版本记录
	version := models.AudioVersion{
		SceneID:   uint(sceneIdUint),
		AudioUrl:  req.AudioUrl,
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

	// 更新场景的当前音频
	updates := map[string]interface{}{
		"audio_url":     req.AudioUrl,
		"audio_version": newVersion,
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

// ListVersions 获取音频版本历史
// @Summary 获取音频版本历史
// @Description 获取指定场景音频的所有版本历史
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.AudioVersionListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audio/versions [get]
func (h *AudioHandler) ListVersions(c *gin.Context) {
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

	var versions []models.AudioVersion
	if err := db.Where("scene_id = ?", scene.ID).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch versions",
		})
		return
	}

	c.JSON(http.StatusOK, models.AudioVersionListResponse{
		Total: int64(len(versions)),
		Data:  versions,
	})
}

// Revert 回滚音频到指定版本
// @Summary 回滚音频
// @Description 将音频回滚到指定版本
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param version path int true "版本号"
// @Success 200 {object} models.Scene
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audio/revert/{version} [put]
func (h *AudioHandler) Revert(c *gin.Context) {
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
	var version models.AudioVersion
	if err := db.Where("scene_id = ? AND version = ?",
		scene.ID, targetVersion).First(&version).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Version not found",
		})
		return
	}

	// 更新场景的当前音频
	updates := map[string]interface{}{
		"audio_url":     version.AudioUrl,
		"audio_version": version.Version,
	}

	if err := db.Model(&scene).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to revert audio",
		})
		return
	}

	// 重新加载场景
	db.First(&scene, sceneId)

	c.JSON(http.StatusOK, scene)
}
