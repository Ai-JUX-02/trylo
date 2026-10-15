// 判别力夹具（只被测试当文本读，不参与编译）。
// 投影层不是组合根，不得碰 CLI 表面、命令入口或适配器。
import "../cli/host.js";
import "../../cmd/trylo/main.js";
import "../../adapters/session-store/ndjson.js";
