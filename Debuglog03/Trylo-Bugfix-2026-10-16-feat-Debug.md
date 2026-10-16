# Trylo 本轮 Bug 排查与修复报告（Debuglog03）

日期：2026-10-16（Asia/Shanghai）  
项目：`F:\trylo`；分支：`feat/Debug`  
Git 基线：`1502559`，本轮起点包含保留的 Debuglog02 未提交修改。  
远程：origin `Ai-JUX-02/trylo`；upstream `ylz92871-dotcom/trylo`。

**本轮扩大检查至 Desktop、CLI、移动端、服务端和 Work，修复 7 类产品缺陷，并修正 4 类测试合同问题。共修改或新增 13 个源代码/测试文件，新增 8 项回归测试。** 本轮代码仍在工作区，未提交或推送。Debuglog01/02 及原有日志移动状态均保留。

CLI 编译产物的全量隔离测试最终 4089 通过、0 失败、6 跳过；这不代表完整 CLI 构建通过。Desktop、服务端和 Work 仍有失败，具体见下文。

## 1. 计划与排查范围

本轮任务已登记为 goal，并执行 [PLAN.md](PLAN.md)：

1. 安装现有锁定依赖，复查历史失败，建立各模块基线。
2. 运行桌面端完整测试、CLI 全量编译产物测试、移动端合同测试及类型检查。
3. 检查文件匹配、远程消息与缓存、菜单键盘操作、调度时间边界。
4. 先保存失败证据，再实施修复和回归；对 UI 使用真实浏览器验证。
5. 执行 CLI 质量门禁、扩展复验及差异审查，整理本报告。

环境：Windows、Node.js `24.12.0`、npm `11.6.2`。Desktop 使用现有 pnpm 锁文件，CLI 和移动端使用现有 npm 锁文件；没有新增依赖或改动锁文件。Work、服务端复用前轮依赖。移动端首次安装遇到网络连接重置，重试后成功。

CLI 按仓库 `trylo-code-quality` 技能及工程纪律检查；菜单按 `frontend-quality-pipeline`、`accessibility-inclusive-design`、`web-design-guidelines`、`ui-verification` 流程处理。没有进行功能扩建或权限模型变更。

## 2. 修复的产品 Bug

### B01：文件匹配的字符类会跨越目录分隔符

- 文件：`new trylo cli/src/internal/adapters/tools/read-only/glob-match.ts`。
- 影响：例如 `src/a[!x]b.ts` 会错误匹配 `src/a/b.ts`，将一个路径段中的字符模式解释成跨目录匹配，返回不符合查询要求的文件。
- 根因：直接生成正则字符类，否定字符类可以匹配 `/`。
- 修复：所有字符类消费字符前排除目录分隔符，与 `?`、`*` 的路径段语义一致。
- 证据：原代码错误返回 `true`；修复后该路径不匹配，同目录的 `src/acb.ts` 仍匹配。

### B02：花括号选择表达式错误解析字符类中的标点

- 文件：同上。
- 影响：合法模式 `{[a,b],c}.ts` 和 `{[}],a}.ts` 被判定为非法，文件搜索无法执行。
- 根因：查找闭合花括号及分割选择分支时，没有跳过完整字符类，误把类中的逗号和右花括号当作结构分隔符。
- 修复：复用已有字符类边界扫描，在分支切分和花括号匹配时整体保留字符类。
- 证据：两项回归修复前都无法编译模式；修复后正确匹配 `a.ts / b.ts / ,.ts / c.ts`、`}.ts / a.ts`，不相关文件仍被排除。

### B03：模式菜单关闭后丢失键盘操作位置

- 文件：`desktop/src/components/chat/ModePopover.tsx`。
- 影响：选择模式后，获焦菜单项被移除，焦点落到页面主体；按 Tab 时菜单仍保持打开，键盘导航位置与视觉状态脱节。
- 修复：选择、Esc 和 Tab 关闭共用“关闭并返回触发按钮”路径；Tab 随后继续浏览器原生导航。鼠标点击菜单外的关闭不强抢焦点。
- 证据：两项组件测试分别复现选择后的焦点丢失、Tab 不关闭。真实浏览器中选择后焦点回到任务类型按钮，Tab 关闭后前进到“默认模型”。

### B04：模式菜单缺少 Home/End 键导航

- 文件：同上。
- 影响：菜单已有上下箭头操作，但 Home/End 无法到达首尾选项。
- 修复：Home 聚焦第一项，End 聚焦最后一项，保留上下箭头循环操作。
- 证据：回归测试修复前仍停在已选“计划”；修复后 Home/End 正确到达首尾项。在实际页面中也验证了包含 Code/Work 区域选择时的首尾导航。

