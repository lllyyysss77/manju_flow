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

		// 文件路由（获取文件支持可选认证）
		fileHandler := handlers.NewFileHandler()
		api.GET("/files/*key", middleware.AuthOptional(), fileHandler.Get) // 获取文件（支持公开/私有）

		// 需要认证的路由
		authorized := api.Group("")
		authorized.Use(middleware.AuthRequired())
		{
			// 获取当前用户信息
			authorized.GET("/auth/me", authHandler.GetCurrentUser)

			// 文件路由（需要认证）
			authorized.POST("/files", fileHandler.Upload)       // 上传文件
			authorized.DELETE("/files/*key", fileHandler.Delete) // 删除文件

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

			// 分镜路由
			storyboardHandler := handlers.NewStoryboardHandler()
			storyboard := authorized.Group("/scenes/:sceneId/storyboard")
			{
				storyboard.GET("", storyboardHandler.GetInfo)                              // 获取分镜信息
				storyboard.PUT("/start-frame", storyboardHandler.UpdateStartFrame)         // 更新起始帧
				storyboard.PUT("/end-frame", storyboardHandler.UpdateEndFrame)             // 更新结束帧
				storyboard.GET("/start-frame/versions", storyboardHandler.ListStartFrameVersions) // 起始帧版本历史
				storyboard.GET("/end-frame/versions", storyboardHandler.ListEndFrameVersions)     // 结束帧版本历史
				storyboard.PUT("/start-frame/revert/:version", storyboardHandler.RevertStartFrame) // 回滚起始帧
				storyboard.PUT("/end-frame/revert/:version", storyboardHandler.RevertEndFrame)     // 回滚结束帧
			}

			// 动画路由
			animationHandler := handlers.NewAnimationHandler()
			animation := authorized.Group("/scenes/:sceneId/animation")
			{
				animation.GET("", animationHandler.GetInfo)                     // 获取动画信息
				animation.PUT("", animationHandler.Update)                      // 更新动画
				animation.GET("/versions", animationHandler.ListVersions)       // 动画版本历史
				animation.PUT("/revert/:version", animationHandler.Revert)      // 回滚动画
			}

			// 音频轨道路由（支持多音频）
			audioHandler := handlers.NewAudioHandler()
			audios := authorized.Group("/scenes/:sceneId/audios")
			{
				audios.GET("", audioHandler.List)                                  // 获取音频轨道列表
				audios.POST("", audioHandler.Create)                               // 创建音频轨道
				audios.GET("/:audioId", audioHandler.GetByID)                      // 获取单个音频轨道
				audios.PUT("/:audioId", audioHandler.Update)                       // 更新音频轨道信息
				audios.DELETE("/:audioId", audioHandler.Delete)                    // 删除音频轨道
				audios.PUT("/:audioId/upload", audioHandler.Upload)                // 上传新版本音频
				audios.GET("/:audioId/versions", audioHandler.ListVersions)        // 音频版本历史
				audios.PUT("/:audioId/revert/:version", audioHandler.Revert)       // 回滚音频
			}
		}
	}
}
