// Architecture fixture — NEVER compiled (lives under testdata/, not src/).
// The settings boundary scanner must flag every import below as a violation.
import { runLoop } from "../../src/internal/loop/runner.js";
import { cliSurface } from "../../src/internal/surface/cli/config-load.js";
import { credentials } from "../../src/internal/credentials/store.js";
import { mcpRegistry } from "../../src/internal/mcp/registry.js";
import { learning } from "../../src/internal/learning/control.js";
import { mergeConfigLayers } from "../../src/internal/config/layers.js";
import { cmdMain } from "../../src/cmd/trylo/main.js";

export const all = [runLoop, cliSurface, credentials, mcpRegistry, learning, mergeConfigLayers, cmdMain];
