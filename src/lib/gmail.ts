/**
 * Gmail integration without a backend. The Gmail web compose deep-link opens a
 * fully pre-filled compose window — a draft the user only has to review and
 * send. (A production "Connect Gmail" would use OAuth + the Gmail API
 * drafts.create endpoint to write the draft straight into their mailbox; the
 * deep-link gives the same "ready to send" outcome with zero auth.)
 */
import type { EmailDraft } from "./types";

/** Opens Gmail web with To/Subject/Body pre-filled (a ready draft). */
export function gmailComposeUrl(d: EmailDraft): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    tf: "1",
    to: d.to,
    su: d.subject,
    body: d.body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/** mailto: fallback for users whose default client isn't Gmail web. */
export function mailtoUrl(d: EmailDraft): string {
  const params = new URLSearchParams({ subject: d.subject, body: d.body });
  return `mailto:${encodeURIComponent(d.to)}?${params.toString()}`;
}
