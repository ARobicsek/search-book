#!/usr/bin/env node
// probe-ics.mjs — fail-fast diagnostic for the "import Outlook meetings" idea.
//
// Zero dependencies (Node 18+ global fetch). It does NOT touch the DB or the app —
// it just fetches/reads an Outlook "published calendar" .ics feed and reports which
// fields are actually present, so we know in seconds whether the auto-fill-attendees
// plan is viable via ICS *before* writing any feature code.
//
// Usage:
//   node server/scripts/probe-ics.mjs "https://outlook.office365.com/owa/calendar/.../calendar.ics"
//   node server/scripts/probe-ics.mjs ./my-calendar.ics          # a downloaded/exported file
//   node server/scripts/probe-ics.mjs <src> --json               # machine-readable
//   node server/scripts/probe-ics.mjs <src> --show 5             # print N sample events (default 3)
//
// The make-or-break line in the output is "Attendee emails present" — published ICS
// feeds frequently strip attendees for privacy, which would kill the zero-typing goal.

import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
const asJson = args.includes('--json');
const showN = (() => {
  const i = args.indexOf('--show');
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : 3;
})();

if (!src) {
  console.error('Usage: node server/scripts/probe-ics.mjs <ics-url-or-file> [--json] [--show N]');
  process.exit(2);
}

