import type { SubmitProposalCommand } from "../../learning/control/commands.js";
import type { WorkflowDraft } from "../../learning/domains/workflow/inducer.js";
import type { ContentProposalAdmission } from "../contract/admission.js";
import type { MappingResult } from "../contract/rejection.js";
import { rejected } from "../contract/rejection.js";
import { isNonEmptyString } from "../shared/validate.js";
import { buildContentProposal, checkDraftStatus } from "./proposal.js";
import { proposalSourceFor } from "./scope.js";

/** `WorkflowDraft` → `submit_proposal`。workflow 不得改变 team 拓扑，因此该字段必须恒 false。 */
export function mapWorkflowDraft(
  draft: WorkflowDraft,
  admission: ContentProposalAdmission,
): MappingResult<readonly SubmitProposalCommand[]> {
  const statusFailure = checkDraftStatus(draft.status);
  if (statusFailure !== undefined) {
    return statusFailure;
  }
  if (draft.permissionClaim !== false) {
    return rejected("authority_claim_present", "a workflow draft must never claim permission");
  }
  if (draft.teamTopologyChanged !== false) {
    return rejected(
      "authority_claim_present",
      "a workflow draft cannot change team topology",
    );
  }
  if (!isNonEmptyString(draft.identity)) {
    return rejected("missing_scope", "workflow draft has no identity");
  }
  if (!isNonEmptyString(admission.scope)) {
    return rejected(
      "missing_scope",
      "workflow drafts carry no scope; it must be admitted explicitly",
    );
  }
  return buildContentProposal(
    {
      proposalId: draft.id,
      assetKind: "workflow",
      scope: admission.scope,
      candidateRef: `workflow:${draft.identity}:${String(draft.version)}`,
      source: proposalSourceFor(draft.provenance.source),
      observationRefs: draft.provenance.observationRefs,
    },
    admission,
    { requireBaseVersion: draft.version > 1 },
  );
}
