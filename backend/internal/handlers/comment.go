package handlers

import (
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// CommentHandler 评论处理器
type CommentHandler struct{}

// NewCommentHandler 创建评论处理器
func NewCommentHandler() *CommentHandler {
	return &CommentHandler{}
}

// ListSceneComments 获取场景评论列表
// @Summary 获取场景评论
// @Description 获取指定场景在指定模块的评论列表
// @Tags comments
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param module query string true "模块" Enums(script, storyboard, animation, audio)
// @Success 200 {object} models.CommentListResponse
// @Router /api/scenes/{sceneId}/comments [get]
func (h *CommentHandler) ListSceneComments(c *gin.Context) {
	sceneId := c.Param("sceneId")
	module := c.Query("module")

	// 验证模块参数
	if !isValidSceneModule(module) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid module, must be one of: script, storyboard, animation, audio",
		})
		return
	}

	db := database.GetDB()

	// 验证场景存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	// 获取评论并预加载用户
	var comments []models.Comment
	if err := db.Where("target_type = ? AND target_id = ? AND module = ?",
		models.CommentTargetScene, sceneId, module).
		Preload("User").
		Order("created_at DESC").
		Find(&comments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch comments",
		})
		return
	}

	c.JSON(http.StatusOK, models.CommentListResponse{
		Total: int64(len(comments)),
		Data:  comments,
	})
}

// CreateSceneComment 创建场景评论
// @Summary 创建场景评论
// @Description 为指定场景在指定模块创建评论
// @Tags comments
// @Accept json
// @Produce json
// @Param sceneId path int true "场景ID"
// @Param module query string true "模块" Enums(script, storyboard, animation, audio)
// @Param comment body models.CreateCommentRequest true "评论信息"
// @Success 201 {object} models.Comment
// @Router /api/scenes/{sceneId}/comments [post]
func (h *CommentHandler) CreateSceneComment(c *gin.Context) {
	sceneId := c.Param("sceneId")
	module := c.Query("module")

	// 验证模块参数
	if !isValidSceneModule(module) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid module, must be one of: script, storyboard, animation, audio",
		})
		return
	}

	sceneIdUint, err := strconv.ParseUint(sceneId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid scene ID",
		})
		return
	}

	db := database.GetDB()

	// 验证场景存在
	var scene models.Scene
	if err := db.First(&scene, sceneId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Scene not found",
		})
		return
	}

	var req models.CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 获取当前用户
	userID := c.GetUint("userID")

	comment := models.Comment{
		Content:    req.Content,
		TargetType: models.CommentTargetScene,
		TargetID:   uint(sceneIdUint),
		Module:     models.CommentModule(module),
		UserID:     userID,
		Meta:       req.Meta,
	}

	if err := db.Create(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create comment",
		})
		return
	}

	// 重新加载以获取用户信息
	db.Preload("User").First(&comment, comment.ID)

	c.JSON(http.StatusCreated, comment)
}

// ListChapterComments 获取章节评论列表（审核交付模块）
// @Summary 获取章节评论
// @Description 获取指定章节在审核交付模块的评论列表
// @Tags comments
// @Accept json
// @Produce json
// @Param chapterId path int true "章节ID"
// @Success 200 {object} models.CommentListResponse
// @Router /api/chapters/{chapterId}/comments [get]
func (h *CommentHandler) ListChapterComments(c *gin.Context) {
	chapterId := c.Param("chapterId")

	db := database.GetDB()

	// 验证章节存在
	var chapter models.Chapter
	if err := db.First(&chapter, chapterId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	// 获取评论并预加载用户
	var comments []models.Comment
	if err := db.Where("target_type = ? AND target_id = ? AND module = ?",
		models.CommentTargetChapter, chapterId, models.CommentModuleReview).
		Preload("User").
		Order("created_at DESC").
		Find(&comments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch comments",
		})
		return
	}

	c.JSON(http.StatusOK, models.CommentListResponse{
		Total: int64(len(comments)),
		Data:  comments,
	})
}

