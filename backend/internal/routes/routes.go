package routes

import (
	"manju-flow/internal/handlers"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// Setup 配置所有路由
func Setup(r *gin.Engine) {
	// 配置 CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "ok",
		})
	})

	// API 路由组
	api := r.Group("/api")
	{
		// 书库路由
		bookHandler := handlers.NewBookHandler()
		books := api.Group("/books")
		{
			books.GET("", bookHandler.List)       // 获取书籍列表
			books.POST("", bookHandler.Create)    // 创建书籍
			books.GET("/:id", bookHandler.GetByID) // 获取书籍详情
			books.PUT("/:id", bookHandler.Update)  // 更新书籍
			books.DELETE("/:id", bookHandler.Delete) // 删除书籍
		}
	}
}
