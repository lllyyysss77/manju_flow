package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"manju-flow/internal/config"
	"manju-flow/internal/database"
	"manju-flow/internal/models"
	"manju-flow/internal/oss"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	arkTaskCreatePath               = "/api/plan/v3/contents/generations/tasks"
	animationTaskPollInterval       = 10 * time.Second
	animationTaskPollBatchSize      = 20
	animationTaskPollRequestTimeout = 30 * time.Second
	animationVersionDownloadTimeout = 2 * time.Minute
)

var (
	allowedAnimationRatios = map[string]struct{}{
		"16:9": {},
		"9:16": {},
	}
	allowedAnimationModels = map[string]struct{}{
		"doubao-seedance-2-0-260128":      {},
		"doubao-seedance-2-0-fast-260128": {},
	}
	animationTaskPollerRunning atomic.Bool
)

// AnimationHandler 动画处理器
type AnimationHandler struct{}

// NewAnimationHandler 创建动画处理器
func NewAnimationHandler() *AnimationHandler {
	return &AnimationHandler{}
}

type arkMediaURL struct {
	URL string `json:"url"`
}

type arkGenerationContentItem struct {
	Type     string       `json:"type"`
	Text     string       `json:"text,omitempty"`
	ImageURL *arkMediaURL `json:"image_url,omitempty"`
	VideoURL *arkMediaURL `json:"video_url,omitempty"`
	AudioURL *arkMediaURL `json:"audio_url,omitempty"`
	Role     string       `json:"role,omitempty"`
}

type arkGenerationRequest struct {
	Model         string                     `json:"model"`
	Content       []arkGenerationContentItem `json:"content"`
	GenerateAudio bool                       `json:"generate_audio"`
	Ratio         string                     `json:"ratio"`
	Duration      int                        `json:"duration"`
	Watermark     bool                       `json:"watermark"`
}

type arkTaskCreateResponse struct {
	ID      string `json:"id"`
	Error   any    `json:"error"`
	Message string `json:"message"`
}

type arkTaskStatusResponse struct {
	ID        string `json:"id"`
	Model     string `json:"model"`
	Status    string `json:"status"`
	Error     any    `json:"error"`
	Message   string `json:"message"`
	LastError any    `json:"last_error"`
	Content   struct {
		VideoURL string `json:"video_url"`
	} `json:"content"`
}

type resolvedAnimationReferenceAsset struct {
	Source    string
	Name      string
	MimeType  string
	SignedURL string
}

func (h *AnimationHandler) findOwnedFile(db *gorm.DB, userID uint, key string) (*models.File, error) {
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

func (h *AnimationHandler) buildSignedFileURL(file *models.File) (string, error) {
	ossClient := oss.GetClient()
	if ossClient == nil {
		return "", fmt.Errorf("file service not configured")
	}

	return ossClient.GetSignedURL(file.Key, 3600)
}

func (h *AnimationHandler) resolveReferenceURLs(db *gorm.DB, userID uint, rawItems []string) ([]string, error) {
	urls := make([]string, 0, len(rawItems))
	for _, raw := range rawItems {
		normalized := strings.TrimSpace(raw)
		if normalized == "" {
			continue
		}
		if strings.HasPrefix(normalized, "http://") || strings.HasPrefix(normalized, "https://") {
			urls = append(urls, normalized)
			continue
		}

		file, err := h.findOwnedFile(db, userID, normalized)
		if err != nil {
			return nil, err
		}
		signedURL, err := h.buildSignedFileURL(file)
		if err != nil {
			return nil, err
		}
		urls = append(urls, signedURL)
	}
	return urls, nil
}

func buildAssetNameFromSource(source string, fallback string) string {
	trimmed := strings.TrimSpace(source)
	if trimmed == "" {
		return fallback
	}
	if parsed, err := url.Parse(trimmed); err == nil && parsed.Path != "" {
		if base := path.Base(parsed.Path); base != "." && base != "/" && base != "" {
			return base
		}
	}
	if base := path.Base(trimmed); base != "." && base != "/" && base != "" {
		return base
	}
	return fallback
}

func (h *AnimationHandler) resolveReferenceAssets(
	db *gorm.DB,
	userID uint,
	rawItems []string,
	fallbackPrefix string,
) ([]resolvedAnimationReferenceAsset, error) {
	assets := make([]resolvedAnimationReferenceAsset, 0, len(rawItems))
	for idx, raw := range rawItems {
		normalized := strings.TrimSpace(raw)
		if normalized == "" {
			continue
		}
		if strings.HasPrefix(normalized, "http://") || strings.HasPrefix(normalized, "https://") {
			assets = append(assets, resolvedAnimationReferenceAsset{
				Source:    normalized,
				Name:      buildAssetNameFromSource(normalized, fmt.Sprintf("%s %d", fallbackPrefix, idx+1)),
				SignedURL: normalized,
			})
			continue
		}

		file, err := h.findOwnedFile(db, userID, normalized)
		if err != nil {
			return nil, err
		}
		signedURL, err := h.buildSignedFileURL(file)
		if err != nil {
			return nil, err
		}
		assets = append(assets, resolvedAnimationReferenceAsset{
			Source:    normalized,
			Name:      strings.TrimSpace(file.OriginalName),
			MimeType:  strings.TrimSpace(file.MimeType),
			SignedURL: signedURL,
		})
	}
	return assets, nil
}

func (h *AnimationHandler) buildArkTaskURL(taskID string) string {
	baseURL := strings.TrimRight(strings.TrimSpace(config.Cfg.Ark.APIBaseURL), "/")
	if taskID == "" {
		return baseURL + arkTaskCreatePath
	}
	return baseURL + arkTaskCreatePath + "/" + taskID
}

func (h *AnimationHandler) buildArkRequest(ctx context.Context, method string, endpoint string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(config.Cfg.Ark.APIKey))
	return req, nil
}

