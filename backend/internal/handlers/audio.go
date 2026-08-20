package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"manju-flow/internal/config"
	"manju-flow/internal/database"
	"manju-flow/internal/models"
	"manju-flow/internal/oss"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AudioHandler 音频处理器
type AudioHandler struct{}

// NewAudioHandler 创建音频处理器
func NewAudioHandler() *AudioHandler {
	return &AudioHandler{}
}

type seedAudioReference struct {
	AudioURL string `json:"audio_url,omitempty"`
	Speaker  string `json:"speaker,omitempty"`
}

type seedAudioConfig struct {
	Format string `json:"format,omitempty"`
}

type seedAudioRequest struct {
	Model       string               `json:"model"`
	TextPrompt  string               `json:"text_prompt"`
	References  []seedAudioReference `json:"references,omitempty"`
	AudioConfig seedAudioConfig      `json:"audio_config"`
}

type seedAudioResponse struct {
	Code             int     `json:"code"`
	Message          string  `json:"message"`
	Audio            string  `json:"audio"`
	URL              string  `json:"url"`
	Duration         float64 `json:"duration"`
	OriginalDuration float64 `json:"original_duration"`
}

func (h *AudioHandler) findReferenceFile(db *gorm.DB, key string) (*models.File, error) {
	normalizedKey := strings.TrimSpace(key)
	if normalizedKey == "" {
		return nil, fmt.Errorf("file key is required")
	}

	var file models.File
	if err := db.Where("`key` = ?", normalizedKey).First(&file).Error; err != nil {
		return nil, err
	}

	return &file, nil
}

func (h *AudioHandler) buildSignedAudioURL(file *models.File) (string, error) {
	ossClient := oss.GetClient()
	if ossClient == nil {
		return "", fmt.Errorf("file service not configured")
	}

	return ossClient.GetSignedURL(file.Key, 3600)
}

func (h *AudioHandler) readGeneratedAudio(ctx context.Context, client *http.Client, response *seedAudioResponse) ([]byte, error) {
	if response.Audio != "" {
		return base64.StdEncoding.DecodeString(response.Audio)
	}
	if response.URL == "" {
		return nil, fmt.Errorf("response contains neither audio nor url")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, response.URL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("audio download failed with status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func audioMimeType(format string) string {
	switch strings.ToLower(format) {
	case "wav":
		return "audio/wav"
	case "pcm":
		return "audio/L16"
	case "ogg_opus":
		return "audio/ogg"
	default:
		return "audio/mpeg"
	}
}

// List 获取场景的所有音频轨道
// @Summary 获取音频轨道列表
// @Description 获取指定场景的所有音频轨道
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Success 200 {object} models.SceneAudioListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audios [get]
func (h *AudioHandler) List(c *gin.Context) {
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

	var audios []models.SceneAudio
	if err := db.Where("scene_id = ?", scene.ID).
		Order("`index` ASC").
		Find(&audios).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch audios",
		})
		return
	}

	c.JSON(http.StatusOK, models.SceneAudioListResponse{
		Total: int64(len(audios)),
		Data:  audios,
	})
}

// Create 创建新的音频轨道
// @Summary 创建音频轨道
// @Description 为场景创建新的音频轨道
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param audio body models.CreateSceneAudioRequest true "音频轨道信息"
// @Success 201 {object} models.SceneAudio
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audios [post]
func (h *AudioHandler) Create(c *gin.Context) {
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

	var req models.CreateSceneAudioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	audio := models.SceneAudio{
		SceneID: uint(sceneIdUint),
		Role:    req.Role,
		Index:   req.Index,
	}

	if err := db.Create(&audio).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create audio",
		})
		return
	}

	c.JSON(http.StatusCreated, audio)
}

// GetByID 获取单个音频轨道详情
// @Summary 获取音频轨道详情
// @Description 获取指定音频轨道的详细信息
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param audioId path int true "音频轨道ID"
// @Success 200 {object} models.SceneAudio
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audios/{audioId} [get]
func (h *AudioHandler) GetByID(c *gin.Context) {
	sceneId := c.Param("sceneId")
	audioId := c.Param("audioId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var audio models.SceneAudio
	if err := db.Where("id = ? AND scene_id = ?", audioId, scene.ID).First(&audio).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Audio not found",
		})
		return
	}

	c.JSON(http.StatusOK, audio)
}