// CreateChapterComment 创建章节评论（审核交付模块）
// @Summary 创建章节评论
// @Description 为指定章节在审核交付模块创建评论
// @Tags comments
// @Accept json
// @Produce json
// @Param chapterId path int true "章节ID"
// @Param comment body models.CreateCommentRequest true "评论信息"
// @Success 201 {object} models.Comment
// @Router /api/chapters/{chapterId}/comments [post]
func (h *CommentHandler) CreateChapterComment(c *gin.Context) {
	chapterId := c.Param("chapterId")

	chapterIdUint, err := strconv.ParseUint(chapterId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid chapter ID",
		})
		return
	}

	db := database.GetDB()

	// 验证章节存在
	var chapter models.Chapter
	if err := db.First(&chapter, chapterId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	var req models.CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 获取当前用户
	userID := c.GetUint("userID")

	comment := models.Comment{
		Content:    req.Content,
		TargetType: models.CommentTargetChapter,
		TargetID:   uint(chapterIdUint),
		Module:     models.CommentModuleReview,
		UserID:     userID,
		Meta:       req.Meta, // 可包含 timecode 信息: {"timecode": "3:56", "seconds": 236}
	}

	if err := db.Create(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create comment",
		})
		return
	}

	// 重新加载以获取用户信息
	db.Preload("User").First(&comment, comment.ID)

	c.JSON(http.StatusCreated, comment)
}

// Update 更新评论
// @Summary 更新评论
// @Description 更新评论内容（仅评论作者可操作）
// @Tags comments
// @Accept json
// @Produce json
// @Param id path int true "评论ID"
// @Param comment body models.UpdateCommentRequest true "评论信息"
// @Success 200 {object} models.Comment
// @Router /api/comments/{id} [put]
func (h *CommentHandler) Update(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetUint("userID")

	db := database.GetDB()

	var comment models.Comment
	if err := db.First(&comment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Comment not found",
		})
		return
	}

	// 检查权限：只有评论作者可以更新
	if comment.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "You can only edit your own comments",
		})
		return
	}

	var req models.UpdateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 部分更新
	if req.Content != nil {
		comment.Content = *req.Content
	}
	if req.Meta != nil {
		comment.Meta = *req.Meta
	}

	if err := db.Save(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update comment",
		})
		return
	}

	// 重新加载以获取用户信息
	db.Preload("User").First(&comment, comment.ID)

	c.JSON(http.StatusOK, comment)
}

// Delete 删除评论
// @Summary 删除评论
// @Description 删除评论（仅评论作者可操作）
// @Tags comments
// @Accept json
// @Produce json
// @Param id path int true "评论ID"
// @Success 200 {object} map[string]string
// @Router /api/comments/{id} [delete]
func (h *CommentHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetUint("userID")

	db := database.GetDB()

	var comment models.Comment
	if err := db.First(&comment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Comment not found",
		})
		return
	}

	// 检查权限：只有评论作者可以删除
	if comment.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "You can only delete your own comments",
		})
		return
	}

	// 删除评论
	if err := db.Delete(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete comment",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Comment deleted successfully",
	})
}

// GetByID 获取单个评论详情
// @Summary 获取评论详情
// @Description 根据ID获取评论详情
// @Tags comments
// @Accept json
// @Produce json
// @Param id path int true "评论ID"
// @Success 200 {object} models.Comment
// @Router /api/comments/{id} [get]
func (h *CommentHandler) GetByID(c *gin.Context) {
	id := c.Param("id")

	db := database.GetDB()

	var comment models.Comment
	if err := db.Preload("User").First(&comment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Comment not found",
		})
		return
	}

	c.JSON(http.StatusOK, comment)
}

// isValidSceneModule 验证场景评论模块是否有效
func isValidSceneModule(module string) bool {
	switch models.CommentModule(module) {
	case models.CommentModuleScript,
		models.CommentModuleStoryboard,
		models.CommentModuleAnimation,
		models.CommentModuleAudio:
		return true
	default:
		return false
	}
}
