// 反向夹具（只被测试当文本读，不参与编译）。
// 这些是投影层**允许**的依赖方向：协议合同与端口，检测器不得误报。
import "../../protocol/envelope.js";
import "../../protocol/acp-map.js";
import "../../ports/transport.js";
import "./frames.js";
