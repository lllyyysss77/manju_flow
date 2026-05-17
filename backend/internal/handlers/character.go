package handlers

import (
	"net/http"
	"strconv"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// CharacterHandler 角色人设处理器
type CharacterHandler struct{}

// NewCharacterHandler 创建角色处理器
func NewCharacterHandler() *CharacterHandler {
	return &CharacterHandler{}
}

// CharacterListResponse 角色列表响应
type CharacterListResponse struct {
	Total int64              `json:"total"`
	Data  []models.Character `json:"data"`
}

// List 获取角色列表
// @Summary 获取角色列表
// @Description 获取指定书籍的所有角色人设，按 index 排序
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Success 200 {object} CharacterListResponse
// @Router /api/books/{bookId}/characters [get]
func (h *CharacterHandler) List(c *gin.Context) {
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

	// 获取角色列表
	var characters []models.Character
	if err := db.Where("book_id = ?", bookId).Order("`index` ASC").Find(&characters).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch characters",
		})
		return
	}

	c.JSON(http.StatusOK, CharacterListResponse{
		Total: int64(len(characters)),
		Data:  characters,
	})
}

// Create 创建角色
// @Summary 创建新角色
// @Description 为指定书籍创建新角色人设
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param character body models.CreateCharacterRequest true "角色信息"
// @Success 201 {object} models.Character
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/characters [post]
func (h *CharacterHandler) Create(c *gin.Context) {
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

	var req models.CreateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	character := models.Character{
		BookID:                uint(bookIdUint),
		Name:                  req.Name,
		Description:           req.Description,
		ReferenceImageUrl:     req.ReferenceImageUrl,
		HalfBodyFrontImageUrl: req.HalfBodyFrontImageUrl,
		FullBodyFrontImageUrl: req.FullBodyFrontImageUrl,
		FullBodySideImageUrl:  req.FullBodySideImageUrl,
		FullBodyBackImageUrl:  req.FullBodyBackImageUrl,
		VoiceAudioUrl:         req.VoiceAudioUrl,
		Index:                 req.Index,
	}

	if err := db.Create(&character).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create character",
		})
		return
	}

	c.JSON(http.StatusCreated, character)
}

// GetByID 根据ID获取角色详情
// @Summary 获取角色详情
// @Description 根据ID获取角色的详细信息
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "角色ID"
// @Success 200 {object} models.Character
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/characters/{id} [get]
func (h *CharacterHandler) GetByID(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("characterId")

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	var character models.Character
	if err := db.Where("book_id = ?", bookId).First(&character, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Character not found",
		})
		return
	}

	c.JSON(http.StatusOK, character)
}

// Update 更新角色信息
// @Summary 更新角色
// @Description 更新角色的信息
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "角色ID"
// @Param character body models.UpdateCharacterRequest true "角色信息"
// @Success 200 {object} models.Character
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/characters/{id} [put]
func (h *CharacterHandler) Update(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("characterId")

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	var character models.Character
	if err := db.Where("book_id = ?", bookId).First(&character, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Character not found",
		})
		return
	}

	var req models.UpdateCharacterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 部分更新
	if req.Name != nil {
		character.Name = *req.Name
	}
	if req.Description != nil {
		character.Description = *req.Description
	}
	if req.ReferenceImageUrl != nil {
		character.ReferenceImageUrl = *req.ReferenceImageUrl
	}
	if req.HalfBodyFrontImageUrl != nil {
		character.HalfBodyFrontImageUrl = *req.HalfBodyFrontImageUrl
	}
	if req.FullBodyFrontImageUrl != nil {
		character.FullBodyFrontImageUrl = *req.FullBodyFrontImageUrl
	}
	if req.FullBodySideImageUrl != nil {
		character.FullBodySideImageUrl = *req.FullBodySideImageUrl
	}
	if req.FullBodyBackImageUrl != nil {
		character.FullBodyBackImageUrl = *req.FullBodyBackImageUrl
	}
	if req.VoiceAudioUrl != nil {
		character.VoiceAudioUrl = *req.VoiceAudioUrl
	}
	if req.Index != nil {
		character.Index = *req.Index
	}

	if err := db.Save(&character).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update character",
		})
		return
	}

	c.JSON(http.StatusOK, character)
}

// Delete 删除角色
// @Summary 删除角色
// @Description 删除角色（软删除）
// @Tags characters
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param id path int true "角色ID"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/characters/{id} [delete]
func (h *CharacterHandler) Delete(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("characterId")

	db := database.GetDB()

	// 检查书籍是否存在
	var book models.Book
	if err := db.First(&book, bookId).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Book not found",
		})
		return
	}

	// 删除角色
	result := db.Where("book_id = ?", bookId).Delete(&models.Character{}, id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete character",
		})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Character not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Character deleted successfully",
	})
}
