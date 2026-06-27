/**
 * Turn a finding into a ready-to-send vendor email. The top findings each get a
 * drafted message stating the leverage and the specific number to ask for.
 */
import { EmailDraftSchema, type Finding, type EmailDraft } from "../types";
import { slug } from "../docmodel/serialize";
import { selectBuilder } from "./templates";

function vendorInbox(vendorName: string): string {
  return `accounts@${slug(vendorName).replace(/-/g, "")}.com`;
}

export function draftEmail(f: Finding): EmailDraft {
  const { subject, body } = selectBuilder(f)(f);
  return EmailDraftSchema.parse({
    findingId: f.id,
    vendorName: f.vendorName,
    to: vendorInbox(f.vendorName),
    subject,
    body,
    category: f.category,
  });
}

/** Draft emails for the top-N ranked findings. */
export function draftEmailsForTop(findings: Finding[], n = 10): EmailDraft[] {
  return findings.slice(0, n).map(draftEmail);
}