async function load(source) {
  if (/^https?:\/\//i.test(source)) {
    // Outlook sometimes 403s a bare client; send a normal UA + ICS Accept header.
    const res = await fetch(source, {
      headers: { 'User-Agent': 'Mozilla/5.0 SearchBook-ICS-Probe', Accept: 'text/calendar,*/*' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} fetching the feed`);
    const ct = res.headers.get('content-type') || '';
    const body = await res.text();
    return { body, contentType: ct };
  }
  return { body: await readFile(source, 'utf8'), contentType: '(local file)' };
}

// RFC 5545 line unfolding: a CRLF (or LF) followed by a space/tab continues the prior line.
function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

// Split a property line "NAME;PARAM=x;PARAM2=y:VALUE" into { name, params, value }.
function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(';');
  const name = parts[0].toUpperCase();
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq > -1) params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
  }
  return { name, params, value };
}

function extractEvents(text) {
  const lines = unfold(text).split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const raw of lines) {
    if (raw === 'BEGIN:VEVENT') { cur = { attendees: [], raw: {} }; continue; }
    if (raw === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const p = parseLine(raw);
    if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value; break;
      case 'SUMMARY': cur.summary = p.value; break;
      case 'LOCATION': cur.location = p.value; break;
      case 'DTSTART': cur.start = p.value; cur.startTzid = p.params.TZID || (/Z$/.test(p.value) ? 'UTC' : null); break;
      case 'DTEND': cur.end = p.value; break;
      case 'RRULE': cur.rrule = p.value; break;
      case 'ORGANIZER': cur.organizer = p.params.CN || p.value; break;
      case 'LAST-MODIFIED': cur.lastModified = p.value; break;
      case 'ATTENDEE': {
        const email = (p.value.match(/mailto:(.+)$/i) || [])[1] || null;
        cur.attendees.push({ name: p.params.CN || null, email });
        break;
      }
    }
  }
  return events;
}

function pct(n, d) { return d ? `${n}/${d} (${Math.round((n / d) * 100)}%)` : '0/0'; }

function fmtDt(v) {
  if (!v) return '—';
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return v;
  return m[4] ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

(async () => {
  let loaded;
  try {
    loaded = await load(src);
  } catch (e) {
    console.error(`\n❌ Could not load the feed: ${e.message}`);
    console.error('   If this is a published-calendar URL, double-check it resolves in a browser.\n');
    process.exit(1);
  }

  const { body, contentType } = loaded;
  const looksLikeIcs = /BEGIN:VCALENDAR/.test(body);
  const prodid = (body.match(/PRODID:(.+)/) || [])[1]?.trim() || '(none)';
  const events = looksLikeIcs ? extractEvents(body) : [];

  const total = events.length;
  const withSummary = events.filter((e) => e.summary).length;
  const withStart = events.filter((e) => e.start).length;
  const withTz = events.filter((e) => e.startTzid).length;
  const withEnd = events.filter((e) => e.end).length;
  const withOrganizer = events.filter((e) => e.organizer).length;
  const recurring = events.filter((e) => e.rrule).length;
  const withAnyAttendee = events.filter((e) => e.attendees.length > 0).length;
  const totalAttendees = events.reduce((s, e) => s + e.attendees.length, 0);
  const attendeesWithEmail = events.reduce((s, e) => s + e.attendees.filter((a) => a.email).length, 0);
  const eventsWithEmailAttendee = events.filter((e) => e.attendees.some((a) => a.email)).length;

  const starts = events.map((e) => e.start).filter(Boolean).sort();
  const lastMods = events.map((e) => e.lastModified).filter(Boolean).sort();

  if (asJson) {
    console.log(JSON.stringify({
      source: src, contentType, looksLikeIcs, prodid, total,
      coverage: { withSummary, withStart, withTz, withEnd, withOrganizer, recurring, withAnyAttendee, totalAttendees, attendeesWithEmail, eventsWithEmailAttendee },
      range: { earliest: starts[0] || null, latest: starts[starts.length - 1] || null },
      maxLastModified: lastMods[lastMods.length - 1] || null,
    }, null, 2));
    return;
  }

  const L = [];
  L.push('');
  L.push('═══ ICS PROBE ═══════════════════════════════════════════════');
  L.push(`Source         : ${src}`);
  L.push(`Content-Type   : ${contentType}`);
  L.push(`PRODID         : ${prodid}`);
  L.push(`Looks like ICS : ${looksLikeIcs ? 'yes' : 'NO  ← not a calendar feed (got HTML/login page?)'}`);
  if (!looksLikeIcs) {
    L.push('');
    L.push('First 200 chars of the body (to debug what came back instead):');
    L.push('  ' + body.slice(0, 200).replace(/\n/g, ' '));
    console.log(L.join('\n'));
    process.exit(1);
  }
  L.push(`VEVENTs found  : ${total}`);
  if (starts.length) L.push(`Event range    : ${fmtDt(starts[0])}  …  ${fmtDt(starts[starts.length - 1])}`);
  if (lastMods.length) L.push(`Newest LAST-MODIFIED: ${fmtDt(lastMods[lastMods.length - 1])}  (staleness gauge)`);
  L.push('');
  L.push('─── Field coverage across all events ───');
  L.push(`  SUMMARY (subject)   : ${pct(withSummary, total)}`);
  L.push(`  DTSTART (date/time) : ${pct(withStart, total)}   with TZID: ${withTz}`);
  L.push(`  DTEND               : ${pct(withEnd, total)}`);
  L.push(`  ORGANIZER           : ${pct(withOrganizer, total)}`);
  L.push(`  RRULE (recurring)   : ${recurring}`);
  L.push(`  ATTENDEE lines      : ${totalAttendees} total across ${pct(withAnyAttendee, total)} events`);
  L.push(`     └ with email     : ${attendeesWithEmail} of ${totalAttendees}  (${eventsWithEmailAttendee} events have ≥1 email attendee)`);

  const sample = events.slice(0, showN);
  if (sample.length) {
    L.push('');
    L.push(`─── First ${sample.length} event(s) ───`);
    for (const [i, e] of sample.entries()) {
      const att = e.attendees.length
        ? e.attendees.map((a) => `${a.name || '?'}${a.email ? ` <${a.email}>` : ' <no-email>'}`).join(', ')
        : '(none)';
      L.push(`  [${i + 1}] ${e.summary || '(no subject)'}`);
      L.push(`       when: ${fmtDt(e.start)}–${fmtDt(e.end)}${e.startTzid ? ` (${e.startTzid})` : ''}${e.rrule ? '  [recurring]' : ''}`);
      L.push(`       attendees (${e.attendees.length}): ${att}`);
    }
  }

  L.push('');
  L.push('─── VERDICT (make-or-break for zero-typing import) ───');
  L.push(`  Subject usable   : ${withSummary > 0 ? '✅ yes' : '❌ no'}`);
  L.push(`  Date/time usable : ${withStart > 0 ? '✅ yes' : '❌ no'}`);
  const emailVerdict = attendeesWithEmail > 0
    ? '✅ YES — attendee emails present → participants can auto-match to contacts'
    : (totalAttendees > 0
      ? '⚠️  names but NO emails → matching is fuzzy (name-only); auto-fill weaker'
      : '❌ NO attendees in the feed → emails/names stripped; ICS alone can\'t auto-fill the room (consider Graph)');
  L.push(`  Attendee emails  : ${emailVerdict}`);
  L.push('═════════════════════════════════════════════════════════════');
  L.push('');
  console.log(L.join('\n'));
})();
