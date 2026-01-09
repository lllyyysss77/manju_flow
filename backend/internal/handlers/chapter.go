package handlers

import (
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ChapterHandler 章节处理器
type ChapterHandler struct{}

// NewChapterHandler 创建章节处理器
func NewChapterHandler() *ChapterHandler {
	return &ChapterHandler{}
}

// List 获取章节列表
// @Summary 获取章节列表
// @Description 获取指定书籍的所有章节，按 index 排序
// @Tags chapters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param includeScenes query bool false "是否包含场景" default(false)
// @Success 200 {object} models.ChapterListResponse
// @Router /api/books/{bookId}/chapters [get]
func (h *ChapterHandler) List(c *gin.Context) {
	bookId := c.Param("bookId")

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	// 是否包含场景
	includeScenes := c.Query("includeScenes") == "true"

	// 获取章节
	var chapters []models.Chapter
	query := db.Where("book_id = ?", bookId).Order("`index` ASC")

	if includeScenes {
		query = query.Preload("Scenes", func(db *gorm.DB) *gorm.DB {
			return db.Order("`index` ASC")
		})
	}

	if err := query.Find(&chapters).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch chapters",
		})
		return
	}

	c.JSON(http.StatusOK, models.ChapterListResponse{
		Total: int64(len(chapters)),
		Data:  chapters,
	})
}

// Create 创建章节
// @Summary 创建新章节
// @Description 为指定书籍创建新章节
// @Tags chapters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param chapter body models.CreateChapterRequest true "章节信息"
// @Success 201 {object} models.Chapter
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/chapters [post]
func (h *ChapterHandler) Create(c *gin.Context) {
	bookId := c.Param("bookId")
	bookIdUint, err := strconv.ParseUint(bookId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid book ID",
		})
		return
	}

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	var req models.CreateChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	status := req.Status
	if status == "" {
		status = models.ChapterStatusDraft
	}

	chapter := models.Chapter{
		BookID: uint(bookIdUint),
		Title:  req.Title,
		Index:  req.Index,
		Status: status,
	}

	if err := db.Create(&chapter).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create chapter",
		})
		return
	}

	// 更新书籍的章节数
	db.Model(&book).Update("chapter_count", book.ChapterCount+1)

	c.JSON(http.StatusCreated, chapter)
}

// GetByID 根据ID获取章节详情
// @Summary 获取章节详情
// @Description 根据ID获取章节的详细信息
// @Tags chapters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "章节ID"
// @Param includeScenes query bool false "是否包含场景" default(false)
// @Success 200 {object} models.Chapter
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/chapters/{id} [get]
func (h *ChapterHandler) GetByID(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("id")

	db := database.GetDB()

	// 是否包含场景
	includeScenes := c.Query("includeScenes") == "true"

	var chapter models.Chapter
	query := db.Where("book_id = ?", bookId)

	if includeScenes {
		query = query.Preload("Scenes", func(db *gorm.DB) *gorm.DB {
			return db.Order("`index` ASC")
		})
	}

	if err := query.First(&chapter, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	c.JSON(http.StatusOK, chapter)
}

// Update 更新章节信息
// @Summary 更新章节
// @Description 更新章节的信息
// @Tags chapters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "章节ID"
// @Param chapter body models.UpdateChapterRequest true "章节信息"
// @Success 200 {object} models.Chapter
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/chapters/{id} [put]
func (h *ChapterHandler) Update(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("id")

	db := database.GetDB()

	var chapter models.Chapter
	if err := db.Where("book_id = ?", bookId).First(&chapter, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	var req models.UpdateChapterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 部分更新
	if req.Title != nil {
		chapter.Title = *req.Title
	}
	if req.Index != nil {
		chapter.Index = *req.Index
	}
	if req.Status != nil {
		chapter.Status = *req.Status
	}

	if err := db.Save(&chapter).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update chapter",
		})
		return
	}

	c.JSON(http.StatusOK, chapter)
}

// Delete 删除章节
// @Summary 删除章节
// @Description 删除章节（软删除），同时删除关联的场景
// @Tags chapters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "章节ID"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/chapters/{id} [delete]
func (h *ChapterHandler) Delete(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("id")

	db := database.GetDB()

	// 检查章节是否存在
	var chapter models.Chapter
	if err := db.Where("book_id = ?", bookId).First(&chapter, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Chapter not found",
		})
		return
	}

	// 开启事务
	tx := db.Begin()

	// 删除关联的场景
	if err := tx.Where("chapter_id = ?", id).Delete(&models.Scene{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete scenes",
		})
		return
	}

	// 删除章节
	if err := tx.Delete(&chapter).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete chapter",
		})
		return
	}

	// 更新书籍的章节数
	if err := tx.Model(&models.Book{}).Where("id = ?", bookId).
		UpdateColumn("chapter_count", database.GetDB().Raw("chapter_count - 1")).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update book chapter count",
		})
		return
	}

	tx.Commit()

	c.JSON(http.StatusOK, gin.H{
		"message": "Chapter deleted successfully",
	})
}
