# testdata/credentials

凭证账本库的测试夹具。

## architecture/

边界扫描的判别性夹具 (`src/internal/credentials/boundary.test.ts`)：

- `forbidden-import-credentials.ts` — 故意 import 全部禁区与一个裸包。扫描器必须每条都命中。**不参与编译**（不在 `src/` 下）。
- `allowed-import-credentials.ts` — 只 import 相对路径与 `node:` 内建。扫描器必须零命中。

两份夹具的作用是让「0 命中」这一断言具备判别力：一个永远通过的扫描器和一个目录写错、正则写坏的扫描器，输出是一样的。
