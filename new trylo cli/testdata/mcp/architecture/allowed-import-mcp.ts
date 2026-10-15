// Discriminating fixture: only relative imports within the package's own
// contract surface, so the boundary detector must stay dark on it.
// Never compiled; read as text by the boundary scanner.
import { A } from "./jsonrpc.js";
import { B } from "../ports/mcp-registry.js";
import { C } from "../protocol/envelope.js";