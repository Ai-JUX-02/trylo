# 2026-09-18 ENG-0 基线与证据记录

> 日期：2026-09-18  
> 责任人：Antigravity Agent  
> 关联方案：`2026-09-18-方案-新Trylo-CLI代码质量与工程化优化.md`  
> 里程碑：ENG-0（版本与证据基线）+ 立即项（keyring 4-fail 分层止血）

---

## 1. 运行环境与依赖锁定

- **操作系统**：Windows_NT x64 10.0.19045
- **Node.js**：v24.14.1
- **npm**：11.11.0
- **TypeScript**：5.8.3
- **package.json SHA256**：`66DF804B89414A1564D17F449BDC224D1837112F62D4CE6ECCD83C55A6A46701`
- **package-lock.json SHA256**：`EC6F34A1E90EEF2337DA9D6454E654DEA29F9831F40F4110DA8E918DDEC421B0`

---

## 2. Git 拓扑决策落地

- **拍板选项**：**选项 A**（父仓直接跟踪 `new trylo cli/` 子目录）
- **依据**：与父仓《发布纪律.md》完全契约一致，历史连续，零迁移阻断。
- **.gitignore 规则**：已落地，严格忽略 `node_modules/`、`dist/`、`coverage/`、`.trylo/`、`tmp/`、`*.log`、`*.tsbuildinfo`。
- **Baseline Commit**：`0d569a3ec23ac940ed48161356d9aa45244abea1`（2026-09-18，分支 `feat/trylo-alpha`）
- **Tracked Files**：2674
- **Commit Message**：`feat(new-cli): ENG-0 baseline commit — new trylo cli 首次纳入版本控制`
- **验证命令**：`git ls-files -- "new trylo cli/" | wc -l` → 2674

---

## 3. 立即项（keyring 4-fail 分层止血）验收证据

- **问题根因**：Windows Credential Manager 真实写入在特定无交互凭据上下文（Win32 1312）下失败，导致主门禁在不同环境产生 `1860 pass / 0 fail` 与 `1855 pass / 4 fail` 漂移。
- **分层举措**：
  1. 真实系统 Credential Manager 读写测试移入独立 platform 测试套件：`keyring-win32.platform.test.ts`、`keyring-optin.platform.test.ts`。
  2. 主测试套件 `keyring-win32.test.ts` 改为基于注入 `SpawnSyncImpl` double 的 100% Hermetic 测试，覆盖 probe、read、write、delete、2560 字节超限、参数密钥脱敏与错误回执。
  3. `package.json` 与 `run-tests.mjs` 增设 `--layer=hermetic` 与 `--layer=platform` 分层开关。
- **实测数据**：
  - **Hermetic 主门禁**（`npm test`）：
    ```text
    TEST-DISCOVERY (layer=hermetic) count=247
    ℹ tests 1863
    ℹ suites 3
    ℹ pass 1862
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 1
    ℹ duration_ms ~16513ms
    TEST-NAMES count=1855
    exit code 0
    ```
  - **Platform 平台门禁**（`npm run test:platform`）：
    ```text
    TEST-DISCOVERY (layer=platform) count=2
    dist/internal/adapters/credentials/keyring-win32.platform.test.js
    dist/internal/surface/cli/keyring-optin.platform.test.js
    ✔ probe reports the live Credential Manager as available
    ✔ write then read round-trips a whole ledger document through Credential Manager
    ✔ reading a target that was never stored is undefined, not an error
    ✔ remove clears the entry, and removing a missing entry is not an error
    ✔ a document above the 2560-byte Credential Manager blob limit is refused before spawn
    ✔ the secret never appears in the child process argv
    ✔ a real Credential Manager round trip through the opt-in wiring leaves no trace
    ℹ tests 7 / pass 7 / fail 0
    exit code 0
    ```
