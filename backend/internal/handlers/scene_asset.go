package handlers

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var sceneAssetCodePattern = regexp.MustCompile(`^S[1-9][0-9]*$`)
var errSceneAssetCodeTaken = errors.New("场景编号已存在")

// SceneAssetHandler 场景资产处理器
type SceneAssetHandler struct{}

// NewSceneAssetHandler 创建场景资产处理器
func NewSceneAssetHandler() *SceneAssetHandler {
	return &SceneAssetHandler{}
}

func normalizeSceneAssetCode(code string) string {
	return strings.ToUpper(strings.TrimSpace(code))
}

func validSceneAssetCode(code string) bool {
	return sceneAssetCodePattern.MatchString(code)
}

func (h *SceneAssetHandler) List(c *gin.Context) {
	bookId := c.Param("bookId")
	bookIdUint, err := strconv.ParseUint(bookId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid book ID"})
		return
	}

	db := database.GetDB()
	var book models.Book
	if err := db.First(&book, bookIdUint).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Book not found"})
		return
	}

	var assets []models.SceneAsset
	if err := db.Where("book_id = ?", bookIdUint).Order("`index` ASC, id ASC").Find(&assets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch scene assets"})
		return
	}

	c.JSON(http.StatusOK, models.SceneAssetListResponse{
		Total: int64(len(assets)),
		Data:  assets,
	})
}

func (h *SceneAssetHandler) Create(c *gin.Context) {
	bookId := c.Param("bookId")
	bookIdUint, err := strconv.ParseUint(bookId, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid book ID"})
		return
	}

	db := database.GetDB()
	var book models.Book
	if err := db.First(&book, bookIdUint).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Book not found"})
		return
	}

	var req models.CreateSceneAssetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "场景名字不能为空"})
		return
	}

	req.Code = normalizeSceneAssetCode(req.Code)
	if !validSceneAssetCode(req.Code) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "场景编号必须为 S1、S2 等格式"})
		return
	}

	var count int64
	if err := db.Model(&models.SceneAsset{}).Where("book_id = ? AND code = ?", bookIdUint, req.Code).Count(&count).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create scene asset"})
		return
	}
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": errSceneAssetCodeTaken.Error()})
		return
	}

	if req.Index == 0 {
		var maxIndex float64
		if err := db.Model(&models.SceneAsset{}).Where("book_id = ?", bookIdUint).Select("COALESCE(MAX(`index`), 0)").Scan(&maxIndex).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create scene asset"})
			return
		}
		req.Index = maxIndex + 1
	}

	asset := models.SceneAsset{
		BookID:             uint(bookIdUint),
		Name:               req.Name,
		Code:               req.Code,
		Description:        req.Description,
		ReferenceImageUrls: req.ReferenceImageUrls,
		Index:              req.Index,
	}
	if asset.ReferenceImageUrls == nil {
		asset.ReferenceImageUrls = []string{}
	}

	if err := db.Create(&asset).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create scene asset"})
		return
	}

	c.JSON(http.StatusCreated, asset)
}

func (h *SceneAssetHandler) GetByID(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("sceneAssetId")

	db := database.GetDB()
	var asset models.SceneAsset
	if err := db.Where("book_id = ?", bookId).First(&asset, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Scene asset not found"})
		return
	}

	c.JSON(http.StatusOK, asset)
}

func (h *SceneAssetHandler) Update(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("sceneAssetId")

	db := database.GetDB()
	var asset models.SceneAsset
	if err := db.Where("book_id = ?", bookId).First(&asset, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Scene asset not found"})
		return
	}

	var req models.UpdateSceneAssetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "场景名字不能为空"})
			return
		}
		asset.Name = name
	}
	if req.Code != nil {
		code := normalizeSceneAssetCode(*req.Code)
		if !validSceneAssetCode(code) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "场景编号必须为 S1、S2 等格式"})
			return
		}
		var count int64
		if err := db.Model(&models.SceneAsset{}).Where("book_id = ? AND code = ? AND id <> ?", bookId, code, asset.ID).Count(&count).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update scene asset"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": errSceneAssetCodeTaken.Error()})
			return
		}
		asset.Code = code
	}
	if req.Description != nil {
		asset.Description = *req.Description
	}
	if req.ReferenceImageUrls != nil {
		asset.ReferenceImageUrls = *req.ReferenceImageUrls
		if asset.ReferenceImageUrls == nil {
			asset.ReferenceImageUrls = []string{}
		}
	}
	if req.Index != nil {
		asset.Index = *req.Index
	}

	if err := db.Save(&asset).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update scene asset"})
		return
	}

	c.JSON(http.StatusOK, asset)
}

func (h *SceneAssetHandler) Delete(c *gin.Context) {
	bookId := c.Param("bookId")
	id := c.Param("sceneAssetId")
	idUint, err := strconv.ParseUint(id, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene asset ID"})
		return
	}

	db := database.GetDB()
	var asset models.SceneAsset
	if err := db.Where("book_id = ?", bookId).First(&asset, idUint).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Scene asset not found"})
		return
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Scene{}).Where("scene_asset_id = ?", asset.ID).Update("scene_asset_id", nil).Error; err != nil {
			return err
		}
		return tx.Delete(&asset).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete scene asset"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Scene asset deleted successfully"})
}