func (h *AnimationHandler) parseArkErrorResponse(resp *http.Response) string {
	raw, _ := io.ReadAll(resp.Body)
	message := strings.TrimSpace(string(raw))
	if message == "" {
		return ""
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err == nil {
		for _, key := range []string{"message", "error", "detail"} {
			if next := stringifyAny(payload[key]); next != "" {
				return next
			}
		}
	}

	return message
}

func (h *AnimationHandler) fetchArkTaskStatus(ctx context.Context, client *http.Client, taskID string) (*arkTaskStatusResponse, error) {
	endpoint := h.buildArkTaskURL(taskID)
	req, err := h.buildArkRequest(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= http.StatusBadRequest {
		message := h.parseArkErrorResponse(resp)
		resp.Body.Close()
		if message == "" {
			message = "Failed to query Ark task status"
		}
		return nil, errors.New(message)
	}

	var payload arkTaskStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		resp.Body.Close()
		return nil, fmt.Errorf("failed to decode Ark task status: %w", err)
	}
	resp.Body.Close()

	return &payload, nil
}

func stringifyAny(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	default:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return strings.TrimSpace(fmt.Sprint(typed))
		}
		return strings.TrimSpace(string(encoded))
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func pickVideoExtension(contentType string, sourceURL string) string {
	if exts, err := mime.ExtensionsByType(contentType); err == nil {
		for _, ext := range exts {
			if ext != "" {
				return ext
			}
		}
	}

	if parsed, err := url.Parse(sourceURL); err == nil {
		if ext := path.Ext(parsed.Path); ext != "" {
			return ext
		}
	}

	return ".mp4"
}

func encodeStringSlice(values []string) string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			filtered = append(filtered, trimmed)
		}
	}
	if len(filtered) == 0 {
		return "[]"
	}
	encoded, err := json.Marshal(filtered)
	if err != nil {
		return "[]"
	}
	return string(encoded)
}

func decodeStringSlice(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []string{}
	}
	var values []string
	if err := json.Unmarshal([]byte(trimmed), &values); err != nil {
		return []string{}
	}
	return values
}

func encodeReferenceAssets(values []models.AnimationTaskReferenceAsset) string {
	if len(values) == 0 {
		return "[]"
	}
	encoded, err := json.Marshal(values)
	if err != nil {
		return "[]"
	}
	return string(encoded)
}

func decodeReferenceAssets(raw string) []models.AnimationTaskReferenceAsset {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []models.AnimationTaskReferenceAsset{}
	}
	var values []models.AnimationTaskReferenceAsset
	if err := json.Unmarshal([]byte(trimmed), &values); err != nil {
		return []models.AnimationTaskReferenceAsset{}
	}
	return values
}