### B05：菜单触发器与弹层的可访问语义不一致

- 文件：`desktop/src/components/chat/ModeChip.tsx`、`ModePopover.tsx`。
- 影响：ModeChip 声称打开 `listbox`，实际弹层是 `menu`；弹层同时有区域和工作方式两组单选项，却没有标注各自分组。
- 修复：触发器改为 `aria-haspopup="menu"`；两个单选组提供有名称的 `group`，保持当前菜单控件的语义。
- 证据：ModeChip 交互合同修正后验证弹层类型及触发器声明一致；真实页面保留菜单、单选状态、焦点可见性及 Code/Work 与工作方式两组内容。

### B06：移动端收到 JSON null 消息时抛异常

- 文件：`mobile-app/src/remoteConnection.ts`。
- 影响：WebSocket 内容是合法 JSON、但不是对象时，处理器访问 `message.snapshot` 抛出异常，打断当前消息处理。
- 修复：JSON 解析后先确认是非空、非数组的对象，再处理快照或动作。
- 证据：原代码处理 `null` 抛出 `Cannot read properties of null`；修复后忽略 null、布尔、数字、字符串和数组，之后的正常快照仍可使连接进入 connected。

### B07：移动端离线缓存没有验证消息形状

- 文件：`mobile-app/src/remoteCache.ts`。
- 影响：时间较新的损坏条目即使 `messages: null` 仍会成为离线会话；消息数组中的 null 或异常附件形状也可能破坏后续渲染或再次保存。
- 修复：只接收消息数组条目；读取与保存共用消息清理逻辑，丢弃无效消息/附件、限制保留数量、移除完整附件发送数据。附件全部无效时不保留空白消息。仅字符串输入/输出参与文本裁剪。
- 证据：修复前选中了损坏会话 `bad`；修复后选择有效会话 `good`，保留完整的有效回复并剔除 null、空白无效附件消息及错误附件字段。

## 3. 修正的测试合同问题

这些单独记录，不计入 7 类产品 Bug，也没有为它们改动对应产品语义。

| 问题 | 修正与依据 |
| --- | --- |
| CLI 闰日及 DST 测试混用时区 | 子进程在 UTC/纽约计算，父进程却用宿主时区的年月日/小时断言，造成 7 项误报。闰日计算固定 UTC，DST 使用精确 ISO 时间与真实时长断言。原调度算法未改动；最终 15 项通过。 |
| 文件变更项目名称样例残留 | 样例工作区为 `demo-ws`，两项断言却期待 `trylo`。改为期待实际目录名，继续严格检查相对路径。 |
| Windows 工作区键的大小写断言过时 | 实现将 Windows 路径键统一小写，原断言期待大写盘符。修正期望，并额外验证不同大小写输入产生同一工作区键。 |
| Chrome DevTools 参数断言遗漏 observer 合同 | 原断言只允许两个固定参数，遗漏 headless、viewport 和 CDP 参数。改为完整校验当前参数序列、端口格式及范围、loopback 地址，保留隔离与关闭遥测要求。 |

ModeChip 旧测试还沿用了 listbox/option 和英文选项文本，随 B05 更新为当前菜单合同及实际中文标签。没有删除测试、降低精确性或跳过失败来消除结果。

## 4. 修改文件清单

相对于 `F:\trylo`。本轮源代码/测试共 13 个文件：5 个产品文件、8 个测试文件；其中新增 2 个测试文件，新增测试用例共 8 项。

| 文件 | 类型 | 目的 |
| --- | --- | --- |
| `new trylo cli/src/internal/adapters/tools/read-only/glob-match.ts` | 修改 | B01、B02：路径段及字符类语法 |
| `new trylo cli/src/internal/adapters/tools/read-only/glob-match.test.ts` | 新增 | 3 项匹配器回归 |
| `new trylo cli/src/internal/domain/schedule-cron.test.ts` | 修改 | 修正时区相关测试合同 |
| `desktop/src/components/chat/ModePopover.tsx` | 修改 | B03–B05：焦点、键盘及分组语义 |
| `desktop/src/components/chat/ModeChip.tsx` | 修改 | B05：触发器菜单类型 |
| `desktop/src/components/chat/ModePopover.focus.test.tsx` | 新增 | 3 项菜单操作回归 |
| `desktop/src/components/chat/ModeChip.test.tsx` | 修改 | 当前菜单语义与选择合同 |
| `desktop/src/components/chat/file-change.test.ts` | 修改 | 修正工作区项目名样例 |
| `desktop/src/host-adapter/conversation-history.test.ts` | 修改 | Windows 键规范化合同 |
| `mobile-app/src/remoteConnection.ts` | 修改 | B06：消息形状检查 |
| `mobile-app/src/remoteCache.ts` | 修改 | B07：缓存读写共用清理 |
| `mobile-app/tests/remote-connection.test.mjs` | 修改 | 2 项异常消息/缓存回归 |
| `desktop-services/tests/services/tooling-pr7.test.mjs` | 修改 | 当前 CDP 启动参数完整合同 |

