// Calendar entries that are never meetings.
//
// The owner's Outlook calendar carries blocks that look like events but hold nothing a
// CRM wants: a standing lunch hold, Outlook's own "Private Appointment" placeholder for
// events whose details a published feed strips, and travel logistics (flights, hotels,
// drive time) that the calendar tracks and SearchBook shouldn't.
//
// These are FLAGGED, not dropped from the response: `/calendar/events` returns them with
// `excluded: true`, the import dialog hides them behind a "N not shown" disclosure, and
// they are never part of the default selection or "Select all". A rule can over-match
// ("Hotel Industry Roundtable" starts with "Hotel"), so a real meeting caught by one has
// to stay recoverable — silently vanishing from the picker would be worse than a row the
// owner has to tick by hand. That opt-in is also why `/calendar/import` does NOT re-check
// this: what it receives is what the owner explicitly ticked.

/** Whole-subject matches (case- and whitespace-insensitive). */
const EXCLUDED_EXACT = ['lunch', 'private appointment', 'travel time'];

/** Matched as the first WORD of the subject — "Flight to ORD", "Hotel — Marriott". */
const EXCLUDED_FIRST_WORD = ['flight', 'flights', 'hotel', 'hotels'];

/** lowercase, trimmed, internal runs of whitespace collapsed to one space */
function normalize(subject: string): string {
  return subject.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isExcludedSubject(subject: string | null | undefined): boolean {
  if (!subject) return false; // "(no subject)" stays importable — it may still be a real meeting
  const s = normalize(subject);
  if (EXCLUDED_EXACT.includes(s)) return true;
  // Split on the first non-word character so "Hotel:", "Hotel —" and "Hotel Marriott"
  // all yield "hotel", while "Hotelier sync" yields "hotelier" and is kept.
  const firstWord = s.split(/[^a-z0-9']+/)[0];
  return EXCLUDED_FIRST_WORD.includes(firstWord);
}