func hydrateAnimationTask(task *models.SceneAnimationGenerationTask) {
	if task == nil {
		return
	}
	task.ReferenceImageAssets = decodeReferenceAssets(task.ReferenceImageAssetsJSON)
	task.ReferenceAudioAssets = decodeReferenceAssets(task.ReferenceAudioAssetsJSON)
	task.ReferenceVideoAssets = decodeReferenceAssets(task.ReferenceVideoAssetsJSON)

	if len(task.ReferenceImageAssets) > 0 {
		task.ReferenceImageKeys = make([]string, 0, len(task.ReferenceImageAssets))
		for _, item := range task.ReferenceImageAssets {
			if strings.TrimSpace(item.Source) != "" {
				task.ReferenceImageKeys = append(task.ReferenceImageKeys, item.Source)
			}
		}
	} else {
		task.ReferenceImageKeys = decodeStringSlice(task.ReferenceImageKeysJSON)
	}

	if len(task.ReferenceAudioAssets) > 0 {
		task.ReferenceAudioKeys = make([]string, 0, len(task.ReferenceAudioAssets))
		for _, item := range task.ReferenceAudioAssets {
			if strings.TrimSpace(item.Source) != "" {
				task.ReferenceAudioKeys = append(task.ReferenceAudioKeys, item.Source)
			}
		}
	} else {
		task.ReferenceAudioKeys = decodeStringSlice(task.ReferenceAudioKeysJSON)
	}

	if len(task.ReferenceVideoAssets) > 0 {
		task.ReferenceVideoKeys = make([]string, 0, len(task.ReferenceVideoAssets))
		for _, item := range task.ReferenceVideoAssets {
			if strings.TrimSpace(item.Source) != "" {
				task.ReferenceVideoKeys = append(task.ReferenceVideoKeys, item.Source)
			}
		}
	} else {
		task.ReferenceVideoKeys = decodeStringSlice(task.ReferenceVideoKeysJSON)
	}
}

func hydrateAnimationTasks(tasks []models.SceneAnimationGenerationTask) {
	for idx := range tasks {
		hydrateAnimationTask(&tasks[idx])
	}
}

func mapArkStatusToAnimationTaskStatus(status string) models.AnimationTaskStatus {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "succeeded":
		return models.AnimationTaskStatusSucceeded
	case "failed", "canceled", "cancelled", "expired":
		return models.AnimationTaskStatusFailed
	case "submitted", "queued", "pending":
		return models.AnimationTaskStatusPending
	default:
		return models.AnimationTaskStatusProcessing
	}
}

func (h *AnimationHandler) getSceneAndAnimation(db *gorm.DB, sceneID string, animationID string) (*models.Scene, *models.SceneAnimation, error) {
	var scene models.Scene
	if err := db.First(&scene, sceneID).Error; err != nil {
		return nil, nil, fmt.Errorf("scene")
	}

	var animation models.SceneAnimation
	if err := db.Where("id = ? AND scene_id = ?", animationID, scene.ID).First(&animation).Error; err != nil {
		return &scene, nil, fmt.Errorf("animation")
	}

	return &scene, &animation, nil
}

