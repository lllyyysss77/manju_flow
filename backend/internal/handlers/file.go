package handlers

import (
	"net/http"
	"strings"

	"manju-flow/internal/database"
	"manju-flow/internal/models"
	"manju-flow/internal/oss"

	"github.com/gin-gonic/gin"
)

// FileHandler 文件处理器
type FileHandler struct{}

// NewFileHandler 创建文件处理器
func NewFileHandler() *FileHandler {
	return &FileHandler{}
}

// Upload 上传文件
// POST /api/files
func (h *FileHandler) Upload(c *gin.Context) {
	// 检查 OSS 是否配置
	if !oss.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "文件服务未配置",
		})
		return
	}

	// 获取当前用户
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "用户未认证",
		})
		return
	}
	currentUser := user.(*models.User)

	// 获取上传的文件
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "请选择要上传的文件",
		})
		return
	}
	defer file.Close()

	// 获取可见性参数
	visibility := models.FileVisibility(c.DefaultPostForm("visibility", "private"))
	if visibility != models.FileVisibilityPublic && visibility != models.FileVisibilityPrivate {
		visibility = models.FileVisibilityPrivate
	}

	// 生成唯一的对象键
	key := oss.GenerateKey(header.Filename)

	// 获取 MIME 类型
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// 上传到 OSS
	ossClient := oss.GetClient()
	if err := ossClient.Upload(key, file, contentType); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "文件上传失败: " + err.Error(),
		})
		return
	}

	// 保存文件记录到数据库
	fileRecord := &models.File{
		Key:          key,
		OriginalName: header.Filename,
		Size:         header.Size,
		MimeType:     contentType,
		UploaderID:   currentUser.ID,
		Visibility:   visibility,
	}

	if err := database.GetDB().Create(fileRecord).Error; err != nil {
		// 如果数据库保存失败，删除已上传的文件
		ossClient.Delete(key)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "保存文件记录失败: " + err.Error(),
		})
		return
	}

	// 获取请求的基础 URL
	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	baseURL := scheme + "://" + c.Request.Host

	c.JSON(http.StatusCreated, fileRecord.ToResponse(baseURL))
}

// Get 获取文件
// GET /api/files/*key
func (h *FileHandler) Get(c *gin.Context) {
	// 检查 OSS 是否配置
	if !oss.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "文件服务未配置",
		})
		return
	}

	// 获取文件键（去掉开头的斜杠）
	key := c.Param("key")
	key = strings.TrimPrefix(key, "/")

	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "文件键不能为空",
		})
		return
	}

	// 查询文件记录
	var fileRecord models.File
	if err := database.GetDB().Where("`key` = ?", key).First(&fileRecord).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "文件不存在",
		})
		return
	}

	// 检查权限
	if fileRecord.Visibility == models.FileVisibilityPrivate {
		// 获取当前用户
		user, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "需要登录才能访问此文件",
			})
			return
		}
		currentUser := user.(*models.User)

		// 检查是否是上传者
		if currentUser.ID != fileRecord.UploaderID {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "没有权限访问此文件",
			})
			return
		}
	}

	// 生成签名 URL（有效期 1 小时）
	ossClient := oss.GetClient()
	signedURL, err := ossClient.GetSignedURL(key, 3600)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "生成访问链接失败: " + err.Error(),
		})
		return
	}

	// 判断是否需要重定向
	redirect := c.DefaultQuery("redirect", "true")
	if redirect == "true" {
		c.Redirect(http.StatusFound, signedURL)
		return
	}

	// 返回 JSON
	c.JSON(http.StatusOK, gin.H{
		"url":      signedURL,
		"file":     fileRecord,
		"expireIn": 3600,
	})
}

// Delete 删除文件
// DELETE /api/files/*key
func (h *FileHandler) Delete(c *gin.Context) {
	// 检查 OSS 是否配置
	if !oss.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "文件服务未配置",
		})
		return
	}

	// 获取当前用户
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "用户未认证",
		})
		return
	}
	currentUser := user.(*models.User)

	// 获取文件键
	key := c.Param("key")
	key = strings.TrimPrefix(key, "/")

	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "文件键不能为空",
		})
		return
	}

	// 查询文件记录
	var fileRecord models.File
	if err := database.GetDB().Where("`key` = ?", key).First(&fileRecord).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "文件不存在",
		})
		return
	}

	// 检查是否是上传者
	if currentUser.ID != fileRecord.UploaderID {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "只有上传者可以删除此文件",
		})
		return
	}

	// 从 OSS 删除文件
	ossClient := oss.GetClient()
	if err := ossClient.Delete(key); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "删除文件失败: " + err.Error(),
		})
		return
	}

	// 从数据库删除记录（软删除）
	if err := database.GetDB().Delete(&fileRecord).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "删除文件记录失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "文件删除成功",
	})
}
