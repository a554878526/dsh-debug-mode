# dsh-debug-mode

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的独立运行时优先 Debug Mode 插件。

![在 DeepSeek Harness 命令菜单中选择 debug 命令](docs/images/debug-command.png)

## 安装

前置条件：Node.js `^22.19.0 || >=24.0.0`、`PATH` 中可用的 pnpm，以及 DSH `0.1.0-rc.7` 或更高版本。

```sh
dsh plugin --profile web add "github:a554878526/dsh-debug-mode#main"
```

重启 `web` profile，新建一个任务，执行 `/debug`，然后描述问题。卸载命令：

```sh
dsh plugin --profile web remove dsh-debug-mode
```

### 恢复 0.1.1 及更早版本写入的历史

0.1.1 及更早版本写入了必需的 `debug-mode/state` 事件，正式 DSH 在重新打开历史时不认识该事件。先停止 `dsh web`，再运行仓库中的修复 helper。未传 `--apply` 时只读检查；apply 模式会先备份每个需要修改的压缩日志，再原子替换原文件。

```sh
python3 scripts/repair_debug_mode_sessions.py
python3 scripts/repair_debug_mode_sessions.py --apply
```

## 后续 agent 能否使用内置脚本？

可以。插件会把四个 Python helper 全部发布到 `scripts/`。Host 加载 `lib/index.js` 时，通过 `import.meta.url` 找到当前已安装插件的 `scripts/` 绝对目录，并把它注册为 `debug-mode` skill 的 directory `resourceBase`。DSH 随后会给 agent 渲染绝对的 `<skill_resources>` 目录，skill 再要求 agent 从该目录执行 helper。因此通过 Git 依赖、打包产物或本地 checkout 安装时都不依赖开发机源码路径。

插件必须在 DSH 进程启动前完成安装；重启后请新建任务，让 agent 获取新注册的 skill。Host 还需要提供 Python 3，helper 才能运行。

## 开发

```sh
pnpm install
pnpm run check
```

在仓库 checkout 中可用下面的命令安装到本地 profile，之后重启该 profile：

```sh
dsh plugin --profile web add .
```

运行时优先的 Debug Mode，一个双面（host + client）包。宿主半面注册 `debug-mode` skill、`/debug` 与进程内阶段约束；浏览器半面通过输入区始终可用的「命令」菜单提供该命令，并在启用后通过 `conversation.input.dock` 渲染循环控制条。

执行 `/debug` 会启用进程内 setup 状态、立即打开控制条，并把 canonical `debug-mode` skill 正文排入下一条真实用户消息；它自身不会唤醒模型。模型无需自行选择 skill 工具就能收到快速启动契约。控制条提交 `继续分析`、`已修复，请清理调试日志和插桩代码` 或 `退出 Debug Mode`。已修复会在清理回合前关闭宿主约束；退出则关闭约束且不发起模型请求。插件不再写入自定义 session event，因此独立安装不会导致 DSH 历史无法读取。

`scripts/` 下随包提供四个受支持的辅助脚本（`new_debug_session.py`、`debug_ingest_server.py`、`summarize_debug_log.py`、`find_instrumentation.py`）。运行时 skill 从 `import.meta.url` 解析当前已安装插件的脚本目录，并把它发布为 directory `resourceBase`，因此源码 checkout、打包发布、pnpm Git 依赖与独立插件仓库都使用相同的相对名称，不依赖机器固定路径。skill 要求优先使用这些脚本，只有脚本缺失或执行失败时才允许使用内联回退。

启动路径以取得第一条非空日志为目标：运行会话脚本、启动它打印的 ingest 命令、只读取足以放置 1-3 个探针的代码，再输出确切的 `<debug_reproduction_handoff>` 包装。setup 不设 Debug Mode 工具次数上限。宿主从成功的 helper 结果提取 session id、日志路径与 ingest URL，观察成功的 server 命令，并且只允许绑定这些事实的 `edit`/`write` 内容。仅写 console 的探针、普通修复、失败写入和不匹配的交接都不能进入 `waiting-for-repro`。

