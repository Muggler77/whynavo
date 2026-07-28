# WhyNavo 数据模型

插件前端使用本地 IndexedDB 保存完整 `AppState`，并通过 `sync_snapshots` 表做整包云同步。Supabase 迁移同时创建了细粒度表，方便后续把同步升级成逐条记录合并；当前客户端不能直接访问这些旧表。

核心集合：

- `shortcuts`：快捷导航，含标题、网址、图标、颜色、分组、Dock 固定和排序。
- `shortcut_groups`：快捷导航分组。
- `widgets`：小组件开关和布局。
- `todos`：待办事项。
- `notes`：随手笔记，预留冲突正文。
- `countdowns`：用户自定义日期倒计时。
- `settings`：主题、壁纸、城市、图标尺寸、Dock 位置等。
- `sync_snapshots`：当前版本使用的整包快照。客户端只读，通过受限 RPC 原子写入固定的 `primary` 快照，单次载荷上限为 2 MB。
- `exchange_rate_cache`：中行汇率云函数缓存。

同步按记录 `updatedAt` 合并，并使用服务器修订号检测并发写入冲突。账号切换会取消旧账号仍在运行的登录或同步任务，避免跨账号覆盖本机状态。

## 笔记在本机如何保存

- 数据库名称：`whynavo`
- 对象仓库：`kv`
- 未登录分区：`app-state:anonymous`
- 登录账号分区：`app-state:user:<user-id>`
- 单条笔记字段：`id`、`title`、`body`、可选的 `conflictBody`、`updatedAt` 和可选的 `deletedAt`

这些记录由 Chrome、Edge、Safari 或相应系统 WebView 管理，不是用户文档目录中的独立 `.md` 文件。浏览器在不同操作系统上的实际磁盘路径不同，WhyNavo 也不能在 Chrome 扩展、PWA、iOS、iPadOS 和 Android 上安全地把主数据库切换到用户任选目录，因此设置中不提供“修改主存储目录”。用户可以在设置的数据页使用“导出笔记”，生成标准 Markdown 文件；下载位置由浏览器的下载设置决定。

## 固定任务和提醒

固定任务继续保存在 `todos` 集合中，并使用可选的 `recurrence`、`reminderTime`、`reminderWeekday` 和 `completedOn` 字段。Chromium 扩展在用户主动授予通知权限后，把最少量的本机提醒计划镜像到扩展本机存储并使用浏览器闹钟触发；任务正文仍以账号分区的 WhyNavo 状态为准。