func (h *AnimationHandler) saveAnimationVersion(
	db *gorm.DB,
	task *models.SceneAnimationGenerationTask,
	scene *models.Scene,
	animation *models.SceneAnimation,
	currentUser *models.User,
	userID uint,
	sourceVideoURL string,
) error {
	if task.OutputVersion > 0 && strings.TrimSpace(task.ResultVideoUrl) != "" {
		return nil
	}

	httpClient := &http.Client{Timeout: animationVersionDownloadTimeout}
	downloadReq, err := http.NewRequestWithContext(context.Background(), http.MethodGet, sourceVideoURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create generated video download request")
	}
	downloadResp, err := httpClient.Do(downloadReq)
	if err != nil {
		return fmt.Errorf("failed to download generated video")
	}
	defer downloadResp.Body.Close()

	if downloadResp.StatusCode >= http.StatusBadRequest {
		message := strings.TrimSpace(h.parseArkErrorResponse(downloadResp))
		if message == "" {
			message = "Failed to download generated video"
		}
		return errors.New(message)
	}

	videoBytes, err := io.ReadAll(downloadResp.Body)
	if err != nil {
		return fmt.Errorf("failed to read generated video")
	}
	if len(videoBytes) == 0 {
		return fmt.Errorf("generated video is empty")
	}

	var maxVersion int
	db.Model(&models.SceneAnimationVersion{}).
		Where("scene_animation_id = ?", animation.ID).
		Select("COALESCE(MAX(version), 0)").
		Scan(&maxVersion)

	newVersion := maxVersion + 1
	contentType := strings.TrimSpace(downloadResp.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = "video/mp4"
	}
	fileName := fmt.Sprintf(
		"scene-%d-animation-%d-v%d%s",
		scene.ID,
		animation.ID,
		newVersion,
		pickVideoExtension(contentType, sourceVideoURL),
	)
	objectKey, contentBytes, err := oss.GenerateKeyFromContent(bytes.NewReader(videoBytes), fileName)
	if err != nil {
		return fmt.Errorf("failed to process generated video")
	}

	ossClient := oss.GetClient()
	exists, err := ossClient.Exists(objectKey)
	if err != nil {
		return fmt.Errorf("failed to check generated video file")
	}
	if !exists {
		if err := ossClient.UploadBytes(objectKey, contentBytes, contentType); err != nil {
			return fmt.Errorf("failed to store generated video")
		}
	}

	fileRecord := models.File{
		Key:          objectKey,
		OriginalName: fileName,
		Size:         int64(len(contentBytes)),
		MimeType:     contentType,
		UploaderID:   currentUser.ID,
		Visibility:   models.FileVisibilityPrivate,
	}

	version := models.SceneAnimationVersion{
		SceneAnimationID: animation.ID,
		GenerationTaskID: &task.ID,
		VideoUrl:         objectKey,
		Version:          newVersion,
		CreatedBy:        userID,
	}

	now := time.Now()
	tx := db.Begin()
	var lockedTask models.SceneAnimationGenerationTask
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&lockedTask, task.ID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to lock generation task")
	}
	if lockedTask.OutputVersion > 0 && strings.TrimSpace(lockedTask.ResultVideoUrl) != "" {
		tx.Rollback()
		task.ResultVideoUrl = lockedTask.ResultVideoUrl
		task.OutputVersion = lockedTask.OutputVersion
		task.CompletedAt = lockedTask.CompletedAt
		task.ErrorMessage = lockedTask.ErrorMessage
		animation.AnimationUrl = lockedTask.ResultVideoUrl
		animation.AnimationVersion = lockedTask.OutputVersion
		return nil
	}
	if err := tx.Create(&fileRecord).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to save generated video file")
	}
	if err := tx.Create(&version).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to create generated video version")
	}
	if err := tx.Model(animation).Updates(map[string]any{
		"animation_url":     objectKey,
		"animation_version": newVersion,
	}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to update animation")
	}
	if err := tx.Model(task).Updates(map[string]any{
		"result_video_url": objectKey,
		"output_version":   newVersion,
		"completed_at":     &now,
		"error_message":    "",
	}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to update generation task result")
	}
	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("failed to finalize generated video version")
	}

	task.ResultVideoUrl = objectKey
	task.OutputVersion = newVersion
	task.CompletedAt = &now
	task.ErrorMessage = ""
	animation.AnimationUrl = objectKey
	animation.AnimationVersion = newVersion
	return nil
}