// Update 更新音频轨道信息（角色名、排序等）
// @Summary 更新音频轨道
// @Description 更新音频轨道的基本信息
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param audioId path int true "音频轨道ID"
// @Param audio body models.UpdateSceneAudioRequest true "更新信息"
// @Success 200 {object} models.SceneAudio
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audios/{audioId} [put]
func (h *AudioHandler) Update(c *gin.Context) {
	sceneId := c.Param("sceneId")
	audioId := c.Param("audioId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var audio models.SceneAudio
	if err := db.Where("id = ? AND scene_id = ?", audioId, scene.ID).First(&audio).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Audio not found",
		})
		return
	}

	var req models.UpdateSceneAudioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	updates := make(map[string]interface{})
	if req.Role != nil {
		updates["role"] = *req.Role
	}
	if req.Index != nil {
		updates["`index`"] = *req.Index
	}

	if len(updates) > 0 {
		if err := db.Model(&audio).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to update audio",
			})
			return
		}
	}

	// 重新加载
	db.First(&audio, audio.ID)

	c.JSON(http.StatusOK, audio)
}

// Delete 删除音频轨道
// @Summary 删除音频轨道
// @Description 删除指定的音频轨道及其版本历史
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param audioId path int true "音频轨道ID"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audios/{audioId} [delete]
func (h *AudioHandler) Delete(c *gin.Context) {
	sceneId := c.Param("sceneId")
	audioId := c.Param("audioId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var audio models.SceneAudio
	if err := db.Where("id = ? AND scene_id = ?", audioId, scene.ID).First(&audio).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Audio not found",
		})
		return
	}

	// 开始事务：删除版本历史和音频轨道
	tx := db.Begin()

	// 删除版本历史
	if err := tx.Where("scene_audio_id = ?", audio.ID).Delete(&models.SceneAudioVersion{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete audio versions",
		})
		return
	}

	// 删除音频轨道
	if err := tx.Delete(&audio).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete audio",
		})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, gin.H{
		"message": "Audio deleted successfully",
	})
}

// Upload 上传新版本音频
// @Summary 上传音频
// @Description 为音频轨道上传新版本音频
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param audioId path int true "音频轨道ID"
// @Param audio body models.UploadAudioRequest true "音频URL"
// @Success 200 {object} models.SceneAudioVersion
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audios/{audioId}/upload [put]
func (h *AudioHandler) Upload(c *gin.Context) {
	sceneId := c.Param("sceneId")
	audioId := c.Param("audioId")
	audioIdUint, err := strconv.ParseUint(audioId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid audio ID",
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

	// 检查音频轨道是否存在
	var audio models.SceneAudio
	if err := db.Where("id = ? AND scene_id = ?", audioId, scene.ID).First(&audio).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Audio not found",
		})
		return
	}

	var req models.UploadAudioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 获取当前最大版本号
	var maxVersion int
	db.Model(&models.SceneAudioVersion{}).
		Where("scene_audio_id = ?", audio.ID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	newVersion := maxVersion + 1

	// 开始事务
	tx := db.Begin()

	// 创建新版本记录
	version := models.SceneAudioVersion{
		SceneAudioID: uint(audioIdUint),
		AudioUrl:     req.AudioUrl,
		Version:      newVersion,
		CreatedBy:    userId.(uint),
	}

	if err := tx.Create(&version).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create version",
		})
		return
	}

	// 更新音频轨道的当前音频
	updates := map[string]interface{}{
		"audio_url":     req.AudioUrl,
		"audio_version": newVersion,
	}

	if err := tx.Model(&audio).Updates(updates).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update audio",
		})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, version)
}

