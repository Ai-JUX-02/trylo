import type { McpRegistryPort } from "../../ports/mcp-registry.js";

/** Immutable run configuration wins by server id; management still writes the base registry. */
export function withRuntimeRegistry(base: McpRegistryPort, runtime: McpRegistryPort, mode: "overlay" | "exclusive"): McpRegistryPort {
  return {
    ...base,
    async names() {
      const supplied = await runtime.names();
      if (!supplied.ok || mode === "exclusive") return supplied;
      const original = await base.names();
      if (!original.ok) return original;
      return { ok: true, value: [...new Set([...original.value, ...supplied.value])].sort() };
    },
    async resolve(name) {
      const supplied = await runtime.names();
      if (!supplied.ok) return supplied;
      if (supplied.value.includes(name) || mode === "exclusive") {
        const result = await runtime.resolve(name);
        return result.ok ? { ok: true, value: { ...result.value, scope: "project", shadowedScopes: [] } } : result;
      }
      return base.resolve(name);
    },
    async list() {
      const supplied = await runtime.list();
      if (!supplied.ok) return supplied;
      const servers = supplied.value.servers.map(entry => ({ ...entry, scopes: ["project" as const] }));
      if (mode === "exclusive") return { ok: true, value: { ...supplied.value, servers } };
      const original = await base.list();
      if (!original.ok) return original;
      const merged = new Map(original.value.servers.map(entry => [entry.name, entry]));
      for (const entry of servers) merged.set(entry.name, entry);
      return { ok: true, value: { ...supplied.value, servers: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)) } };
    },
  };
}
