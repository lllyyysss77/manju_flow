package config

import (
	"manju-flow/utils"
	"strings"
)

var Cfg *Config

// Config 应用配置
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	OSS      OSSConfig
	App      AppConfig
	CORS     CORSConfig
}

// CORSConfig 跨域配置
type CORSConfig struct {
	AllowOrigins []string
}

// AppConfig 应用程序配置
type AppConfig struct {
	Name        string
	Environment string
}

// OSSConfig 阿里云OSS配置
type OSSConfig struct {
	Endpoint        string
	AccessKeyID     string
	AccessKeySecret string
	BucketName      string
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Port string
	Mode string // debug, release, test
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Driver   string // mysql, sqlite
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// Load 加载配置
func Load() *Config {
	Cfg = &Config{
		App: AppConfig{
			Name:        "manju",
			Environment: utils.GetEnv("APP_ENV", "local"),
		},
		Server: ServerConfig{
			Port: utils.GetEnv("SERVER_PORT", "8080"),
			Mode: utils.GetEnv("GIN_MODE", "debug"),
		},
		Database: DatabaseConfig{
			Driver:   utils.GetEnv("DB_DRIVER", "sqlite"),
			Host:     utils.GetEnv("DB_HOST", "localhost"),
			Port:     utils.GetEnv("DB_PORT", "3306"),
			User:     utils.GetEnv("DB_USER", "root"),
			Password: utils.GetEnv("DB_PASSWORD", ""),
			DBName:   utils.GetEnv("DB_NAME", "manju_flow"),
			SSLMode:  utils.GetEnv("DB_SSL_MODE", "disable"),
		},
		OSS: OSSConfig{
			Endpoint:        utils.GetEnv("OSS_ENDPOINT", ""),
			AccessKeyID:     utils.GetEnv("OSS_ACCESS_KEY_ID", ""),
			AccessKeySecret: utils.GetEnv("OSS_ACCESS_KEY_SECRET", ""),
			BucketName:      utils.GetEnv("OSS_BUCKET_NAME", ""),
		},
		CORS: CORSConfig{
			AllowOrigins: parseOrigins(utils.GetEnv("CORS_ORIGINS", "*")),
		},
	}
	return Cfg
}

// parseOrigins 解析允许的域名列表
// 支持逗号分隔: "https://example.com,https://app.example.com"
// 默认 "*" 表示允许所有
func parseOrigins(origins string) []string {
	if origins == "" || origins == "*" {
		return []string{"*"}
	}
	parts := strings.Split(origins, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	if len(result) == 0 {
		return []string{"*"}
	}
	return result
}


