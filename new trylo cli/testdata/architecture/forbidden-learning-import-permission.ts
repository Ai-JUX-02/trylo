// Negative fixture, loaded by src/internal/learning/io-boundary.test.ts
// ("the detector fails closed on a learning file that imports permission,
// adapters, loop or UI"). Proves the layer check catches all four: permission,
// provider adapter, loop reducer, desktop UI.
import { grantPermission } from "../../permission/index.js";
import { createAdapter } from "../adapters/provider-openai.js";
import { reduceExecution } from "../../loop/reducer.js";
import { renderChat } from "../../../desktop/ui/render.js";

export function forbidden(): unknown {
  return [grantPermission, createAdapter, reduceExecution, renderChat];
}
