// Discriminating fixture: every forbidden import this package must avoid.
// Never compiled; read as text by the boundary scanner to prove the detector
// can actually see each violation.
import { runner } from "../../loop/runner.js";
import { wiring } from "../../surface/cli/wiring.js";
import { main } from "../../cmd/trylo/main.js";
import { apply } from "../../learning/control/apply-job.js";
import { trust } from "../../tooling/catalog/mcp-trust.js";
import { tools } from "../../ports/tools.js";
import something from "some-bare-package";