helper 可能输出绝对日志路径，而 handoff 使用文档约定的仓库相对路径 `.codex-debug/...`。宿主会把两者作为同一条 Debug Mode 日志比较；如果日志文件名确实不同，则返回专门的路径不匹配错误，不再误报“没有插桩”。

setup 与 analyzing 响应经过宿主强制执行的 `llm/stream` 过滤器。过滤器会缓存完整 setup 响应，保留中间 reasoning、工具调用与用量以供 thinking provider 回放，并且只在首次交接前移除普通文本。analyzing 期间普通验证报告保持原样，新的交接则像首轮一样经过校验与渲染。每一轮都必须建立新的 helper/server/probe 事实，并使用此前 `waiting-for-repro` 状态未使用过的日志路径。首次 waiting 前继续分析会被拒绝；之后每次点击只消费一条 waiting 消息，直到下一轮 waiting 消息出现才重新启用。

在已修复之前，宿主 guard 会保留完整证据链：analyzing 不能停止 ingest 任务、删除 `.codex-debug`，也不能在没有替换为下一轮 transport-backed 探针时移除探针。根因已证明时只发布验证报告并保持 `analyzing`；只有已修复会记录 `inactive` 并允许清理所有轮次的日志与任务。

证据到达前，skill 禁止写复现测试、跑类型检查或构建、做宽泛静态分析以及修复。Browser/Electron 探针必须通过 `fetch` 把事件发送给运行中的 ingest server，由它写入 JSONL；仅写 console 的探针无效。每份生成模板只内联一行 `JSON.stringify` replacer，把 BigInt 转成十进制字符串。

## 模型体验

### 运行时阶段与循环控制

#### 模型看到什么

`/debug` 会记录 `setup`，并排入与 skill loader 返回值相同的 `<skill_content name="debug-mode">` 块；该上下文与下一条真实用户消息一起进入模型历史，而不是单独开启回合。模型输出交接包装，但只有宿主渲染的复现说明会进入会话日志。控制条会在首条说明前禁用继续分析，点击时消费该 waiting 消息 seq，并要求出现更晚的说明后才能再次继续。每次点击都会在用户消息进入请求前记录 `analyzing`。已修复会在清理消息进入前记录 `inactive`；退出会记录 `inactive`，并在模型请求前拒绝这个控制回合。

#### Token 影响

`/debug` 会给下一次真实请求增加渲染后的 skill 上下文，但自身不消耗模型请求。有效交接会增加一条紧凑的宿主渲染 assistant 消息；继续分析与已修复各增加一条短用户消息，退出不增加模型 token。

#### KV Cache 影响

渲染后的 skill 上下文与宿主交接并入请求追加后缀；继续分析与已修复各追加一条用户消息。Debug Mode 不新增工具 schema，退出不改变缓存输入。

## 已知限制与后续工作

- **Debug Mode 状态只存在于当前进程** —— 重启 Host、刷新页面或重新打开 session 都会结束当前循环；再次执行 `/debug` 可恢复控制条并重新开始 setup。这样可以避免写入当前 DSH 持久化 API 无法标记为 ignorable 的外部事件类型。
- **退出不会撤回已排队上下文** —— 如果用户在发送下一条真实消息前退出，即使宿主约束已关闭，已排队的激活上下文仍会进入下一次请求。
- **setup 输出有意延迟** —— 每次模型响应完成后才显示工具活动，从而阻止被丢弃的诊断文本流入 UI。
- **清理发生在下一轮模型回合** —— `已修复` 提交一条消息而不是自己删除文件；由 skill 指引模型移除探针并删除 `.codex-debug/` 日志。因此机械化清理由模型完成，而非宿主服务。
- **helper 与 server 通过已打包命令名识别** —— 宿主约束会识别成功的 `new_debug_session.py` 与 `debug_ingest_server.py` 调用，再把探针内容和交接数据绑定到 helper 输出。其他传输方式必须使用已打包回退约定，或扩展该识别逻辑。