// Generate 使用 TTS 服务为音频轨道生成新版本
// @Summary AI 合成音频
// @Description 使用 Seed Audio 提示词和最多 3 条参考音频为音频轨道生成新版本
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param audioId path int true "音频轨道ID"
// @Param payload body models.GenerateSceneAudioRequest true "合成参数"
// @Success 200 {object} models.SceneAudioVersion
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audios/{audioId}/generate [post]
func (h *AudioHandler) Generate(c *gin.Context) {
	sceneID := c.Param("sceneId")
	audioID := c.Param("audioId")
	audioIDUint, err := strconv.ParseUint(audioID, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid audio ID",
		})
		return
	}

	user, userExists := c.Get("user")
	userIDValue, userIDExists := c.Get("userId")
	if !userExists || !userIDExists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}
	currentUser := user.(*models.User)
	userID := userIDValue.(uint)

	db := database.GetDB()

	var scene models.Scene
	if err := db.First(&scene, sceneID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var audio models.SceneAudio
	if err := db.Where("id = ? AND scene_id = ?", audioID, scene.ID).First(&audio).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Audio not found",
		})
		return
	}

	var req models.GenerateSceneAudioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	textPrompt := strings.TrimSpace(req.TextPrompt)
	if textPrompt == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "textPrompt is required",
		})
		return
	}
	if len([]rune(textPrompt)) > 3000 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "textPrompt must contain at most 3000 characters",
		})
		return
	}
	if len(req.ReferenceAudioKeys) > 3 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "referenceAudioKeys supports at most 3 files",
		})
		return
	}

	references := make([]seedAudioReference, 0, len(req.ReferenceAudioKeys))
	referenceAssets := make([]models.AudioReferenceAsset, 0, len(req.ReferenceAudioKeys))
	for _, key := range req.ReferenceAudioKeys {
		referenceFile, err := h.findReferenceFile(db, key)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Reference audio not found",
			})
			return
		}

		referenceURL, err := h.buildSignedAudioURL(referenceFile)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Failed to prepare reference audio",
			})
			return
		}
		references = append(references, seedAudioReference{AudioURL: referenceURL})
		referenceAssets = append(referenceAssets, models.AudioReferenceAsset{
			Key:  referenceFile.Key,
			Name: referenceFile.OriginalName,
		})
	}

	ttsURL := strings.TrimSpace(config.Cfg.TTS.APIURL)
	ttsAPIKey := strings.TrimSpace(config.Cfg.TTS.APIKey)
	ttsModel := strings.TrimSpace(config.Cfg.TTS.Model)
	audioFormat := strings.TrimSpace(config.Cfg.TTS.Format)
	if ttsURL == "" || ttsAPIKey == "" || ttsModel == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "TTS service is not configured",
		})
		return
	}
	if audioFormat == "" {
		audioFormat = "mp3"
	}

	ttsReq := seedAudioRequest{
		Model:       ttsModel,
		TextPrompt:  textPrompt,
		References:  references,
		AudioConfig: seedAudioConfig{Format: audioFormat},
	}

	body, err := json.Marshal(ttsReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to encode TTS request",
		})
		return
	}

	httpReq, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, ttsURL, bytes.NewReader(body))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create TTS request",
		})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Api-Key", ttsAPIKey)

	httpClient := &http.Client{Timeout: 10 * time.Minute}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "TTS service is unavailable",
		})
		return
	}
	defer resp.Body.Close()

	var seedResp seedAudioResponse
	if err := json.NewDecoder(resp.Body).Decode(&seedResp); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "TTS service returned an invalid response",
		})
		return
	}
	if resp.StatusCode >= http.StatusBadRequest || seedResp.Code != 0 {
		message := strings.TrimSpace(seedResp.Message)
		if message == "" {
			message = fmt.Sprintf("TTS generation failed with status %d", resp.StatusCode)
		}
		c.JSON(http.StatusBadGateway, gin.H{
			"error": message,
		})
		return
	}

	audioBytes, err := h.readGeneratedAudio(c.Request.Context(), httpClient, &seedResp)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "Failed to read generated audio",
		})
		return
	}

	if len(audioBytes) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "TTS service returned empty audio",
		})
		return
	}

	var maxVersion int
	db.Model(&models.SceneAudioVersion{}).
		Where("scene_audio_id = ?", audio.ID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	newVersion := maxVersion + 1
	fileName := fmt.Sprintf("scene-%d-audio-%d-v%d.%s", scene.ID, audio.ID, newVersion, audioFormat)
	objectKey, content, err := oss.GenerateKeyFromContent(bytes.NewReader(audioBytes), fileName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to process generated audio",
		})
		return
	}

	ossClient := oss.GetClient()
	if ossClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "File service is not configured",
		})
		return
	}

	exists, err := ossClient.Exists(objectKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to check generated audio file",
		})
		return
	}
	if !exists {
		if err := ossClient.UploadBytes(objectKey, content, audioMimeType(audioFormat)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to store generated audio",
			})
			return
		}
	}

	fileRecord := models.File{
		Key:          objectKey,
		OriginalName: fileName,
		Size:         int64(len(content)),
		MimeType:     audioMimeType(audioFormat),
		UploaderID:   currentUser.ID,
		Visibility:   models.FileVisibilityPrivate,
	}

	tx := db.Begin()

	if err := tx.Create(&fileRecord).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to save generated audio file",
		})
		return
	}

	version := models.SceneAudioVersion{
		SceneAudioID: uint(audioIDUint),
		AudioUrl:     objectKey,
		Version:      newVersion,
		GenerationParams: &models.AudioGenerationParams{
			TextPrompt:      textPrompt,
			ReferenceAudios: referenceAssets,
		},
		CreatedBy: userID,
	}

	if err := tx.Create(&version).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create generated audio version",
		})
		return
	}

	if err := tx.Model(&audio).Updates(map[string]interface{}{
		"audio_url":     objectKey,
		"audio_version": newVersion,
	}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update audio track",
		})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, version)
}

