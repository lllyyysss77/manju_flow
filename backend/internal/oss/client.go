package oss

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"path/filepath"

	"manju-flow/internal/config"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
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

// GenerateKeyFromContent 基于文件内容生成 SHA256 哈希作为对象键
// 返回哈希值和读取的全部内容
func GenerateKeyFromContent(reader io.Reader, originalName string) (string, []byte, error) {
	// 读取全部内容
	content, err := io.ReadAll(reader)
	if err != nil {
		return "", nil, fmt.Errorf("failed to read file content: %w", err)
	}

	// 计算 SHA256
	hash := sha256.Sum256(content)
	hashStr := hex.EncodeToString(hash[:])

	// 保留原始扩展名
	ext := filepath.Ext(originalName)

	// 使用哈希前两位作为目录，便于分散存储
	key := fmt.Sprintf("%s/%s%s", hashStr[:2], hashStr, ext)

	return key, content, nil
}

// Upload 上传文件
func (c *Client) Upload(key string, reader io.Reader, contentType string) error {
	options := []oss.Option{
		oss.ContentType(contentType),
	}
	return c.bucket.PutObject(key, reader, options...)
}

// UploadBytes 上传字节数组
func (c *Client) UploadBytes(key string, content []byte, contentType string) error {
	options := []oss.Option{
		oss.ContentType(contentType),
	}
	return c.bucket.PutObject(key, bytesReader(content), options...)
}

// bytesReader 创建一个 bytes reader
func bytesReader(data []byte) io.Reader {
	return &bytesReaderWrapper{data: data, pos: 0}
}

type bytesReaderWrapper struct {
	data []byte
	pos  int
}

func (b *bytesReaderWrapper) Read(p []byte) (n int, err error) {
	if b.pos >= len(b.data) {
		return 0, io.EOF
	}
	n = copy(p, b.data[b.pos:])
	b.pos += n
	return n, nil
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
