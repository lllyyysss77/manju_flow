package config

import (
	"manju-flow/utils"
)

// Config 应用配置
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
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
	return &Config{
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
	}
}


