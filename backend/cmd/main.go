package main

import (
	"log"

	"manju-flow/internal/config"
	"manju-flow/internal/database"
	"manju-flow/internal/routes"
	"manju-flow/utils"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func init() {
	// 加载.env文件(仅在本地开发环境)
	if utils.GetEnv("MANJU_ENVIRONMENT", "local") == "local" {
		// 尝试从项目根目录加载
		err := godotenv.Load(".env")
		if err != nil {
			// 尝试从当前目录加载
			err = godotenv.Load(".env")
			if err != nil {
				log.Printf("无法加载 .env 文件: %v", err)
			}
		}
	}
}

func main() {
	// 加载配置
	cfg := config.Load()

	// 设置 Gin 模式
	gin.SetMode(cfg.Server.Mode)

	// 初始化数据库
	if err := database.Init(&cfg.Database); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// 创建 Gin 引擎
	r := gin.Default()

	// 配置路由
	routes.Setup(r)

	// 启动服务器
	addr := ":" + cfg.Server.Port
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
