# Manju Flow - 漫剧制作流程管理系统

## 项目概述

将小说/漫画改编为漫剧的全流程管理工具，支持剧本创作、分镜绘制、配音制作等环节。

## 技术栈

### 后端
- **语言**: Go 1.24
- **框架**: Gin v1.9.1
- **ORM**: GORM v1.25.5
- **数据库**: SQLite (开发) / MySQL 8.0 (生产)
- **入口**: `backend/cmd/main.go`
- **端口**: 8080

### 前端
- **框架**: Next.js 15 (App Router)
- **语言**: TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **入口**: `frontend/src/app`
- **端口**: 3000

## 目录结构

```
manju_flow/
├── backend/
│   ├── cmd/main.go              # 程序入口
│   ├── internal/
│   │   ├── config/config.go     # 配置管理
│   │   ├── database/database.go # 数据库初始化
│   │   ├── handlers/            # API 处理器
│   │   │   ├── book.go          # 书库 CRUD
│   │   │   ├── chapter.go       # 章节 CRUD
│   │   │   ├── scene.go         # 场景 CRUD
│   │   │   └── file.go          # 文件上传/获取
│   │   ├── models/              # 数据模型
│   │   │   ├── book.go
│   │   │   ├── chapter.go
│   │   │   ├── scene.go
│   │   │   └── file.go
│   │   ├── oss/                 # 阿里云 OSS 工具
│   │   │   └── client.go
│   │   └── routes/routes.go     # 路由配置
│   ├── go.mod
│   └── Makefile
│
└── frontend/
    ├── src/
    │   ├── app/                 # Next.js App Router 页面
    │   ├── components/          # React 组件
    │   ├── lib/                 # 工具函数
    │   └── types/               # TypeScript 类型
    ├── package.json
    └── tailwind.config.ts
```

## 数据模型

### Book (书库)
| 字段 | 类型 | 说明 |
|------|------|------|
| ID | uint | 主键 |
| Title | string | 标题 |
| Author | string | 作者 |
| Cover | string | 封面 URL |
| Type | BookType | NOVEL / COMIC |
| Description | string | 描述 |
| AdaptationStatus | AdaptationStatus | NONE / IN_PROGRESS / COMPLETED |
| ChapterCount | int | 章节数 |

### Chapter (章节)
| 字段 | 类型 | 说明 |
|------|------|------|
| ID | uint | 主键 |
| BookID | uint | 关联书籍 |
| Title | string | 标题 |
| Index | float64 | 排序索引 (浮点数支持中间插入) |
| Status | ChapterStatus | DRAFT / IN_PROGRESS / COMPLETED |

### Scene (场景)
| 字段 | 类型 | 说明 |
|------|------|------|
| ID | uint | 主键 |
| ChapterID | uint | 关联章节 |
| Index | float64 | 排序索引 |
| Status | SceneStatus | DRAFT / IN_PROGRESS / COMPLETED |
| Description | string | 场景描述 (必填，用于预览) |
| CameraMovement | string | 运镜 |
| Dialogue | string | 台词/旁白 |

### File (文件)
| 字段 | 类型 | 说明 |
|------|------|------|
| ID | uint | 主键 |
| Key | string | OSS 对象键 |
| OriginalName | string | 原始文件名 |
| Size | int64 | 文件大小（字节） |
| MimeType | string | MIME 类型 |
| UploaderID | uint | 上传者 ID |
| Visibility | FileVisibility | public / private |

### ChapterVideo (章节交付视频)
| 字段 | 类型 | 说明 |
|------|------|------|
| ID | uint | 主键 |
| ChapterID | uint | 关联章节 (一对一) |
| VideoUrl | string | 原始视频 URL |
| PreviewUrl | string | 压缩预览版 URL (可选) |
| VideoVersion | int | 当前版本号 |
| Status | VideoStatus | PENDING / PROCESSING / READY / FAILED |
| Duration | int | 时长（秒） |
| FileSize | int64 | 文件大小（字节） |
| PreviewSize | int64 | 预览版大小（字节） |
| Width | int | 视频宽度 |
| Height | int | 视频高度 |
| Format | string | 视频格式 (mp4, webm) |
| Codec | string | 编码格式 (h264, h265) |
| Bitrate | int | 码率 (kbps) |

### ChapterVideoVersion (视频版本历史)
| 字段 | 类型 | 说明 |
|------|------|------|
| ID | uint | 主键 |
| ChapterVideoID | uint | 关联章节视频 |
| VideoUrl | string | 视频 URL |
| PreviewUrl | string | 预览版 URL |
| Version | int | 版本号 |
| Duration | int | 时长（秒） |
| FileSize | int64 | 文件大小 |
| Remark | string | 版本备注 |
| CreatedBy | uint | 创建者 ID |

### Comment (评论)
| 字段 | 类型 | 说明 |
|------|------|------|
| ID | uint | 主键 |
| Content | string | 评论内容 |
| TargetType | CommentTargetType | scene / chapter |
| TargetID | uint | 目标对象 ID |
| Module | CommentModule | script / storyboard / animation / audio / review |
| UserID | uint | 评论作者 ID |
| Meta | string | JSON 元数据 (审核交付: {"timecode": "3:56", "seconds": 236}) |

