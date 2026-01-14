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

// List 获取场景的所有帧集
// @Summary 获取帧集列表
// @Description 获取指定场景的所有帧集
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.SceneFrameSetListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets [get]
func (h *StoryboardHandler) List(c *gin.Context) {
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

	var frameSets []models.SceneFrameSet
	if err := db.Where("scene_id = ?", scene.ID).
		Order("`index` ASC").
		Find(&frameSets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch frame sets",
		})
		return
	}

	// 确保返回空数组而不是 null
	if frameSets == nil {
		frameSets = []models.SceneFrameSet{}
	}

	c.JSON(http.StatusOK, models.SceneFrameSetListResponse{
		Total: int64(len(frameSets)),
		Data:  frameSets,
	})
}

// Create 创建新的帧集
// @Summary 创建帧集
// @Description 为场景创建新的帧集
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param frameSet body models.CreateSceneFrameSetRequest true "帧集信息"
// @Success 201 {object} models.SceneFrameSet
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets [post]
func (h *StoryboardHandler) Create(c *gin.Context) {
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

	var req models.CreateSceneFrameSetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	frameSet := models.SceneFrameSet{
		SceneID: uint(sceneIdUint),
		Name:    req.Name,
		Index:   req.Index,
	}

	if err := db.Create(&frameSet).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create frame set",
		})
		return
	}

	c.JSON(http.StatusCreated, frameSet)
}

// GetByID 获取单个帧集详情
// @Summary 获取帧集详情
// @Description 获取指定帧集的详细信息
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param frameSetId path int true "帧集ID"
// @Success 200 {object} models.SceneFrameSet
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets/{frameSetId} [get]
func (h *StoryboardHandler) GetByID(c *gin.Context) {
	sceneId := c.Param("sceneId")
	frameSetId := c.Param("frameSetId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var frameSet models.SceneFrameSet
	if err := db.Where("id = ? AND scene_id = ?", frameSetId, scene.ID).First(&frameSet).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Frame set not found",
		})
		return
	}

	c.JSON(http.StatusOK, frameSet)
}

// Update 更新帧集信息（名称、排序等）
// @Summary 更新帧集
// @Description 更新帧集的基本信息
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param frameSetId path int true "帧集ID"
// @Param frameSet body models.UpdateSceneFrameSetRequest true "更新信息"
// @Success 200 {object} models.SceneFrameSet
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets/{frameSetId} [put]
func (h *StoryboardHandler) Update(c *gin.Context) {
	sceneId := c.Param("sceneId")
	frameSetId := c.Param("frameSetId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var frameSet models.SceneFrameSet
	if err := db.Where("id = ? AND scene_id = ?", frameSetId, scene.ID).First(&frameSet).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Frame set not found",
		})
		return
	}

	var req models.UpdateSceneFrameSetRequest
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
		if err := db.Model(&frameSet).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to update frame set",
			})
			return
		}
	}

	// 重新加载
	db.First(&frameSet, frameSet.ID)

	c.JSON(http.StatusOK, frameSet)
}

// Delete 删除帧集
// @Summary 删除帧集
// @Description 删除指定的帧集及其版本历史
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param frameSetId path int true "帧集ID"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets/{frameSetId} [delete]
func (h *StoryboardHandler) Delete(c *gin.Context) {
	sceneId := c.Param("sceneId")
	frameSetId := c.Param("frameSetId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var frameSet models.SceneFrameSet
	if err := db.Where("id = ? AND scene_id = ?", frameSetId, scene.ID).First(&frameSet).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Frame set not found",
		})
		return
	}

	// 开始事务：删除版本历史和帧集
	tx := db.Begin()

	// 删除版本历史
	if err := tx.Where("scene_frame_set_id = ?", frameSet.ID).Delete(&models.SceneFrameSetVersion{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete frame set versions",
		})
		return
	}

	// 删除帧集
	if err := tx.Delete(&frameSet).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete frame set",
		})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, gin.H{
		"message": "Frame set deleted successfully",
	})
}

// UpdateStartFrame 更新起始帧（创建新版本）
// @Summary 更新起始帧
// @Description 上传新的起始帧图片，创建新版本
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param frameSetId path int true "帧集ID"
// @Param frame body models.UpdateFrameRequest true "帧信息"
// @Success 200 {object} models.SceneFrameSetVersion
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets/{frameSetId}/start-frame [put]
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
// @Param frameSetId path int true "帧集ID"
// @Param frame body models.UpdateFrameRequest true "帧信息"
// @Success 200 {object} models.SceneFrameSetVersion
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets/{frameSetId}/end-frame [put]
func (h *StoryboardHandler) UpdateEndFrame(c *gin.Context) {
	h.updateFrame(c, models.FrameTypeEnd)
}

