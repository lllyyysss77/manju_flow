package handlers

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
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

type ttsSynthesisRequest struct {
	Text           string    `json:"text"`
	ReferenceAudio string    `json:"reference_audio,omitempty"`
	EmotionPrompt  string    `json:"emotion_prompt,omitempty"`
	EmotionVector  []float64 `json:"emotion_vector,omitempty"`
	EmotionAlpha   *float64  `json:"emotion_alpha,omitempty"`
}

type ttsErrorResponse struct {
	Detail any `json:"detail"`
	Error  any `json:"error"`
}

func (h *AudioHandler) generateTTSJWT() (string, error) {
	privateKeyPEM := strings.TrimSpace(config.Cfg.TTS.JWTPrivateKey)
	if privateKeyPEM == "" {
		return "", nil
	}

	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return "", fmt.Errorf("failed to parse TTS JWT private key PEM")
	}

	var privateKey *rsa.PrivateKey
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err == nil {
		var ok bool
		privateKey, ok = key.(*rsa.PrivateKey)
		if !ok {
			return "", fmt.Errorf("TTS JWT private key is not RSA")
		}
	} else {
		privateKey, err = x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return "", fmt.Errorf("failed to parse TTS JWT private key: %w", err)
		}
	}

	headerJSON, err := json.Marshal(map[string]string{
		"alg": "RS256",
		"typ": "JWT",
	})
	if err != nil {
		return "", fmt.Errorf("failed to encode JWT header: %w", err)
	}

	expireSeconds := config.Cfg.TTS.JWTExpireSeconds
	if expireSeconds <= 0 {
		expireSeconds = 60
	}
	payloadJSON, err := json.Marshal(map[string]int64{
		"exp": time.Now().Add(time.Duration(expireSeconds) * time.Second).Unix(),
	})
	if err != nil {
		return "", fmt.Errorf("failed to encode JWT payload: %w", err)
	}

	encoding := base64.RawURLEncoding
	signingInput := encoding.EncodeToString(headerJSON) + "." + encoding.EncodeToString(payloadJSON)
	digest := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, digest[:])
	if err != nil {
		return "", fmt.Errorf("failed to sign JWT: %w", err)
	}

	return signingInput + "." + encoding.EncodeToString(signature), nil
}

func (h *AudioHandler) findOwnedFile(db *gorm.DB, userID uint, key string) (*models.File, error) {
	normalizedKey := strings.TrimSpace(key)
	if normalizedKey == "" {
		return nil, fmt.Errorf("file key is required")
	}

	var file models.File
	if err := db.Where("`key` = ? AND uploader_id = ?", normalizedKey, userID).First(&file).Error; err != nil {
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
// @Description 使用声音参考、情感参考或情感向量为音频轨道生成新版本
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

	if len(req.EmotionVector) > 0 && len(req.EmotionVector) != 8 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "emotionVector must contain exactly 8 values",
		})
		return
	}
	for idx, value := range req.EmotionVector {
		if value < 0 || value > 1 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("emotionVector[%d] must be between 0 and 1", idx),
			})
			return
		}
	}
	if req.EmotionAlpha != nil && (*req.EmotionAlpha < 0 || *req.EmotionAlpha > 2) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "emotionAlpha must be between 0 and 2",
		})
		return
	}

	referenceFile, err := h.findOwnedFile(db, userID, req.ReferenceAudioKey)
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

	var emotionPromptURL string
	if strings.TrimSpace(req.EmotionPromptKey) != "" {
		emotionFile, err := h.findOwnedFile(db, userID, req.EmotionPromptKey)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Emotion reference audio not found",
			})
			return
		}

		emotionPromptURL, err = h.buildSignedAudioURL(emotionFile)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "Failed to prepare emotion reference audio",
			})
			return
		}
	}

	ttsURL := strings.TrimSpace(config.Cfg.TTS.APIURL)
	if ttsURL == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "TTS service is not configured",
		})
		return
	}

	ttsReq := ttsSynthesisRequest{
		Text:           strings.TrimSpace(req.Text),
		ReferenceAudio: referenceURL,
		EmotionPrompt:  emotionPromptURL,
		EmotionVector:  req.EmotionVector,
		EmotionAlpha:   req.EmotionAlpha,
	}
	if ttsReq.Text == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "text is required",
		})
		return
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
	ttsJWT, err := h.generateTTSJWT()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to generate TTS JWT",
		})
		return
	}
	if ttsJWT != "" {
		httpReq.Header.Set("Authorization", "Bearer "+ttsJWT)
	}

	httpClient := &http.Client{Timeout: 10 * time.Minute}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "TTS service is unavailable",
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		rawErr, _ := io.ReadAll(resp.Body)
		message := strings.TrimSpace(string(rawErr))
		if message != "" {
			var ttsErr ttsErrorResponse
			if err := json.Unmarshal(rawErr, &ttsErr); err == nil {
				switch detail := ttsErr.Detail.(type) {
				case string:
					message = detail
				default:
					if detail != nil {
						message = fmt.Sprint(detail)
					}
				}
				if message == "" {
					switch apiErr := ttsErr.Error.(type) {
					case string:
						message = apiErr
					default:
						if apiErr != nil {
							message = fmt.Sprint(apiErr)
						}
					}
				}
			}
		}
		if message == "" {
			message = "TTS generation failed"
		}
		c.JSON(http.StatusBadGateway, gin.H{
			"error": message,
		})
		return
	}

	audioBytes, err := io.ReadAll(resp.Body)
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
	fileName := fmt.Sprintf("scene-%d-audio-%d-v%d.wav", scene.ID, audio.ID, newVersion)
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
		if err := ossClient.UploadBytes(objectKey, content, "audio/wav"); err != nil {
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
		MimeType:     "audio/wav",
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
		CreatedBy:    userID,
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