func (h *AnimationHandler) applyRemoteGenerationTaskStatus(
	db *gorm.DB,
	task *models.SceneAnimationGenerationTask,
	remoteStatus *arkTaskStatusResponse,
) error {
	if task == nil || remoteStatus == nil {
		return nil
	}

	now := time.Now()
	nextStatus := mapArkStatusToAnimationTaskStatus(remoteStatus.Status)
	updates := map[string]any{
		"status":         nextStatus,
		"last_polled_at": &now,
	}
	if actualModel := strings.TrimSpace(remoteStatus.Model); actualModel != "" {
		updates["actual_model"] = actualModel
	}

	switch nextStatus {
	case models.AnimationTaskStatusFailed:
		message := firstNonEmpty(remoteStatus.Message, stringifyAny(remoteStatus.LastError), stringifyAny(remoteStatus.Error), "Ark video generation failed")
		updates["error_message"] = message
		updates["completed_at"] = &now
	case models.AnimationTaskStatusSucceeded:
		if strings.TrimSpace(remoteStatus.Content.VideoURL) == "" {
			updates["status"] = models.AnimationTaskStatusFailed
			updates["error_message"] = "Ark task succeeded but returned empty video URL"
			updates["completed_at"] = &now
			break
		}

		var scene models.Scene
		if err := db.First(&scene, task.SceneID).Error; err != nil {
			return fmt.Errorf("failed to load generation task scene")
		}

		var animation models.SceneAnimation
		if err := db.Where("id = ? AND scene_id = ?", task.SceneAnimationID, task.SceneID).First(&animation).Error; err != nil {
			return fmt.Errorf("failed to load generation task animation")
		}

		var creator models.User
		if err := db.First(&creator, task.CreatedBy).Error; err != nil {
			return fmt.Errorf("failed to load generation task creator")
		}

		if err := h.saveAnimationVersion(db, task, &scene, &animation, &creator, task.CreatedBy, remoteStatus.Content.VideoURL); err != nil {
			retryUpdates := map[string]any{
				"status":         models.AnimationTaskStatusProcessing,
				"last_polled_at": &now,
				"error_message":  err.Error(),
			}
			if actualModel := strings.TrimSpace(remoteStatus.Model); actualModel != "" {
				retryUpdates["actual_model"] = actualModel
			}
			if err := db.Model(task).Updates(retryUpdates).Error; err != nil {
				return fmt.Errorf("failed to update generation task retry state")
			}
			task.Status = models.AnimationTaskStatusProcessing
			task.LastPolledAt = &now
			task.ErrorMessage = err.Error()
			if actualModel := strings.TrimSpace(remoteStatus.Model); actualModel != "" {
				task.ActualModel = actualModel
			}
			return nil
		}

		updates["status"] = models.AnimationTaskStatusSucceeded
		updates["error_message"] = ""
		updates["completed_at"] = task.CompletedAt
	default:
		updates["error_message"] = ""
	}

	if err := db.Model(task).Updates(updates).Error; err != nil {
		return fmt.Errorf("failed to update generation task")
	}

	if err := db.First(task, task.ID).Error; err != nil {
		return fmt.Errorf("failed to reload generation task")
	}

	return nil
}

func (h *AnimationHandler) pollGenerationTaskOnce(
	ctx context.Context,
	db *gorm.DB,
	httpClient *http.Client,
	task *models.SceneAnimationGenerationTask,
) error {
	if task == nil {
		return nil
	}
	if task.Status == models.AnimationTaskStatusSucceeded || task.Status == models.AnimationTaskStatusFailed {
		return nil
	}
	if strings.TrimSpace(task.ArkTaskID) == "" {
		return nil
	}

	remoteStatus, err := h.fetchArkTaskStatus(ctx, httpClient, task.ArkTaskID)
	if err != nil {
		return err
	}

	return h.applyRemoteGenerationTaskStatus(db, task, remoteStatus)
}

func (h *AnimationHandler) pollPendingGenerationTasksOnce(ctx context.Context) {
	if !animationTaskPollerRunning.CompareAndSwap(false, true) {
		return
	}
	defer animationTaskPollerRunning.Store(false)

	db := database.GetDB()
	if db == nil {
		return
	}

	httpClient := &http.Client{Timeout: animationTaskPollRequestTimeout}
	var lastTaskID uint

	for {
		var tasks []models.SceneAnimationGenerationTask
		query := db.Where("status IN ?", []models.AnimationTaskStatus{
			models.AnimationTaskStatusPending,
			models.AnimationTaskStatusProcessing,
		})
		if lastTaskID > 0 {
			query = query.Where("id > ?", lastTaskID)
		}
		if err := query.
			Order("id ASC").
			Order("updated_at ASC").
			Limit(animationTaskPollBatchSize).
			Find(&tasks).Error; err != nil {
			log.Printf("animation task poller: failed to query pending tasks: %v", err)
			return
		}

		if len(tasks) == 0 {
			return
		}

		for idx := range tasks {
			task := &tasks[idx]
			if err := h.pollGenerationTaskOnce(ctx, db, httpClient, task); err != nil {
				log.Printf("animation task poller: failed to poll task %d (ark=%s): %v", task.ID, task.ArkTaskID, err)
			}
		}
		lastTaskID = tasks[len(tasks)-1].ID

		if len(tasks) < animationTaskPollBatchSize {
			return
		}
	}
}

