package middleware

import (
	"net/http"
	"strings"

	"manju-flow/internal/database"
	"manju-flow/internal/models"

	"github.com/gin-gonic/gin"
)

// AuthRequired 身份验证中间件
// 从 headers 中获取 Authorization token 验证身份
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取 Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "未提供认证信息",
			})
			c.Abort()
			return
		}

		// 支持 "Bearer <token>" 格式
		token := authHeader
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "无效的认证信息",
			})
			c.Abort()
			return
		}

		// 查找用户
		db := database.GetDB()
		var user models.User
		if err := db.Where("token = ?", token).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "认证失败，请重新登录",
			})
			c.Abort()
			return
		}

		// 将用户信息存入上下文
		c.Set("user", &user)
		c.Set("userId", user.ID)

		c.Next()
	}
}

// AuthOptional 可选身份验证中间件
// 如果提供了有效的 token，则设置用户信息；否则继续执行
func AuthOptional() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取 Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		// 支持 "Bearer <token>" 格式
		token := authHeader
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}

		if token == "" {
			c.Next()
			return
		}

		// 查找用户
		db := database.GetDB()
		var user models.User
		if err := db.Where("token = ?", token).First(&user).Error; err != nil {
			// token 无效，但不阻止请求
			c.Next()
			return
		}

		// 将用户信息存入上下文
		c.Set("user", &user)
		c.Set("userId", user.ID)

		c.Next()
	}
}