**评论模块说明:**
- `script`: 剧本创作模块 - 针对场景评论
- `storyboard`: 分镜绘制模块 - 针对场景评论
- `animation`: 动画制作模块 - 针对场景评论
- `audio`: 音频后期模块 - 针对场景评论
- `review`: 审核交付模块 - 针对章节评论，支持视频时间点

## API 路由

```
GET    /health                                    # 健康检查

# 书库
GET    /api/books                                 # 列表 (?page, ?size, ?type, ?keyword)
POST   /api/books                                 # 创建
GET    /api/books/:id                             # 详情
PUT    /api/books/:id                             # 更新
DELETE /api/books/:id                             # 删除

# 章节
GET    /api/books/:bookId/chapters                # 列表 (?includeScenes=true)
POST   /api/books/:bookId/chapters                # 创建
GET    /api/books/:bookId/chapters/:id            # 详情
PUT    /api/books/:bookId/chapters/:id            # 更新
DELETE /api/books/:bookId/chapters/:id            # 删除 (级联删除场景)

# 场景
GET    /api/books/:bookId/chapters/:chapterId/scenes      # 列表
POST   /api/books/:bookId/chapters/:chapterId/scenes      # 创建
GET    /api/books/:bookId/chapters/:chapterId/scenes/:id  # 详情
PUT    /api/books/:bookId/chapters/:chapterId/scenes/:id  # 更新
DELETE /api/books/:bookId/chapters/:chapterId/scenes/:id  # 删除

# 文件 (需要配置 OSS)
POST   /api/files                  # 上传文件 (multipart/form-data, field: file, visibility: public/private)
GET    /api/files/*key             # 获取文件 (?redirect=true 跳转到签名URL，否则返回JSON)
DELETE /api/files/*key             # 删除文件 (仅上传者可删)

# 章节视频交付
GET    /api/chapters/:chapterId/video                   # 获取章节视频信息
PUT    /api/chapters/:chapterId/video                   # 上传/更新视频
DELETE /api/chapters/:chapterId/video                   # 删除视频及所有版本
PUT    /api/chapters/:chapterId/video/preview           # 上传压缩预览版
PUT    /api/chapters/:chapterId/video/status            # 更新处理状态
GET    /api/chapters/:chapterId/video/versions          # 获取版本历史
PUT    /api/chapters/:chapterId/video/revert/:version   # 回滚到指定版本

# 评论
# 场景评论 (剧本创作、分镜绘制、动画制作、音频后期)
GET    /api/scenes/:sceneId/comments                    # 获取场景评论 (?module=script|storyboard|animation|audio)
POST   /api/scenes/:sceneId/comments                    # 创建场景评论 (?module=script|storyboard|animation|audio)
# 章节评论 (审核交付)
GET    /api/chapters/:chapterId/comments                # 获取章节评论 (module=review)
POST   /api/chapters/:chapterId/comments                # 创建章节评论 (支持 meta 字段存储时间点)
# 评论通用操作
GET    /api/comments/:id                                # 获取评论详情
PUT    /api/comments/:id                                # 更新评论 (仅作者可操作)
DELETE /api/comments/:id                                # 删除评论 (仅作者可操作)
```

## 开发命令

```bash
# 后端
cd backend
make run          # 开发运行
make build        # 编译
make test         # 测试

# 前端
cd frontend
pnpm dev          # 开发运行
pnpm build        # 构建
pnpm lint         # 检查
```

## 代码规范

### 后端
- Handler 结构: `NewXxxHandler()` 构造函数 + CRUD 方法
- 所有模型使用 GORM 软删除 (`gorm.DeletedAt`)
- `Index` 字段用 `float64` 支持中间插入
- SQL 中 `index` 是保留字，需用反引号: `` `index` ``

### 前端
- 页面放 `app/` 目录，使用 App Router
- 组件放 `components/`，UI 组件用 shadcn/ui
- API 调用统一在 `lib/api.ts`

## 环境变量

```env
# backend/.env
DB_DRIVER=sqlite          # 或 mysql
DB_NAME=manju_flow
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
GIN_MODE=debug            # 或 release

# 阿里云 OSS (可选，用于文件上传)
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET_NAME=your_bucket_name
```

## 注意事项

1. 浮点数 Index: 在两元素间插入时计算 `(prev + next) / 2`
2. 软删除: 所有 DELETE 操作是软删除，数据仍在数据库
3. 级联删除: 删除章节会同时删除其下所有场景
4. CORS: 后端允许所有来源 (`*`)
5. 文件上传: 需要配置阿里云 OSS，否则文件相关 API 返回 503
6. 文件权限: public 文件任何人可访问，private 文件仅上传者可访问
7. 视频优化: 大视频建议上传时同时提供压缩预览版 (PreviewUrl)，阿里云 OSS 支持 HTTP Range 请求实现边下边播
