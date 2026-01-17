package handlers

import (
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// BookHandler 书籍处理器
type BookHandler struct{}

// NewBookHandler 创建书籍处理器
func NewBookHandler() *BookHandler {
	return &BookHandler{}
}

// List 获取书籍列表
// @Summary 获取书籍列表
// @Description 获取书库中的所有小说和漫画，支持分页和类型过滤
// @Tags books
// @Accept json
// @Produce json
// @Param page query int false "页码" default(1)
// @Param size query int false "每页数量" default(10)
// @Param type query string false "书籍类型 (NOVEL/COMIC)"
// @Param keyword query string false "搜索关键词（标题或作者）"
// @Success 200 {object} models.BookListResponse
// @Router /api/books [get]
func (h *BookHandler) List(c *gin.Context) {
	db := database.GetDB()

	// 分页参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "10"))
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 10
	}
	offset := (page - 1) * size

	// 过滤参数
	bookType := c.Query("type")
	keyword := c.Query("keyword")

	// 构建查询
	query := db.Model(&models.Book{})

	// 类型过滤
	if bookType != "" && (bookType == string(models.BookTypeNovel) || bookType == string(models.BookTypeComic)) {
		query = query.Where("type = ?", bookType)
	}

	// 关键词搜索（标题或作者）
	if keyword != "" {
		query = query.Where("title LIKE ? OR author LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	// 获取总数
	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to count books",
		})
		return
	}

	// 获取数据
	var books []models.Book
	if err := query.Order("created_at DESC").Offset(offset).Limit(size).Find(&books).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch books",
		})
		return
	}

	c.JSON(http.StatusOK, models.BookListResponse{
		Total: total,
		Page:  page,
		Size:  size,
		Data:  books,
	})
}

// Create 创建书籍
// @Summary 创建新书籍
// @Description 向书库中添加新的小说或漫画
// @Tags books
// @Accept json
// @Produce json
// @Param book body models.CreateBookRequest true "书籍信息"
// @Success 201 {object} models.Book
// @Failure 400 {object} map[string]string
// @Router /api/books [post]
func (h *BookHandler) Create(c *gin.Context) {
	var req models.CreateBookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	book := models.Book{
		Title:            req.Title,
		Author:           req.Author,
		Cover:            req.Cover,
		Type:             req.Type,
		Description:      req.Description,
		AdaptationStatus: models.AdaptationStatusNone,
	}

	db := database.GetDB()
	if err := db.Create(&book).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create book",
		})
		return
	}

	c.JSON(http.StatusCreated, book)
}

// GetByID 根据ID获取书籍详情
// @Summary 获取书籍详情
// @Description 根据ID获取书籍的详细信息
// @Tags books
// @Accept json
// @Produce json
// @Param id path int true "书籍ID"
// @Success 200 {object} models.Book
// @Failure 404 {object} map[string]string
// @Router /api/books/{id} [get]
func (h *BookHandler) GetByID(c *gin.Context) {
	id := c.Param("bookId")

	var book models.Book
	db := database.GetDB()
	if err := db.First(&book, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	c.JSON(http.StatusOK, book)
}

// Update 更新书籍信息
// @Summary 更新书籍
// @Description 更新书籍的信息
// @Tags books
// @Accept json
// @Produce json
// @Param id path int true "书籍ID"
// @Param book body models.CreateBookRequest true "书籍信息"
// @Success 200 {object} models.Book
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{id} [put]
func (h *BookHandler) Update(c *gin.Context) {
	id := c.Param("bookId")

	var book models.Book
	db := database.GetDB()
	if err := db.First(&book, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	var req models.CreateBookRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	book.Title = req.Title
	book.Author = req.Author
	book.Cover = req.Cover
	book.Type = req.Type
	book.Description = req.Description

	if err := db.Save(&book).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update book",
		})
		return
	}

	c.JSON(http.StatusOK, book)
}

// Delete 删除书籍
// @Summary 删除书籍
// @Description 从书库中删除书籍（软删除）
// @Tags books
// @Accept json
// @Produce json
// @Param id path int true "书籍ID"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{id} [delete]
func (h *BookHandler) Delete(c *gin.Context) {
	id := c.Param("bookId")

	db := database.GetDB()
	result := db.Delete(&models.Book{}, id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete book",
		})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Book deleted successfully",
	})
}

// UpdateOutline 更新书籍大纲
// @Summary 更新书籍大纲
// @Description 单独更新书籍的故事大纲
// @Tags books
// @Accept json
// @Produce json
// @Param id path int true "书籍ID"
// @Param outline body models.UpdateOutlineRequest true "大纲内容"
// @Success 200 {object} models.Book
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{id}/outline [put]
func (h *BookHandler) UpdateOutline(c *gin.Context) {
	id := c.Param("bookId")

	var book models.Book
	db := database.GetDB()
	if err := db.First(&book, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	var req models.UpdateOutlineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	book.Outline = req.Outline

	if err := db.Save(&book).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update outline",
		})
		return
	}

	c.JSON(http.StatusOK, book)
}