报告、计划、证据及 CLI 要求的 [阶段记录](../new%20trylo%20cli/docs/02-分期工程产出/P00-工程地基与质量门禁/evidence/2026-10-16-DEBUG03.md) 另计，不包含于上述 13 个文件。

## 5. 验证结果

| 检查 | 修复前/基线 | 最终结果 |
| --- | --- | --- |
| Desktop 全量 Vitest | 2647 项：2626 通过、21 失败 | 2650 项：2633 通过、17 失败 |
| CLI 编译产物 hermetic 测试 | 542 文件，4092 项：4079 通过、7 失败、6 跳过 | 543 文件，4095 项：4089 通过、0 失败、6 跳过 |
| CLI 官方入口附带的 stale-artifact 测试 | — | 1 通过 |
| 移动端连接及真实本机网关 | 前轮 11 通过 | 13 通过 |
| 移动端 UI/客户端合同 | 21 通过 | 21 通过 |
| 移动端生产构建 | — | 通过；保留现有大 bundle 警告 |
| Desktop TypeScript 检查 | 通过 | 通过 |
| CLI 单独 TypeScript 编译 | 通过 | 通过 |
| 移动端 TypeScript 检查 | 通过 | 通过 |
| 服务端官方 `npm test` | 前轮 479 通过、2 失败、5 跳过 | 480 通过、1 失败、5 跳过 |
| Work 官方 `npm test` | 前轮 347 通过、6 失败 | 347 通过、6 失败 |
| Git 空白字符检查 | — | 通过 |

局部回归也已通过：glob 12 项、cron 15 项、模式菜单 8 项；它们属于相应全量测试的子集，不重复相加。

CLI 官方 `npm test` 和 `npm run verify` 都在构建时缺少 `vendor-bin/srt-win-x64.exe`，没有被标记为通过。完整质量门禁 11 步中 9 步通过；标为 typecheck 的步骤实际失败在编译后的 vendor 复制，unit-tests 步骤同样被构建阻断。独立 TypeScript 编译已通过。格式、静态卫生、架构、38 项合同测试、状态转换、许可证/SBOM、源码扫描及文档存在检查均通过。

补充诊断使用项目自身的测试发现规则、每组 30 个文件、4 文件并发、20 秒测试超时。初次最终复验误与质量流程的编译目录清理重叠，该批结果已作废；报告只采用质量流程结束后重新编译、顺序执行的最终结果。补充诊断不代替原生辅助程序、标准打包或真实发行验收。

## 6. 真实浏览器与 UI 审查

内置浏览器驱动遭遇 Windows 隔离启动错误，改用环境已提供的 Playwright 和已安装 Chrome，无新增浏览器依赖。访问实际 Vite 开发页面 `http://127.0.0.1:1420/`，操作实际 InputBar 使用的模式菜单。

- 1280×900、360×900：点击打开，Home/End 导航，Esc 返回焦点，选择“对话”返回触发器，Tab 关闭并前进到“默认模型”，全部通过。
- 菜单矩形：桌面 x≈373、宽260；360窗口 x92、宽260，均在窗口范围内。两个窗口的文档宽度均等于窗口宽度。
- 截图已实际查看：[1280 菜单](Trylo-Bugfix-2026-10-16-feat-Debug-evidence/menu-1280.png)、[360 菜单](Trylo-Bugfix-2026-10-16-feat-Debug-evidence/menu-360.png)。360 为桌面应用的压力检查，整体界面仍显狭窄，不能据此宣称完成移动端布局适配。
- 作用域审查使用获取到的 [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)，核对按钮语义、菜单名称/选中态、分组、键盘及可见焦点。原有焦点样式保留，无需新增样式。
- 没有观察到菜单操作产生的页面异常。页面启动保留两条 HTTP 500：默认示例工作区 `C:/trylo-workspace/.trylo/team-runs.json`、`team-profiles.json` 不存在。它们已列入证据，没有宣称控制台全净。
- 未运行全站 axe、屏幕阅读器或性能指标验收；本次浏览器结果限于所列交互与布局。原生 Tauri/WebView2 不等同于网页预览。

