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
- **构建工具**: Vite 6
- **框架**: React 19
- **语言**: TypeScript 5
- **UI**: Tailwind CSS (CDN)
- **图标**: Lucide React
- **入口**: `frontend/index.tsx`
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
│   │   │   ├── file.go          # 文件上传/获取
│   │   │   └── lora.go          # LoRA 库 CRUD
│   │   ├── models/              # 数据模型
│   │   │   ├── book.go
│   │   │   ├── chapter.go
│   │   │   ├── scene.go
│   │   │   ├── file.go
│   │   │   └── lora.go          # LoRA 模型
│   │   ├── oss/                 # 阿里云 OSS 工具
│   │   │   └── client.go
│   │   └── routes/routes.go     # 路由配置
│   ├── go.mod
│   └── Makefile
│
└── frontend/
    ├── index.html               # HTML 入口
    ├── index.tsx                # React 挂载点
    ├── App.tsx                  # 主应用组件 (Dashboard + Production)
    ├── api.ts                   # API 服务层 (所有 API 调用)
    ├── types.ts                 # TypeScript 类型定义
    ├── constants.tsx            # 共享常量 (STAGE_CONFIG, STATUS_MAP, DEFAULT_SCENE_THUMB)
    ├── components/              # React 组件
    │   ├── ScriptEditor.tsx     # 剧本创作模块
    │   ├── StoryboardEditor.tsx # 分镜绘制模块
    │   ├── AnimationEditor.tsx  # 动画制作模块
    │   ├── AudioEditor.tsx      # 音频后期模块
    │   ├── DeliverReview.tsx    # 审核交付模块
    │   ├── OutlineEditor.tsx    # 大纲人设模块
    │   ├── LoraLibrary.tsx      # LoRA 库主组件
    │   ├── LoraCard.tsx         # LoRA 卡片组件
    │   ├── LoraModal.tsx        # LoRA 上传/编辑弹窗
    │   ├── LoraDetail.tsx       # LoRA 详情弹窗
    │   ├── CommentItem.tsx      # 评论项组件
    │   ├── ImportBookModal.tsx  # 导入书籍弹窗
    │   ├── AuthPage.tsx         # 登录/注册页
    │   ├── StageWrapper.tsx     # 阶段包装器
    │   ├── useSceneComments.ts  # 场景评论 Hook
    │   ├── useFileUrl.ts        # 文件 URL 解析 Hook
    │   └── usePanelResize.ts    # 面板拖拽调整 Hook
    ├── vite.config.ts           # Vite 配置
    ├── tsconfig.json            # TypeScript 配置
    └── package.json
```

## 前端代码规范

### 共享常量
所有共享常量统一放在 `constants.tsx`:
- `STAGE_CONFIG`: 生产阶段配置
- `STATUS_MAP`: 状态中文映射
- `DEFAULT_SCENE_THUMB`: 默认场景占位图
- `LORA_MODEL_OPTIONS`: LoRA 适用模型选项
- `DEFAULT_LORA_PREVIEW`: 默认 LoRA 预览占位图

### 自定义 Hooks
复用逻辑提取为 Hook:
- `useSceneComments`: 场景评论管理 (CRUD)
- `useFileUrl`: OSS 文件 URL 解析和缓存
- `usePanelResize`: 可拖拽面板宽度调整

### API 调用
所有 API 调用统一在 `api.ts`:
- `authApi`: 认证相关
- `bookApi`: 书籍 CRUD
- `chapterApi`: 章节 CRUD
- `sceneApi`: 场景 CRUD
- `fileApi`: 文件上传/获取
- `storyboardApi`: 分镜帧集管理
- `animationApi`: 动画视频管理
- `audioApi`: 音频轨道管理
- `videoApi`: 章节交付视频
- `commentApi`: 评论管理
- `characterApi`: 角色管理
- `loraApi`: LoRA 库 CRUD

### 类型定义
所有类型统一在 `types.ts`:
- 避免使用 `as any` 类型断言
- API 返回类型与前端类型保持一致

### 组件规范
- 编辑器组件支持 `initialChapterId`/`initialSceneId` 跨模块状态同步
- 使用 `onActiveChapterChange`/`onActiveSceneChange` 回调通知父组件
- 使用 ref 存储回调避免 useEffect 依赖问题

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
| ThumbnailUrl | string | 缩略图 URL (首帧) |

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

### Lora (LoRA 模型库)
| 字段 | 类型 | 说明 |
|------|------|------|
| ID | uint | 主键 |
| Name | string | LoRA 名称 |
| Description | string | 描述 |
| ModelType | LoraModelType | SD_1.5 / SD_2.1 / SDXL / SD3 |
| Tags | string | 标签 (JSON 数组) |
| FileUrl | string | LoRA 文件 URL |
| FileSize | int64 | 文件大小（字节） |
| PreviewUrl | string | 效果图/预览图 URL |
| ConfigUrl | string | 配置文件 URL |
| UploaderID | uint | 上传者 ID |

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

# LoRA 库
GET    /api/loras                                       # 列表 (?page, ?size, ?modelType, ?tag, ?keyword)
POST   /api/loras                                       # 创建
GET    /api/loras/tags                                  # 获取所有标签
GET    /api/loras/:id                                   # 详情
PUT    /api/loras/:id                                   # 更新 (仅上传者可操作)
DELETE /api/loras/:id                                   # 删除 (仅上传者可操作)
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
- 共享常量放 `constants.tsx`，避免在组件中重复定义
- 复用逻辑提取为自定义 Hook，放在 `components/` 目录
- API 调用统一在 `api.ts`
- 类型定义统一在 `types.ts`，避免 `as any`
- 编辑器组件遵循跨模块状态同步模式

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

# CORS 跨域配置 (生产环境需配置前端域名)
CORS_ORIGINS=*            # 或 https://your-app.vercel.app (多个用逗号分隔)
```

## 注意事项

1. 浮点数 Index: 在两元素间插入时计算 `(prev + next) / 2`
2. 软删除: 所有 DELETE 操作是软删除，数据仍在数据库
3. 级联删除: 删除章节会同时删除其下所有场景
4. CORS: 通过 `CORS_ORIGINS` 环境变量配置允许的域名，生产环境应配置具体的前端域名
5. 文件上传: 需要配置阿里云 OSS，否则文件相关 API 返回 503
6. 文件权限: public 文件任何人可访问，private 文件仅上传者可访问
7. 视频优化: 大视频建议上传时同时提供压缩预览版 (PreviewUrl)，阿里云 OSS 支持 HTTP Range 请求实现边下边播

## 前端优化建议 (待实施)

以下是可进一步优化的方向，但不是紧急事项：

1. **组件拆分**: 大型编辑器组件（1000+ 行）可拆分为子组件
2. **状态管理**: 复杂组件可考虑使用 `useReducer` 替代多个 `useState`
3. **Tailwind 构建**: 将 Tailwind CDN 改为构建时包含
4. **错误边界**: 添加 React Error Boundary 组件
5. **代码分割**: 使用 React.lazy 进行路由级代码分割
