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
	"github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

var (
	sceneAssetCodePattern    = regexp.MustCompile(`^S[1-9][0-9]*$`)
	errSceneAssetCodeTaken   = errors.New("场景编号已存在")
	errInvalidSceneAssetCode = errors.New("invalid scene asset code")
	errSceneAssetNotFound    = errors.New("scene asset not found")
)

const sceneAssetNameMaxLength = 100

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

func validSceneAssetName(name string) bool {
	return name != "" && len([]rune(name)) <= sceneAssetNameMaxLength
}

func isDuplicateSceneAssetError(err error) bool {
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	var mysqlErr *mysql.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == 1062
}

func isSceneAssetBindingError(err error) bool {
	var mysqlErr *mysql.MySQLError
	if errors.As(err, &mysqlErr) {
		return mysqlErr.Number == 1452
	}
	return strings.Contains(strings.ToLower(err.Error()), "foreign key")
}

func parseUintParam(value string) (uint, error) {
	parsed, err := strconv.ParseUint(value, 10, 32)
	return uint(parsed), err
}

func respondSceneAssetError(c *gin.Context, err error, action string) bool {
	if err == nil {
		return false
	}
	if isDuplicateSceneAssetError(err) {
		c.JSON(http.StatusConflict, gin.H{"error": errSceneAssetCodeTaken.Error()})
		return true
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to " + action + " scene asset"})
	return true
}

// List 获取场景资产列表
// @Summary 获取场景资产列表
// @Description 按排序获取指定书籍的场景资产
// @Tags scene-assets
// @Param bookId path int true "书籍ID"
// @Success 200 {object} models.SceneAssetListResponse
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/scene-assets [get]
func (h *SceneAssetHandler) List(c *gin.Context) {
	bookIdUint, err := parseUintParam(c.Param("bookId"))
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

// Create 创建场景资产
// @Summary 创建场景资产
// @Description 为指定书籍创建场景资产，同书籍内编号唯一
// @Tags scene-assets
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param asset body models.CreateSceneAssetRequest true "场景资产"
// @Success 201 {object} models.SceneAsset
// @Failure 400 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /api/books/{bookId}/scene-assets [post]
func (h *SceneAssetHandler) Create(c *gin.Context) {
	bookIdUint, err := parseUintParam(c.Param("bookId"))
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
	if !validSceneAssetName(req.Name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "场景名字不能为空且不能超过 100 个字符"})
		return
	}

	req.Code = normalizeSceneAssetCode(req.Code)
	if !validSceneAssetCode(req.Code) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "场景编号必须为 S1、S2 等格式"})
		return
	}
	if req.Index < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "场景排序不能为负数"})
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
		BookID:             bookIdUint,
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
		respondSceneAssetError(c, err, "create")
		return
	}

	c.JSON(http.StatusCreated, asset)
}

// GetByID 获取场景资产详情
// @Summary 获取场景资产详情
// @Description 根据ID获取指定书籍的场景资产
// @Tags scene-assets
// @Param bookId path int true "书籍ID"
// @Param sceneAssetId path int true "场景资产ID"
// @Success 200 {object} models.SceneAsset
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/scene-assets/{sceneAssetId} [get]
func (h *SceneAssetHandler) GetByID(c *gin.Context) {
	bookIdUint, err := parseUintParam(c.Param("bookId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid book ID"})
		return
	}
	idUint, err := parseUintParam(c.Param("sceneAssetId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene asset ID"})
		return
	}

	db := database.GetDB()
	var asset models.SceneAsset
	if err := db.Where("book_id = ?", bookIdUint).First(&asset, idUint).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Scene asset not found"})
		return
	}

	c.JSON(http.StatusOK, asset)
}

// Update 更新场景资产
// @Summary 更新场景资产
// @Description 更新指定书籍的场景资产；修改编号时级联更新已绑定分镜
// @Tags scene-assets
// @Accept json
// @Produce json
// @Param bookId path int true "书籍ID"
// @Param sceneAssetId path int true "场景资产ID"
// @Param asset body models.UpdateSceneAssetRequest true "场景资产"
// @Success 200 {object} models.SceneAsset
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /api/books/{bookId}/scene-assets/{sceneAssetId} [put]
func (h *SceneAssetHandler) Update(c *gin.Context) {
	bookIdUint, err := parseUintParam(c.Param("bookId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid book ID"})
		return
	}
	idUint, err := parseUintParam(c.Param("sceneAssetId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene asset ID"})
		return
	}

	db := database.GetDB()
	var asset models.SceneAsset
	if err := db.Where("book_id = ?", bookIdUint).First(&asset, idUint).Error; err != nil {
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
		if !validSceneAssetName(name) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "场景名字不能为空且不能超过 100 个字符"})
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
		if err := db.Model(&models.SceneAsset{}).Where("book_id = ? AND code = ? AND id <> ?", bookIdUint, code, asset.ID).Count(&count).Error; err != nil {
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
		if *req.Index < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "场景排序不能为负数"})
			return
		}
		asset.Index = *req.Index
	}

	if err := db.Save(&asset).Error; err != nil {
		respondSceneAssetError(c, err, "update")
		return
	}

	c.JSON(http.StatusOK, asset)
}

// Delete 删除场景资产
// @Summary 删除场景资产
// @Description 硬删除指定场景资产，并通过数据库外键清空已绑定分镜
// @Tags scene-assets
// @Param bookId path int true "书籍ID"
// @Param sceneAssetId path int true "场景资产ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/books/{bookId}/scene-assets/{sceneAssetId} [delete]
func (h *SceneAssetHandler) Delete(c *gin.Context) {
	bookIdUint, err := parseUintParam(c.Param("bookId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid book ID"})
		return
	}
	idUint, err := parseUintParam(c.Param("sceneAssetId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scene asset ID"})
		return
	}

	db := database.GetDB()
	var asset models.SceneAsset
	if err := db.Where("book_id = ?", bookIdUint).First(&asset, idUint).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Scene asset not found"})
		return
	}

	err = db.Delete(&asset).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete scene asset"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Scene asset deleted successfully"})
}