## 7. 剩余失败与限制

Desktop 的 17 项失败分为：

1. CLI scoped MCP browser 集成 5 项、原生浏览器启动工具发现 1 项。没有观测到预期浏览器工具；源码快照没有测试所引用的 `new_tool/browser/playwright-mcp`，尚未恢复完整浏览器工具运行环境。不能把所有后续问题一概归为缺失资源。
2. 旧顶栏 mode pill 的 5 项 CSS 断言仍要求当前页面已不存在的 `.top-bar__modes`。本轮保留该过时组件合同，未凭空恢复旧 UI 或删除测试；需要按当前顶栏/模式入口架构单独迁移测试。
3. Team/seat/profile 的 6 项合同读取快照未提供的旧 `trylo cli` 源码。

服务端剩 1 项缺少 `windows_mcp` vendor 源码，官方脚本在此退出，没有继续执行尾部桌宠 smoke。Work 的 6 项仍分别缺少 CoWork vendor 文件（1）及真实录制历史（5）。没有复制未经审计的第三方源码或伪造录制历史。

CLI 的原生辅助文件缺失仍阻断完整构建/测试入口。未运行原生安装包、Windows WebView2 交互、Android 真机、真实模型端点或外部程序持锁压力验收。当前通过项不能代替这些验收。

## 8. 证据与复验

主要证据入口：[summary.json](Trylo-Bugfix-2026-10-16-feat-Debug-evidence/summary.json)。

- `glob-red.txt / glob-green.txt`：3 项新增匹配器测试修复前全失败，修复后含既有合同共12项通过。
- `menu-red.txt / menu-green.txt`：3项键盘回归修复前失败，修复后含ModeChip共8项通过。
- `mobile-red.txt / mobile-green.txt`：异常消息和缓存修复前2项失败；最终远程/网关13项通过。
- `cron-green.txt`、`cli-targeted-baseline.txt`：时间边界断言修正前后。
- `desktop-baseline.json / desktop-final.json`：完整桌面测试及精确失败名称。
- `cli-baseline-discovery.json / cli-final-discovery.json` 与各 chunk 日志：全部 CLI 补充诊断。
- `cli-standard-baseline.txt / cli-verify.txt / cli-verify-result.json`：官方入口和质量门禁的真实失败。
- `mobile-ui-final.txt / mobile-build-final.txt / services-final.txt / work-final.txt`：其他模块结果。
- `browser-verification.json` 与 PNG：浏览器尺寸、焦点、请求错误及截图。

各模块目录中的复验命令：

```powershell
# desktop
node node_modules/vitest/vitest.mjs run --maxWorkers=4 --minWorkers=1
node node_modules/typescript/bin/tsc --noEmit

# new trylo cli；官方入口需先补齐可信原生制品
npm.cmd test
npm.cmd run verify
node node_modules/typescript/bin/tsc -p tsconfig.json
node --test dist/internal/adapters/tools/read-only/glob-match.test.js dist/internal/adapters/tools/read-only/glob.test.js dist/internal/domain/schedule-cron.test.js

# mobile-app
node --test tests/remote-connection.test.mjs tests/remote-gateway-integration.test.mjs
npm.cmd run test:remote:ui
npm.cmd run build

# desktop-services、work，各自执行
npm.cmd test
```

不要在运行 CLI 测试时并行执行会清理 `dist` 的构建/质量流程。

## 9. 自审与回滚

- 可读性/维护性：PASS。glob 复用现有边界扫描；缓存读写共用一套消息清理；菜单关闭焦点逻辑有局部所有者。未增加通用框架或全局状态。
- 架构：PASS。CLI 改动限于纯文件匹配适配器及测试；未改变 Loop、协议、存储格式或学习控制面。
- 正确性/恢复：有修复前失败、修复后回归和浏览器焦点证据；无效消息与缓存不再进入正常显示路径。
- 权限/隐私：未扩大文件工具权限，未更改审批或网络授权。浏览器使用示例工作区，没有真实凭据。
- 供应链：未引入依赖或修改锁文件。CLI 现有许可证/SBOM 门禁通过，不据此宣称完整发行拓扑已完成合规验收。
- 回滚：只审查并还原第4节13个文件，本轮新增的两个测试文件可单独移除；记录可保留。先确认没有叠加用户修改，不使用全仓重置，不撤销 Debuglog02 的修复或 Debuglog01 的移动。

本轮已完成所述缺陷修复和扩大验证，剩余失败、资源缺失及未执行范围均保持可见；项目仍未达到全量发行验收状态。
