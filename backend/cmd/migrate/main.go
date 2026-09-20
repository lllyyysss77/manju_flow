package main

import (
	"log"

	"manju-flow/internal/config"
	"manju-flow/internal/database"
	"manju-flow/utils"

	"github.com/joho/godotenv"
)

func init() {
	if utils.GetEnv("APP_ENV", "local") == "local" {
		if err := godotenv.Load(".env"); err != nil {
			log.Printf("无法加载 .env 文件: %v", err)
		}
	}
}

func main() {
	db, err := database.Connect(&config.Load().Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := database.MigrateSceneAssets(db); err != nil {
		log.Fatalf("Scene asset migration failed: %v", err)
	}
	log.Println("Scene asset migration completed successfully")
}
