# Repository Guidelines

## Project Structure & Module Organization
- `components/`: Feature modules for剧本创作、分镜、动画、音频等（如 `ScriptEditor.tsx`, `StoryboardEditor.tsx`）。共享 UI/逻辑都应放在此目录并就近维护样式。
- `api.ts`, `types.ts`, `constants.tsx`: 接口封装、类型与枚举的单一来源。场景/章节 ID 使用数字，`cameraMovement` 取代旧的 shotType，`referenceImageUrl` 存储分镜参考图。
- `App.tsx`, `index.tsx`: 应用外壳与挂载点；导航或全局状态更新从这里开始。
- `dist/` 为构建产物，请勿手改；工具链配置在 `vite.config.ts`, `tsconfig.json`。

## Build, Test, and Development Commands
- `npm run dev`: 启动 Vite HMR 开发服务器。
- `npm run build`: 生成生产包到 `dist/`。
- `npm run preview`: 本地以生产模式预览。
- 开发环境变量放在 `.env`（示例：`VITE_API_URL=http://localhost:8080`），不要提交私密值。

## Coding Style & Naming Conventions
- TypeScript + React 函数组件，2 空格缩进，按「第三方 → 内部工具 → 本地模块」分组导入。
- 组件/Hook 使用 `PascalCase`，工具函数用 `camelCase`；避免 `any`，为 API 数据定义显式类型。
- 编辑器内的拖拽宽度、悬停插入、场景顺序（按 index 排序后以 1..n 显示）等交互需保持一致；仅为复杂逻辑添加简短注释。
- 交互提示采用居中短横幅，成功/失败配色区分，新增提示请复用现有样式。

## API, Auth & Uploads
- 后端基址取自 `VITE_API_URL`（默认 `http://localhost:8080`）。请求会自动附带 `Authorization: Bearer <token>`，登录/注册时显式清空该头。
- 使用 `authStorage` 读写 token，登出或 token 失效时记得清空以免污染请求。
- 章节/场景 CRUD 在 `chapterApi` 与 `sceneApi`；传参以数字 ID、`cameraMovement` 字段、无需冗余 status。
- 分镜参考图通过 `fileApi.upload` 上传文件（FormData）获取 URL，再写入场景的 `referenceImageUrl` 保存。

## Testing Guidelines
- 尚无自动化测试。最小验证：登录/注册流程、章节/场景创建与排序、悬停插入按钮、左/右栏拖拽调宽、参考图上传后自动/手动保存（5s 自动保存，切换场景触发保存，失败提示）。
- 构建检查：`npm run build`。

## Commit & Pull Request Guidelines
- 提交信息用祈使句（如 `Add reference image upload hook`，`Fix scene autosave toast`），同一提交只处理一类改动。
- PR 需包含：变更摘要、涉及界面截图/GIF、受影响的核心流程、是否需要后端/配置变更及相关说明；如有任务或 issue，请链接。 

## Workflow & Troubleshooting
- 自动保存 5s 一次，场景切换时也会保存；手动保存按钮在无改动时会提示「无需保存」，失败时弹出红色横幅。调试保存问题时先确认状态签名是否更新。
- 参考图上传先走 `/api/files` 获取 URL，再保存到场景；本地手绘会转为 PNG 上传。若出现连续请求，请检查章节/场景加载依赖（避免在无关 useEffect 里添加 onEpisodesChange）。 