// updateFrame 内部方法：更新帧
func (h *StoryboardHandler) updateFrame(c *gin.Context, frameType models.FrameType) {
	sceneId := c.Param("sceneId")
	frameSetId := c.Param("frameSetId")
	frameSetIdUint, err := strconv.ParseUint(frameSetId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid frame set ID",
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

	// 检查帧集是否存在
	var frameSet models.SceneFrameSet
	if err := db.Where("id = ? AND scene_id = ?", frameSetId, scene.ID).First(&frameSet).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Frame set not found",
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
	db.Model(&models.SceneFrameSetVersion{}).
		Where("scene_frame_set_id = ? AND frame_type = ?", frameSet.ID, frameType).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	newVersion := maxVersion + 1

	// 开始事务
	tx := db.Begin()

	// 创建新版本记录
	version := models.SceneFrameSetVersion{
		SceneFrameSetID: uint(frameSetIdUint),
		FrameType:       frameType,
		ImageUrl:        req.ImageUrl,
		Version:         newVersion,
		CreatedBy:       userId.(uint),
	}

	if err := tx.Create(&version).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create version",
		})
		return
	}

	// 更新帧集的当前帧
	updates := map[string]interface{}{}
	if frameType == models.FrameTypeStart {
		updates["start_frame_url"] = req.ImageUrl
		updates["start_frame_version"] = newVersion
	} else {
		updates["end_frame_url"] = req.ImageUrl
		updates["end_frame_version"] = newVersion
	}

	if err := tx.Model(&frameSet).Updates(updates).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update frame set",
		})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, version)
}

// ListStartFrameVersions 获取起始帧版本历史
// @Summary 获取起始帧版本历史
// @Description 获取指定帧集起始帧的所有版本历史
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param frameSetId path int true "帧集ID"
// @Success 200 {object} models.SceneFrameSetVersionListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets/{frameSetId}/start-frame/versions [get]
func (h *StoryboardHandler) ListStartFrameVersions(c *gin.Context) {
	h.listVersions(c, models.FrameTypeStart)
}

// ListEndFrameVersions 获取结束帧版本历史
// @Summary 获取结束帧版本历史
// @Description 获取指定帧集结束帧的所有版本历史
// @Tags storyboard
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param frameSetId path int true "帧集ID"
// @Success 200 {object} models.SceneFrameSetVersionListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets/{frameSetId}/end-frame/versions [get]
func (h *StoryboardHandler) ListEndFrameVersions(c *gin.Context) {
	h.listVersions(c, models.FrameTypeEnd)
}

// listVersions 内部方法：获取版本列表
func (h *StoryboardHandler) listVersions(c *gin.Context, frameType models.FrameType) {
	sceneId := c.Param("sceneId")
	frameSetId := c.Param("frameSetId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		// 场景不存在时返回空数组
		c.JSON(http.StatusOK, models.SceneFrameSetVersionListResponse{
			Total: 0,
			Data:  []models.SceneFrameSetVersion{},
		})
		return
	}

	// 检查帧集是否存在
	var frameSet models.SceneFrameSet
	if err := db.Where("id = ? AND scene_id = ?", frameSetId, scene.ID).First(&frameSet).Error; err != nil {
		// 帧集不存在时返回空数组
		c.JSON(http.StatusOK, models.SceneFrameSetVersionListResponse{
			Total: 0,
			Data:  []models.SceneFrameSetVersion{},
		})
		return
	}

	var versions []models.SceneFrameSetVersion
	if err := db.Where("scene_frame_set_id = ? AND frame_type = ?", frameSet.ID, frameType).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch versions",
		})
		return
	}

	// 确保返回空数组而不是 null
	if versions == nil {
		versions = []models.SceneFrameSetVersion{}
	}

	c.JSON(http.StatusOK, models.SceneFrameSetVersionListResponse{
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
// @Param frameSetId path int true "帧集ID"
// @Param version path int true "版本号"
// @Success 200 {object} models.SceneFrameSet
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets/{frameSetId}/start-frame/revert/{version} [put]
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
// @Param frameSetId path int true "帧集ID"
// @Param version path int true "版本号"
// @Success 200 {object} models.SceneFrameSet
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/frame-sets/{frameSetId}/end-frame/revert/{version} [put]
func (h *StoryboardHandler) RevertEndFrame(c *gin.Context) {
	h.revertFrame(c, models.FrameTypeEnd)
}

// revertFrame 内部方法：回滚帧
func (h *StoryboardHandler) revertFrame(c *gin.Context, frameType models.FrameType) {
	sceneId := c.Param("sceneId")
	frameSetId := c.Param("frameSetId")
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

	// 检查帧集是否存在
	var frameSet models.SceneFrameSet
	if err := db.Where("id = ? AND scene_id = ?", frameSetId, scene.ID).First(&frameSet).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Frame set not found",
		})
		return
	}

	// 获取目标版本
	var version models.SceneFrameSetVersion
	if err := db.Where("scene_frame_set_id = ? AND frame_type = ? AND version = ?",
		frameSet.ID, frameType, targetVersion).First(&version).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Version not found",
		})
		return
	}

	// 更新帧集的当前帧
	updates := map[string]interface{}{}
	if frameType == models.FrameTypeStart {
		updates["start_frame_url"] = version.ImageUrl
		updates["start_frame_version"] = version.Version
	} else {
		updates["end_frame_url"] = version.ImageUrl
		updates["end_frame_version"] = version.Version
	}

	if err := db.Model(&frameSet).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to revert frame",
		})
		return
	}

	// 重新加载帧集
	db.First(&frameSet, frameSet.ID)

	c.JSON(http.StatusOK, frameSet)
}
