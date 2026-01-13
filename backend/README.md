# ManjuFlow 后端服务

漫剧制作流程管理系统后端 API 服务。

## 技术栈

- Go 1.24
- Gin (Web 框架)
- GORM (ORM)
- SQLite / MySQL (数据库)

## 快速开始

### 本地开发

```bash
# 安装依赖
make tidy

# 运行服务（默认使用 SQLite）
make run
```

服务启动后访问 http://localhost:8080

### Docker 部署

```bash
# 在项目根目录运行
docker-compose up -d
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| SERVER_PORT | 服务端口 | 8080 |
| GIN_MODE | Gin 模式 (debug/release) | debug |
| DB_DRIVER | 数据库驱动 (sqlite/mysql) | sqlite |
| DB_HOST | MySQL 主机 | localhost |
| DB_PORT | MySQL 端口 | 3306 |
| DB_USER | MySQL 用户名 | root |
| DB_PASSWORD | MySQL 密码 | - |
| DB_NAME | 数据库名 | manju_flow |
| CORS_ORIGINS | 允许的跨域来源 | * |
| OSS_ENDPOINT | 阿里云 OSS 端点 | - |
| OSS_ACCESS_KEY_ID | OSS AccessKey ID | - |
| OSS_ACCESS_KEY_SECRET | OSS AccessKey Secret | - |
| OSS_BUCKET_NAME | OSS Bucket 名称 | - |

## API 接口

### 书库管理

#### 获取书籍列表

```
GET /api/books
```

查询参数：
- `page` - 页码（默认 1）
- `size` - 每页数量（默认 10）
- `type` - 类型过滤：`NOVEL` 或 `COMIC`
- `keyword` - 搜索关键词（标题/作者）

响应示例：
```json
{
  "total": 100,
  "page": 1,
  "size": 10,
  "data": [
    {
      "id": 1,
      "title": "仙剑遗志",
      "author": "林枫",
      "cover": "https://example.com/cover.jpg",
      "type": "NOVEL",
      "description": "...",
      "adaptationStatus": "IN_PROGRESS",
      "adaptedBy": "陈艾利克斯",
      "chapterCount": 120,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### 创建书籍

```
POST /api/books
Content-Type: application/json

{
  "title": "仙剑遗志",
  "author": "林枫",
  "cover": "https://example.com/cover.jpg",
  "type": "NOVEL",
  "description": "一段仙侠传奇..."
}
```

#### 获取书籍详情

```
GET /api/books/:id
```

#### 更新书籍

```
PUT /api/books/:id
Content-Type: application/json

{
  "title": "仙剑遗志（修订版）",
  "author": "林枫",
  "cover": "https://example.com/cover2.jpg",
  "type": "NOVEL",
  "description": "修订后的描述..."
}
```

#### 删除书籍

```
DELETE /api/books/:id
```

### 健康检查

```
GET /health
```

## 项目结构

```
backend/
├── cmd/
│   └── main.go              # 程序入口
├── internal/
│   ├── config/              # 配置管理
│   ├── database/            # 数据库连接
│   ├── handlers/            # API 处理器
│   ├── models/              # 数据模型
│   └── routes/              # 路由配置
├── Dockerfile
├── Makefile
└── go.mod
```
