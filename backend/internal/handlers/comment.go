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
	userID := c.GetUint("userId")

	comment := models.Comment{
		Content:    req.Content,
		TargetType: models.CommentTargetScene,
		TargetID:   uint(sceneIdUint),
		Module:     models.CommentModule(module),
		UserID:     userID,
		Meta:       req.Meta,
		Status:     models.CommentStatusUnresolved,
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
	userID := c.GetUint("userId")

	comment := models.Comment{
		Content:    req.Content,
		TargetType: models.CommentTargetChapter,
		TargetID:   uint(chapterIdUint),
		Module:     models.CommentModuleReview,
		UserID:     userID,
		Meta:       req.Meta, // 可包含 timecode 信息: {"timecode": "3:56", "seconds": 236}
		Status:     models.CommentStatusUnresolved,
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
	userID := c.GetUint("userId")

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
	if req.Status != nil {
		comment.Status = *req.Status
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
	userID := c.GetUint("userId")

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

// GetSceneCommentCounts 批量获取书籍下所有场景的评论数
// @Summary 获取场景评论数
// @Description 批量获取指定书籍下所有场景在指定模块的评论数量
// @Tags comments
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param module query string true "模块" Enums(script, storyboard, animation, audio)
// @Success 200 {object} map[string]interface{}
// @Router /api/books/{bookId}/scenes/comment-counts [get]
func (h *CommentHandler) GetSceneCommentCounts(c *gin.Context) {
	bookId := c.Param("bookId")
	module := c.Query("module")

	// 验证模块参数
	if !isValidSceneModule(module) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid module, must be one of: script, storyboard, animation, audio",
		})
		return
	}

	db := database.GetDB()

	// 验证书籍存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	// 获取该书籍下所有场景的评论数
	// 使用子查询获取场景ID，然后统计评论数
	type CountResult struct {
		TargetID uint  `json:"targetId"`
		Count    int64 `json:"count"`
	}

	var results []CountResult
	err := db.Model(&models.Comment{}).
		Select("target_id, COUNT(*) as count").
		Where("target_type = ? AND module = ?", models.CommentTargetScene, module).
		Where("target_id IN (?)",
			db.Model(&models.Scene{}).
				Select("scenes.id").
				Joins("JOIN chapters ON chapters.id = scenes.chapter_id").
				Where("chapters.book_id = ?", bookId).
				Where("chapters.deleted_at IS NULL").
				Where("scenes.deleted_at IS NULL"),
		).
		Group("target_id").
		Find(&results).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch comment counts",
		})
		return
	}

	// 转换为 map 格式
	counts := make(map[uint]int64)
	for _, r := range results {
		counts[r.TargetID] = r.Count
	}

	c.JSON(http.StatusOK, gin.H{
		"data": counts,
	})
}

// GetChapterCommentCounts 批量获取书籍下所有章节的评论数（审核交付）
// @Summary 获取章节评论数
// @Description 批量获取指定书籍下所有章节在审核交付模块的评论数量
// @Tags comments
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Success 200 {object} map[string]interface{}
// @Router /api/books/{bookId}/chapters/comment-counts [get]
func (h *CommentHandler) GetChapterCommentCounts(c *gin.Context) {
	bookId := c.Param("bookId")

	db := database.GetDB()

	// 验证书籍存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	// 获取该书籍下所有章节的评论数
	type CountResult struct {
		TargetID uint  `json:"targetId"`
		Count    int64 `json:"count"`
	}

	var results []CountResult
	err := db.Model(&models.Comment{}).
		Select("target_id, COUNT(*) as count").
		Where("target_type = ? AND module = ?", models.CommentTargetChapter, models.CommentModuleReview).
		Where("target_id IN (?)",
			db.Model(&models.Chapter{}).
				Select("id").
				Where("book_id = ?", bookId).
				Where("deleted_at IS NULL"),
		).
		Group("target_id").
		Find(&results).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch comment counts",
		})
		return
	}

	// 转换为 map 格式
	counts := make(map[uint]int64)
	for _, r := range results {
		counts[r.TargetID] = r.Count
	}

	c.JSON(http.StatusOK, gin.H{
		"data": counts,
	})
}

// Resolve 标记评论为已解决
// @Summary 标记评论为已解决
// @Description 将评论状态标记为已解决（任何登录用户均可操作）
// @Tags comments
// @Accept json
// @Produce json
// @Param id path int true "评论ID"
// @Success 200 {object} models.Comment
// @Router /api/comments/{id}/resolve [put]
func (h *CommentHandler) Resolve(c *gin.Context) {
	id := c.Param("id")

	db := database.GetDB()

	var comment models.Comment
	if err := db.First(&comment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Comment not found",
		})
		return
	}

	// 更新状态为已解决
	comment.Status = models.CommentStatusResolved

	if err := db.Save(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to resolve comment",
		})
		return
	}

	// 重新加载以获取用户信息
	db.Preload("User").First(&comment, comment.ID)

	c.JSON(http.StatusOK, comment)
}

// Unresolve 标记评论为未解决
// @Summary 标记评论为未解决
// @Description 将评论状态标记为未解决（任何登录用户均可操作）
// @Tags comments
// @Accept json
// @Produce json
// @Param id path int true "评论ID"
// @Success 200 {object} models.Comment
// @Router /api/comments/{id}/unresolve [put]
func (h *CommentHandler) Unresolve(c *gin.Context) {
	id := c.Param("id")

	db := database.GetDB()

	var comment models.Comment
	if err := db.First(&comment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Comment not found",
		})
		return
	}

	// 更新状态为未解决
	comment.Status = models.CommentStatusUnresolved

	if err := db.Save(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to unresolve comment",
		})
		return
	}

	// 重新加载以获取用户信息
	db.Preload("User").First(&comment, comment.ID)

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
