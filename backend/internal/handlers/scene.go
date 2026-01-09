package handlers

import (
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// SceneHandler 场景处理器
type SceneHandler struct{}

// NewSceneHandler 创建场景处理器
func NewSceneHandler() *SceneHandler {
	return &SceneHandler{}
}

// List 获取场景列表
// @Summary 获取场景列表
// @Description 获取指定章节的所有场景，按 index 排序
// @Tags scenes
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param chapterId path int true "章节ID"
// @Success 200 {object} models.SceneListResponse
// @Router /api/books/{bookId}/chapters/{chapterId}/scenes [get]
func (h *SceneHandler) List(c *gin.Context) {
	bookId := c.Param("bookId")
	chapterId := c.Param("chapterId")

	db := database.GetDB()

	// 检查章节是否存在
	var chapter models.Chapter
	if err := db.Where("book_id = ?", bookId).First(&chapter, chapterId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	// 获取场景
	var scenes []models.Scene
	if err := db.Where("chapter_id = ?", chapterId).Order("`index` ASC").Find(&scenes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch scenes",
		})
		return
	}

	c.JSON(http.StatusOK, models.SceneListResponse{
		Total: int64(len(scenes)),
		Data:  scenes,
	})
}

// Create 创建场景
// @Summary 创建新场景
// @Description 为指定章节创建新场景
// @Tags scenes
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param chapterId path int true "章节ID"
// @Param scene body models.CreateSceneRequest true "场景信息"
// @Success 201 {object} models.Scene
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/chapters/{chapterId}/scenes [post]
func (h *SceneHandler) Create(c *gin.Context) {
	bookId := c.Param("bookId")
	chapterId := c.Param("chapterId")
	chapterIdUint, err := strconv.ParseUint(chapterId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid chapter ID",
		})
		return
	}

	db := database.GetDB()

	// 检查章节是否存在
	var chapter models.Chapter
	if err := db.Where("book_id = ?", bookId).First(&chapter, chapterId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	var req models.CreateSceneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	status := req.Status
	if status == "" {
		status = models.SceneStatusDraft
	}

	scene := models.Scene{
		ChapterID:      uint(chapterIdUint),
		Index:          req.Index,
		Status:         status,
		Description:    req.Description,
		CameraMovement: req.CameraMovement,
		Dialogue:       req.Dialogue,
	}

	if err := db.Create(&scene).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create scene",
		})
		return
	}

	c.JSON(http.StatusCreated, scene)
}

// GetByID 根据ID获取场景详情
// @Summary 获取场景详情
// @Description 根据ID获取场景的详细信息
// @Tags scenes
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param chapterId path int true "章节ID"
// @Param id path int true "场景ID"
// @Success 200 {object} models.Scene
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/chapters/{chapterId}/scenes/{id} [get]
func (h *SceneHandler) GetByID(c *gin.Context) {
	bookId := c.Param("bookId")
	chapterId := c.Param("chapterId")
	id := c.Param("sceneId")

	db := database.GetDB()

	// 检查章节是否存在
	var chapter models.Chapter
	if err := db.Where("book_id = ?", bookId).First(&chapter, chapterId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	var scene models.Scene
	if err := db.Where("chapter_id = ?", chapterId).First(&scene, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	c.JSON(http.StatusOK, scene)
}

// Update 更新场景信息
// @Summary 更新场景
// @Description 更新场景的信息
// @Tags scenes
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param chapterId path int true "章节ID"
// @Param id path int true "场景ID"
// @Param scene body models.UpdateSceneRequest true "场景信息"
// @Success 200 {object} models.Scene
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/chapters/{chapterId}/scenes/{id} [put]
func (h *SceneHandler) Update(c *gin.Context) {
	bookId := c.Param("bookId")
	chapterId := c.Param("chapterId")
	id := c.Param("sceneId")

	db := database.GetDB()

	// 检查章节是否存在
	var chapter models.Chapter
	if err := db.Where("book_id = ?", bookId).First(&chapter, chapterId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	var scene models.Scene
	if err := db.Where("chapter_id = ?", chapterId).First(&scene, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var req models.UpdateSceneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 部分更新
	if req.Index != nil {
		scene.Index = *req.Index
	}
	if req.Status != nil {
		scene.Status = *req.Status
	}
	if req.Description != nil {
		scene.Description = *req.Description
	}
	if req.CameraMovement != nil {
		scene.CameraMovement = *req.CameraMovement
	}
	if req.Dialogue != nil {
		scene.Dialogue = *req.Dialogue
	}

	if err := db.Save(&scene).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update scene",
		})
		return
	}

	c.JSON(http.StatusOK, scene)
}

// Delete 删除场景
// @Summary 删除场景
// @Description 删除场景（软删除）
// @Tags scenes
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param chapterId path int true "章节ID"
// @Param id path int true "场景ID"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/chapters/{chapterId}/scenes/{id} [delete]
func (h *SceneHandler) Delete(c *gin.Context) {
	bookId := c.Param("bookId")
	chapterId := c.Param("chapterId")
	id := c.Param("sceneId")

	db := database.GetDB()

	// 检查章节是否存在
	var chapter models.Chapter
	if err := db.Where("book_id = ?", bookId).First(&chapter, chapterId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	// 删除场景
	result := db.Where("chapter_id = ?", chapterId).Delete(&models.Scene{}, id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete scene",
		})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Scene deleted successfully",
	})
}
