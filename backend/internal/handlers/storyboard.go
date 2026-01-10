package handlers

import (
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// StoryboardHandler 分镜处理器
type StoryboardHandler struct{}

// NewStoryboardHandler 创建分镜处理器
func NewStoryboardHandler() *StoryboardHandler {
	return &StoryboardHandler{}
}

// GetInfo 获取场景的分镜信息
// @Summary 获取分镜信息
// @Description 获取指定场景的分镜信息，包括当前起始帧和结束帧
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.StoryboardInfo
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/storyboard [get]
func (h *StoryboardHandler) GetInfo(c *gin.Context) {
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

	// 获取最新的起始帧版本信息
	var latestStartFrame models.StoryboardVersion
	hasStartFrame := db.Where("scene_id = ? AND frame_type = ?", scene.ID, models.FrameTypeStart).
		Order("version DESC").First(&latestStartFrame).Error == nil

	// 获取最新的结束帧版本信息
	var latestEndFrame models.StoryboardVersion
	hasEndFrame := db.Where("scene_id = ? AND frame_type = ?", scene.ID, models.FrameTypeEnd).
		Order("version DESC").First(&latestEndFrame).Error == nil

	info := models.StoryboardInfo{
		SceneID:           scene.ID,
		StartFrameUrl:     scene.StartFrameUrl,
		StartFrameVersion: scene.StartFrameVersion,
		EndFrameUrl:       scene.EndFrameUrl,
		EndFrameVersion:   scene.EndFrameVersion,
	}

	if hasStartFrame {
		info.LatestStartFrame = &latestStartFrame
	}
	if hasEndFrame {
		info.LatestEndFrame = &latestEndFrame
	}

	c.JSON(http.StatusOK, info)
}

// UpdateStartFrame 更新起始帧（创建新版本）
// @Summary 更新起始帧
// @Description 上传新的起始帧图片，创建新版本
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param frame body models.UpdateFrameRequest true "帧信息"
// @Success 200 {object} models.StoryboardVersion
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/storyboard/start-frame [put]
func (h *StoryboardHandler) UpdateStartFrame(c *gin.Context) {
	h.updateFrame(c, models.FrameTypeStart)
}

// UpdateEndFrame 更新结束帧（创建新版本）
// @Summary 更新结束帧
// @Description 上传新的结束帧图片，创建新版本
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param frame body models.UpdateFrameRequest true "帧信息"
// @Success 200 {object} models.StoryboardVersion
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/storyboard/end-frame [put]
func (h *StoryboardHandler) UpdateEndFrame(c *gin.Context) {
	h.updateFrame(c, models.FrameTypeEnd)
}

// updateFrame 内部方法：更新帧
func (h *StoryboardHandler) updateFrame(c *gin.Context, frameType models.FrameType) {
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

	var req models.UpdateFrameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 获取当前最大版本号
	var maxVersion int
	db.Model(&models.StoryboardVersion{}).
		Where("scene_id = ? AND frame_type = ?", scene.ID, frameType).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	newVersion := maxVersion + 1

	// 开始事务
	tx := db.Begin()

	// 创建新版本记录
	version := models.StoryboardVersion{
		SceneID:   uint(sceneIdUint),
		FrameType: frameType,
		ImageUrl:  req.ImageUrl,
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

	// 更新场景的当前帧
	updates := map[string]interface{}{}
	if frameType == models.FrameTypeStart {
		updates["start_frame_url"] = req.ImageUrl
		updates["start_frame_version"] = newVersion
	} else {
		updates["end_frame_url"] = req.ImageUrl
		updates["end_frame_version"] = newVersion
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

// ListStartFrameVersions 获取起始帧版本历史
// @Summary 获取起始帧版本历史
// @Description 获取指定场景起始帧的所有版本历史
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.StoryboardVersionListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/storyboard/start-frame/versions [get]
func (h *StoryboardHandler) ListStartFrameVersions(c *gin.Context) {
	h.listVersions(c, models.FrameTypeStart)
}

// ListEndFrameVersions 获取结束帧版本历史
// @Summary 获取结束帧版本历史
// @Description 获取指定场景结束帧的所有版本历史
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.StoryboardVersionListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/storyboard/end-frame/versions [get]
func (h *StoryboardHandler) ListEndFrameVersions(c *gin.Context) {
	h.listVersions(c, models.FrameTypeEnd)
}

// listVersions 内部方法：获取版本列表
func (h *StoryboardHandler) listVersions(c *gin.Context, frameType models.FrameType) {
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

	var versions []models.StoryboardVersion
	if err := db.Where("scene_id = ? AND frame_type = ?", scene.ID, frameType).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch versions",
		})
		return
	}

	c.JSON(http.StatusOK, models.StoryboardVersionListResponse{
		Total: int64(len(versions)),
		Data:  versions,
	})
}

// RevertStartFrame 回滚起始帧到指定版本
// @Summary 回滚起始帧
// @Description 将起始帧回滚到指定版本
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param version path int true "版本号"
// @Success 200 {object} models.Scene
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/storyboard/start-frame/revert/{version} [put]
func (h *StoryboardHandler) RevertStartFrame(c *gin.Context) {
	h.revertFrame(c, models.FrameTypeStart)
}

// RevertEndFrame 回滚结束帧到指定版本
// @Summary 回滚结束帧
// @Description 将结束帧回滚到指定版本
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param version path int true "版本号"
// @Success 200 {object} models.Scene
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/storyboard/end-frame/revert/{version} [put]
func (h *StoryboardHandler) RevertEndFrame(c *gin.Context) {
	h.revertFrame(c, models.FrameTypeEnd)
}

// revertFrame 内部方法：回滚帧
func (h *StoryboardHandler) revertFrame(c *gin.Context, frameType models.FrameType) {
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
	var version models.StoryboardVersion
	if err := db.Where("scene_id = ? AND frame_type = ? AND version = ?",
		scene.ID, frameType, targetVersion).First(&version).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Version not found",
		})
		return
	}

	// 更新场景的当前帧
	updates := map[string]interface{}{}
	if frameType == models.FrameTypeStart {
		updates["start_frame_url"] = version.ImageUrl
		updates["start_frame_version"] = version.Version
	} else {
		updates["end_frame_url"] = version.ImageUrl
		updates["end_frame_version"] = version.Version
	}

	if err := db.Model(&scene).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to revert frame",
		})
		return
	}

	// 重新加载场景
	db.First(&scene, sceneId)

	c.JSON(http.StatusOK, scene)
}