// ListVersions 获取音频版本历史
// @Summary 获取音频版本历史
// @Description 获取指定音频轨道的所有版本历史
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param audioId path int true "音频轨道ID"
// @Success 200 {object} models.SceneAudioVersionListResponse
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audios/{audioId}/versions [get]
func (h *AudioHandler) ListVersions(c *gin.Context) {
	sceneId := c.Param("sceneId")
	audioId := c.Param("audioId")

	db := database.GetDB()

	// 检查场景是否存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	// 检查音频轨道是否存在
	var audio models.SceneAudio
	if err := db.Where("id = ? AND scene_id = ?", audioId, scene.ID).First(&audio).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Audio not found",
		})
		return
	}

	var versions []models.SceneAudioVersion
	if err := db.Where("scene_audio_id = ?", audio.ID).
		Order("version DESC").
		Find(&versions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch versions",
		})
		return
	}

	c.JSON(http.StatusOK, models.SceneAudioVersionListResponse{
		Total: int64(len(versions)),
		Data:  versions,
	})
}

// Revert 回滚音频到指定版本
// @Summary 回滚音频
// @Description 将音频轨道回滚到指定版本
// @Tags audio
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param audioId path int true "音频轨道ID"
// @Param version path int true "版本号"
// @Success 200 {object} models.SceneAudio
// @Failure 404 {object} map[string]string
// @Router /api/scenes/{sceneId}/audios/{audioId}/revert/{version} [put]
func (h *AudioHandler) Revert(c *gin.Context) {
	sceneId := c.Param("sceneId")
	audioId := c.Param("audioId")
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

	// 检查音频轨道是否存在
	var audio models.SceneAudio
	if err := db.Where("id = ? AND scene_id = ?", audioId, scene.ID).First(&audio).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Audio not found",
		})
		return
	}

	// 获取目标版本
	var version models.SceneAudioVersion
	if err := db.Where("scene_audio_id = ? AND version = ?",
		audio.ID, targetVersion).First(&version).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Version not found",
		})
		return
	}

	// 更新音频轨道的当前音频
	updates := map[string]interface{}{
		"audio_url":     version.AudioUrl,
		"audio_version": version.Version,
	}

	if err := db.Model(&audio).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to revert audio",
		})
		return
	}

	// 重新加载
	db.First(&audio, audio.ID)

	c.JSON(http.StatusOK, audio)
}