func (h *AnimationHandler) StartGenerationTaskPoller(ctx context.Context) {
	if strings.TrimSpace(config.Cfg.Ark.APIKey) == "" {
		log.Println("animation task poller disabled: Ark video generation service is not configured")
		return
	}
	if oss.GetClient() == nil {
		log.Println("animation task poller disabled: file service is not configured")
		return
	}

	log.Printf("animation task poller started, interval=%s", animationTaskPollInterval)

	go func() {
		h.pollPendingGenerationTasksOnce(ctx)

		ticker := time.NewTicker(animationTaskPollInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Println("animation task poller stopped")
				return
			case <-ticker.C:
				h.pollPendingGenerationTasksOnce(ctx)
			}
		}
	}()
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

	if err := tx.Where("scene_animation_id = ?", animation.ID).Delete(&models.SceneAnimationGenerationTask{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete animation generation tasks",
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

// ListGenerationTasks 获取动画生成任务列表
func (h *AnimationHandler) ListGenerationTasks(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")

	db := database.GetDB()
	scene, animation, err := h.getSceneAndAnimation(db, sceneId, animationId)
	if err != nil {
		if err.Error() == "scene" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Scene not found"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "Animation not found"})
		return
	}

	var tasks []models.SceneAnimationGenerationTask
	if err := db.Where("scene_id = ? AND scene_animation_id = ?", scene.ID, animation.ID).
		Order("created_at DESC").
		Find(&tasks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch generation tasks"})
		return
	}

	hydrateAnimationTasks(tasks)
	c.JSON(http.StatusOK, models.SceneAnimationGenerationTaskListResponse{
		Total: int64(len(tasks)),
		Data:  tasks,
	})
}

// GetGenerationTask 获取单个动画生成任务
func (h *AnimationHandler) GetGenerationTask(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")
	taskId := c.Param("taskId")

	db := database.GetDB()
	scene, animation, err := h.getSceneAndAnimation(db, sceneId, animationId)
	if err != nil {
		if err.Error() == "scene" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Scene not found"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "Animation not found"})
		return
	}

	var task models.SceneAnimationGenerationTask
	if err := db.Where("id = ? AND scene_id = ? AND scene_animation_id = ?", taskId, scene.ID, animation.ID).
		First(&task).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Generation task not found"})
		return
	}

	hydrateAnimationTask(&task)
	c.JSON(http.StatusOK, task)
}

// CreateGenerationTask 创建动画生成任务
func (h *AnimationHandler) CreateGenerationTask(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")

	userIDValue, userIDExists := c.Get("userId")
	if !userIDExists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	userID := userIDValue.(uint)

	if strings.TrimSpace(config.Cfg.Ark.APIKey) == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Ark video generation service is not configured"})
		return
	}
	if oss.GetClient() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "File service is not configured"})
		return
	}

	db := database.GetDB()
	scene, animation, err := h.getSceneAndAnimation(db, sceneId, animationId)
	if err != nil {
		if err.Error() == "scene" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Scene not found"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "Animation not found"})
		return
	}

	var req models.GenerateSceneAnimationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
		return
	}
	if _, ok := allowedAnimationRatios[req.Ratio]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ratio must be one of: 16:9, 9:16"})
		return
	}
	if req.Duration < 5 || req.Duration > 15 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "duration must be between 5 and 15 seconds"})
		return
	}
	if _, ok := allowedAnimationModels[req.Model]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "model is not supported"})
		return
	}

	referenceImageAssets, err := h.resolveReferenceAssets(db, userID, req.ReferenceImageKeys, "图片参考")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Reference image not found"})
		return
	}
	referenceAudioAssets, err := h.resolveReferenceAssets(db, userID, req.ReferenceAudioKeys, "音频参考")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Reference audio not found"})
		return
	}
	referenceVideoAssets, err := h.resolveReferenceAssets(db, userID, req.ReferenceVideoKeys, "视频参考")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Reference video not found"})
		return
	}

	imageTaskAssets := make([]models.AnimationTaskReferenceAsset, 0, len(referenceImageAssets))
	for _, item := range referenceImageAssets {
		imageTaskAssets = append(imageTaskAssets, models.AnimationTaskReferenceAsset{
			Source:   item.Source,
			Name:     item.Name,
			MimeType: item.MimeType,
		})
	}
	audioTaskAssets := make([]models.AnimationTaskReferenceAsset, 0, len(referenceAudioAssets))
	for _, item := range referenceAudioAssets {
		audioTaskAssets = append(audioTaskAssets, models.AnimationTaskReferenceAsset{
			Source:   item.Source,
			Name:     item.Name,
			MimeType: item.MimeType,
		})
	}
	videoTaskAssets := make([]models.AnimationTaskReferenceAsset, 0, len(referenceVideoAssets))
	for _, item := range referenceVideoAssets {
		videoTaskAssets = append(videoTaskAssets, models.AnimationTaskReferenceAsset{
			Source:   item.Source,
			Name:     item.Name,
			MimeType: item.MimeType,
		})
	}

	task := models.SceneAnimationGenerationTask{
		SceneID:                  scene.ID,
		SceneAnimationID:         animation.ID,
		Status:                   models.AnimationTaskStatusPending,
		Text:                     text,
		Ratio:                    req.Ratio,
		Duration:                 req.Duration,
		Model:                    req.Model,
		ReferenceImageKeysJSON:   encodeStringSlice(req.ReferenceImageKeys),
		ReferenceAudioKeysJSON:   encodeStringSlice(req.ReferenceAudioKeys),
		ReferenceVideoKeysJSON:   encodeStringSlice(req.ReferenceVideoKeys),
		ReferenceImageAssetsJSON: encodeReferenceAssets(imageTaskAssets),
		ReferenceAudioAssetsJSON: encodeReferenceAssets(audioTaskAssets),
		ReferenceVideoAssetsJSON: encodeReferenceAssets(videoTaskAssets),
		CreatedBy:                userID,
	}
	if err := db.Create(&task).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create generation task"})
		return
	}

	content := []arkGenerationContentItem{{
		Type: "text",
		Text: text,
	}}
	for _, item := range referenceImageAssets {
		content = append(content, arkGenerationContentItem{
			Type:     "image_url",
			ImageURL: &arkMediaURL{URL: item.SignedURL},
			Role:     "reference_image",
		})
	}
	for _, item := range referenceVideoAssets {
		content = append(content, arkGenerationContentItem{
			Type:     "video_url",
			VideoURL: &arkMediaURL{URL: item.SignedURL},
			Role:     "reference_video",
		})
	}
	for _, item := range referenceAudioAssets {
		content = append(content, arkGenerationContentItem{
			Type:     "audio_url",
			AudioURL: &arkMediaURL{URL: item.SignedURL},
			Role:     "reference_audio",
		})
	}

	arkReqBody, err := json.Marshal(arkGenerationRequest{
		Model:         req.Model,
		Content:       content,
		GenerateAudio: true,
		Ratio:         req.Ratio,
		Duration:      req.Duration,
		Watermark:     false,
	})
	if err != nil {
		now := time.Now()
		db.Model(&task).Updates(map[string]any{
			"status":        models.AnimationTaskStatusFailed,
			"error_message": "Failed to encode Ark request",
			"completed_at":  &now,
		})
		task.Status = models.AnimationTaskStatusFailed
		task.ErrorMessage = "Failed to encode Ark request"
		task.CompletedAt = &now
		hydrateAnimationTask(&task)
		c.JSON(http.StatusCreated, task)
		return
	}

	httpClient := &http.Client{Timeout: 2 * time.Minute}
	createReq, err := h.buildArkRequest(c.Request.Context(), http.MethodPost, h.buildArkTaskURL(""), bytes.NewReader(arkReqBody))
	if err != nil {
		now := time.Now()
		db.Model(&task).Updates(map[string]any{
			"status":        models.AnimationTaskStatusFailed,
			"error_message": "Failed to create Ark request",
			"completed_at":  &now,
		})
		task.Status = models.AnimationTaskStatusFailed
		task.ErrorMessage = "Failed to create Ark request"
		task.CompletedAt = &now
		hydrateAnimationTask(&task)
		c.JSON(http.StatusCreated, task)
		return
	}

	createResp, err := httpClient.Do(createReq)
	if err != nil {
		now := time.Now()
		db.Model(&task).Updates(map[string]any{
			"status":        models.AnimationTaskStatusFailed,
			"error_message": "Ark video generation service is unavailable",
			"completed_at":  &now,
		})
		task.Status = models.AnimationTaskStatusFailed
		task.ErrorMessage = "Ark video generation service is unavailable"
		task.CompletedAt = &now
		hydrateAnimationTask(&task)
		c.JSON(http.StatusCreated, task)
		return
	}
	defer createResp.Body.Close()

	if createResp.StatusCode >= http.StatusBadRequest {
		message := h.parseArkErrorResponse(createResp)
		if message == "" {
			message = "Ark video generation request failed"
		}
		now := time.Now()
		db.Model(&task).Updates(map[string]any{
			"status":        models.AnimationTaskStatusFailed,
			"error_message": message,
			"completed_at":  &now,
		})
		task.Status = models.AnimationTaskStatusFailed
		task.ErrorMessage = message
		task.CompletedAt = &now
		hydrateAnimationTask(&task)
		c.JSON(http.StatusCreated, task)
		return
	}

	var taskResp arkTaskCreateResponse
	if err := json.NewDecoder(createResp.Body).Decode(&taskResp); err != nil {
		now := time.Now()
		db.Model(&task).Updates(map[string]any{
			"status":        models.AnimationTaskStatusFailed,
			"error_message": "Failed to decode Ark task response",
			"completed_at":  &now,
		})
		task.Status = models.AnimationTaskStatusFailed
		task.ErrorMessage = "Failed to decode Ark task response"
		task.CompletedAt = &now
		hydrateAnimationTask(&task)
		c.JSON(http.StatusCreated, task)
		return
	}

	arkTaskID := strings.TrimSpace(taskResp.ID)
	if arkTaskID == "" {
		message := firstNonEmpty(taskResp.Message, stringifyAny(taskResp.Error), "Ark task ID is empty")
		now := time.Now()
		db.Model(&task).Updates(map[string]any{
			"status":        models.AnimationTaskStatusFailed,
			"error_message": message,
			"completed_at":  &now,
		})
		task.Status = models.AnimationTaskStatusFailed
		task.ErrorMessage = message
		task.CompletedAt = &now
		hydrateAnimationTask(&task)
		c.JSON(http.StatusCreated, task)
		return
	}

	if err := db.Model(&task).Updates(map[string]any{
		"ark_task_id":   arkTaskID,
		"status":        models.AnimationTaskStatusProcessing,
		"error_message": "",
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update generation task"})
		return
	}

	task.ArkTaskID = arkTaskID
	task.Status = models.AnimationTaskStatusProcessing
	task.ErrorMessage = ""
	hydrateAnimationTask(&task)
	c.JSON(http.StatusCreated, task)
}

