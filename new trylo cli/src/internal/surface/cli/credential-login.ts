import type { CredentialFailure, CredentialLoginInput } from "../../ports/credentials.js";
import type { CliContext } from "./context.js";
import { createCliCredentialPortWithReport, credentialWarningTo } from "./credentials-wiring.js";

export type StoredCredential = {
  readonly accountId: string;
  readonly scope: "user" | "project";
  readonly label?: string;
};

/** Commands and connection forms share the ledger operation; its public result has no secret. */
export function storeCredential(ctx: CliContext, input: CredentialLoginInput): { readonly ok: true; readonly value: StoredCredential } | CredentialFailure {
  const stored = createCliCredentialPortWithReport(ctx, credentialWarningTo(ctx)).login(input);
  if (!stored.ok) return stored;
  return { ok: true, value: { accountId: stored.value.accountId, scope: input.scope ?? "user", ...(stored.value.label === undefined ? {} : { label: stored.value.label }) } };
}
