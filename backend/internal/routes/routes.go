package routes

import (
	"manju-flow/internal/handlers"
	"manju-flow/internal/middleware"

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
		// 认证路由（无需登录）
		authHandler := handlers.NewAuthHandler()
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register) // 注册
			auth.POST("/login", authHandler.Login)       // 登录
		}

		// 需要认证的路由
		authorized := api.Group("")
		authorized.Use(middleware.AuthRequired())
		{
			// 获取当前用户信息
			authorized.GET("/auth/me", authHandler.GetCurrentUser)

			// 书库路由
			bookHandler := handlers.NewBookHandler()
			books := authorized.Group("/books")
			{
				books.GET("", bookHandler.List)          // 获取书籍列表
				books.POST("", bookHandler.Create)       // 创建书籍
				books.GET("/:bookId", bookHandler.GetByID)   // 获取书籍详情
				books.PUT("/:bookId", bookHandler.Update)    // 更新书籍
				books.DELETE("/:bookId", bookHandler.Delete) // 删除书籍
			}

			// 章节路由
			chapterHandler := handlers.NewChapterHandler()
			chapters := authorized.Group("/books/:bookId/chapters")
			{
				chapters.GET("", chapterHandler.List)                // 获取章节列表
				chapters.POST("", chapterHandler.Create)             // 创建章节
				chapters.GET("/:chapterId", chapterHandler.GetByID)   // 获取章节详情
				chapters.PUT("/:chapterId", chapterHandler.Update)    // 更新章节
				chapters.DELETE("/:chapterId", chapterHandler.Delete) // 删除章节
			}

			// 场景路由
			sceneHandler := handlers.NewSceneHandler()
			scenes := authorized.Group("/books/:bookId/chapters/:chapterId/scenes")
			{
				scenes.GET("", sceneHandler.List)            // 获取场景列表
				scenes.POST("", sceneHandler.Create)         // 创建场景
				scenes.GET("/:sceneId", sceneHandler.GetByID)   // 获取场景详情
				scenes.PUT("/:sceneId", sceneHandler.Update)    // 更新场景
				scenes.DELETE("/:sceneId", sceneHandler.Delete) // 删除场景
			}
		}
	}
}