// PollGenerationTask 轮询动画生成任务状态
func (h *AnimationHandler) PollGenerationTask(c *gin.Context) {
	sceneId := c.Param("sceneId")
	animationId := c.Param("animationId")
	taskId := c.Param("taskId")

	if _, userIDExists := c.Get("userId"); !userIDExists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	if strings.TrimSpace(config.Cfg.Ark.APIKey) == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Ark video generation service is not configured"})
		return
	}
	if oss.GetClient() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "File service is not configured"})
		return
	}

	db := database.GetDB()
	scene, animation, err := h.getSceneAndAnimation(db, sceneId, animationId)
	if err != nil {
		if err.Error() == "scene" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Scene not found"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "Animation not found"})
		return
	}

	var task models.SceneAnimationGenerationTask
	if err := db.Where("id = ? AND scene_id = ? AND scene_animation_id = ?", taskId, scene.ID, animation.ID).
		First(&task).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Generation task not found"})
		return
	}

	if task.Status == models.AnimationTaskStatusSucceeded || task.Status == models.AnimationTaskStatusFailed {
		hydrateAnimationTask(&task)
		c.JSON(http.StatusOK, task)
		return
	}
	if strings.TrimSpace(task.ArkTaskID) == "" {
		hydrateAnimationTask(&task)
		c.JSON(http.StatusOK, task)
		return
	}

	httpClient := &http.Client{Timeout: animationTaskPollRequestTimeout}
	remoteStatus, err := h.fetchArkTaskStatus(c.Request.Context(), httpClient, task.ArkTaskID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	if err := h.applyRemoteGenerationTaskStatus(db, &task, remoteStatus); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	hydrateAnimationTask(&task)
	c.JSON(http.StatusOK, task)
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
