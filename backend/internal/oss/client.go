package oss

import (
	"fmt"
	"io"
	"path/filepath"
	"time"

	"manju-flow/internal/config"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	"github.com/google/uuid"
)

// Client OSS 客户端封装
type Client struct {
	bucket *oss.Bucket
	config *config.OSSConfig
}

var defaultClient *Client

// Init 初始化 OSS 客户端
func Init(cfg *config.OSSConfig) error {
	if cfg.Endpoint == "" || cfg.AccessKeyID == "" || cfg.AccessKeySecret == "" || cfg.BucketName == "" {
		return fmt.Errorf("OSS configuration is incomplete")
	}

	client, err := oss.New(cfg.Endpoint, cfg.AccessKeyID, cfg.AccessKeySecret)
	if err != nil {
		return fmt.Errorf("failed to create OSS client: %w", err)
	}

	bucket, err := client.Bucket(cfg.BucketName)
	if err != nil {
		return fmt.Errorf("failed to get bucket: %w", err)
	}

	defaultClient = &Client{
		bucket: bucket,
		config: cfg,
	}

	return nil
}

// GetClient 获取默认 OSS 客户端
func GetClient() *Client {
	return defaultClient
}

// IsConfigured 检查 OSS 是否已配置
func IsConfigured() bool {
	return defaultClient != nil
}

// GenerateKey 生成唯一的对象键
func GenerateKey(originalName string) string {
	ext := filepath.Ext(originalName)
	timestamp := time.Now().Format("2006/01/02")
	uniqueID := uuid.New().String()
	return fmt.Sprintf("%s/%s%s", timestamp, uniqueID, ext)
}

// Upload 上传文件
func (c *Client) Upload(key string, reader io.Reader, contentType string) error {
	options := []oss.Option{
		oss.ContentType(contentType),
	}
	return c.bucket.PutObject(key, reader, options...)
}

// Delete 删除文件
func (c *Client) Delete(key string) error {
	return c.bucket.DeleteObject(key)
}

// GetSignedURL 获取签名 URL
func (c *Client) GetSignedURL(key string, expireSeconds int64) (string, error) {
	return c.bucket.SignURL(key, oss.HTTPGet, expireSeconds)
}

// Exists 检查对象是否存在
func (c *Client) Exists(key string) (bool, error) {
	return c.bucket.IsObjectExist(key)
}
