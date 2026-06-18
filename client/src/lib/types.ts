export type Ecosystem = 'PAYER' | 'PROVIDER' | 'GOVERNMENT' | 'ACADEMIA' | 'HEALTH_TECH' | 'POLICY' | 'MEDIA' | 'FUNDER' | 'NCQA' | 'NETWORK' | 'RECRUITER' | 'CONSULTANT';
export type ContactStatus = 'NONE' | 'RESEARCHING' | 'CONNECTED' | 'AWAITING_RESPONSE' | 'FOLLOW_UP_NEEDED';
export type CompanyStatus = 'NONE' | 'RESEARCHING' | 'ENGAGED' | 'PARTNER' | 'CONNECTED';

export interface Contact {
  id: number;
  name: string;
  title: string | null;
  roleDescription: string | null;
  companyId: number | null;
  company: { id: number; name: string } | null;
  companyName: string | null;
  additionalCompanyIds: string | null; // JSON array of company IDs
  ecosystem: Ecosystem;
  email: string | null;
  additionalEmails: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  location: string | null;
  photoUrl: string | null;
  photoFile: string | null;
  status: ContactStatus;
  howConnected: string | null;
  referredById: number | null;
  referredBy: { id: number; name: string } | null;
  referrals: { id: number; name: string }[];
  mutualConnections: string | null;
  whereFound: string | null;
  openQuestions: string | null;
  notes: string | null;
  personalDetails: string | null;
  usefulFor: string | null; // What this person could help with in future; non-empty = a "useful person"
  flagged: boolean;
  createdAt: string;
  updatedAt: string;
  lastOutreachDate?: string | null;
  lastOutreachDatePrecision?: DatePrecision | null;
  employmentHistory?: EmploymentHistory[];
}

export function parseContactEmails(contact: Contact): string[] {
  const emails: string[] = [];
  if (contact.email) emails.push(contact.email);
  if (contact.additionalEmails) {
    try {
      const additional = JSON.parse(contact.additionalEmails);
      if (Array.isArray(additional)) emails.push(...additional);
    } catch { /* ignore parse errors */ }
  }
  return emails;
}

export interface Company {
  id: number;
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  hqLocation: string | null;
  notes: string | null;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { contacts: number };
  contacts?: { id: number; name: string; title: string | null; ecosystem: Ecosystem; status: ContactStatus }[];
}

export const ECOSYSTEM_OPTIONS: { value: Ecosystem; label: string }[] = [
  { value: 'PAYER', label: 'Payer / Health Plan' },
  { value: 'PROVIDER', label: 'Provider / Health System' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'ACADEMIA', label: 'Academia' },
  { value: 'HEALTH_TECH', label: 'Health Tech / Vendor' },
  { value: 'POLICY', label: 'Policy / Think Tank' },
  { value: 'MEDIA', label: 'Media / Press' },
  { value: 'FUNDER', label: 'Funder / Philanthropy' },
  { value: 'NCQA', label: 'NCQA Internal' },
  { value: 'NETWORK', label: 'General Network' },
  { value: 'RECRUITER', label: 'Recruiter' },
  { value: 'CONSULTANT', label: 'Consultant' },
];

export const CONTACT_STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: 'NONE', label: '—' },
  { value: 'RESEARCHING', label: 'Researching' },
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'AWAITING_RESPONSE', label: 'Awaiting Response' },
  { value: 'FOLLOW_UP_NEEDED', label: 'Follow-Up Needed' },
];

export const COMPANY_STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: 'NONE', label: '—' },
  { value: 'RESEARCHING', label: 'Researching' },
  { value: 'ENGAGED', label: 'Engaged' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'CONNECTED', label: 'Connected' },
];

// ─── Actions ─────────────────────────────────────────────────

export type ActionType = 'EMAIL' | 'CALL' | 'MEET' | 'READ' | 'WRITE' | 'RESEARCH' | 'FOLLOW_UP' | 'INTRO' | 'OTHER';
export type ActionPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type ActionDirection = 'OWED_BY_ME' | 'WAITING_ON_THEM';

export interface Action {
  id: number;
  title: string;
  description: string | null;
  type: ActionType;
  dueDate: string | null;
  completed: boolean;
  completedDate: string | null;
  contactId: number | null;
  contact: { id: number; name: string; company?: { name: string } | null; companyName?: string | null } | null;
  companyId: number | null;
  company: { id: number; name: string } | null;
  conversationId: number | null;
  conversation: { 
    id: number; 
    summary: string | null;
    title?: string | null;
    attendeesDescription?: string | null;
    contact?: { name: string } | null;
    company?: { name: string } | null;
    participants?: { contact: { name: string } }[];
  } | null;
  priority: ActionPriority;
  direction: ActionDirection; // derived mirror of owedByMe/owerContactIds — still read by dashboard/list/detail
  owedByMe: boolean; // Task 3: the removable "me" chip
  owerContactIds: string | null; // Task 3: JSON array of contact ids who owe it
  owers?: { id: number; name: string }[]; // server-resolved owerContactIds → people you're waiting on

  recurring: boolean;
  recurringIntervalDays: number | null;
  recurringEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  actionContacts?: { contact: { id: number; name: string; company?: { name: string } | null; companyName?: string | null } }[];
  actionCompanies?: { company: { id: number; name: string } }[];
}

// Which people to surface on a compact action card: the person(s) you're waiting on
// (owers) when the action is owned by someone else, otherwise the related contact(s).
// `waiting` lets callers add a "waiting on" cue so an ower doesn't read as a related contact.
export function actionDisplayPeople(action: Action): { people: { id: number; name: string }[]; waiting: boolean } {
  if (action.owers?.length) {
    return { people: action.owers, waiting: true };
  }
  const people = action.actionContacts?.length
    ? action.actionContacts.map((ac) => ac.contact)
    : action.contact ? [action.contact] : [];
  return { people, waiting: false };
}

export const ACTION_TYPE_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'CALL', label: 'Call' },
  { value: 'MEET', label: 'Meet' },
  { value: 'READ', label: 'Read' },
  { value: 'WRITE', label: 'Write' },
  { value: 'RESEARCH', label: 'Research' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'INTRO', label: 'Intro' },
  { value: 'OTHER', label: 'Other' },
];

export const ACTION_DIRECTION_OPTIONS: { value: ActionDirection; label: string }[] = [
  { value: 'OWED_BY_ME', label: 'My task' },
  { value: 'WAITING_ON_THEM', label: 'Waiting on them' },
];

export const ACTION_PRIORITY_OPTIONS: { value: ActionPriority; label: string }[] = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

// ─── Ideas ──────────────────────────────────────────────────

export interface Idea {
  id: number;
  title: string;
  description: string | null;
  /** Legacy comma-separated tags — superseded by tagLinks (app-wide Tag table). */
  tags: string | null;
  /** Tags via the IdeaTag junction (shares the app-wide Tag entity). */
  tagLinks?: { tag: { id: number; name: string } }[];
  archived: boolean;
  createdAt: string;
  contacts?: { contact: { id: number; name: string } }[];
  companies?: { company: { id: number; name: string } }[];
}

// ─── Tags ───────────────────────────────────────────────────

export interface Tag {
  id: number;
  name: string;
  _count?: { contacts: number; companies: number };
}

// ─── Conversations ──────────────────────────────────────────

export type ConversationType = 'CALL' | 'VIDEO_CALL' | 'EMAIL' | 'MEETING' | 'LINKEDIN' | 'COFFEE' | 'EVENT' | 'OTHER';
export type DatePrecision = 'DAY' | 'MONTH' | 'QUARTER' | 'YEAR';

export interface Conversation {
  id: number;
  contactId: number | null;
  contact: { id: number; name: string } | null;
  title: string | null;
  companyId: number | null;
  company: { id: number; name: string } | null;
  attendeesDescription: string | null;
  date: string;
  /** Local HH:MM start time (date-only meetings leave this null). Set by Outlook import; editable in Quick Log. */
  startTime?: string | null;
  /** Outlook ICS UID for meetings imported from the calendar (idempotent re-import). */
  calendarUid?: string | null;
  datePrecision: DatePrecision;
  type: ConversationType;
  summary: string | null;
  notes: string | null;
  nextSteps: string | null;
  photoFile: string | null;
  seriesId: number | null;
  series?: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
  participants?: { contact: { id: number; name: string; title?: string | null; company?: { name: string } | null }; note?: string | null }[];
  contactsDiscussed: { contact: { id: number; name: string } }[];
  companiesDiscussed: { company: { id: number; name: string } }[];
  /** Additional orgs the meeting was with (anchor org stays in companyId). */
  orgs?: { company: { id: number; name: string } }[];
  tags?: { tag: { id: number; name: string } }[];
  actions?: { id: number; title: string; completed: boolean; dueDate: string | null }[];
  prepNotes?: ConversationPrepNote[];
  attachments?: ConversationAttachment[];
}

// ─── Meeting Prep Notes & Attachments ───────────────────────

export interface ConversationPrepNote {
  id: number;
  content: string;
  url: string | null;
  urlTitle: string | null;
  date: string;
  ordering: number;
  conversationId: number;
  createdAt: string;
}

export interface ConversationAttachment {
  id: number;
  conversationId: number;
  url: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
}

/** Display name precedence for a meeting: title → first participant → contact → company → attendees description.
 *  First participant outranks the legacy anchor contact/company so an untitled
 *  meeting is identified by the first person entered (the owner's mental model). */
export function conversationDisplayName(conv: Conversation): string {
  return (
    conv.title ||
    conv.participants?.[0]?.contact.name ||
    conv.contact?.name ||
    conv.company?.name ||
    conv.attendeesDescription ||
    'Meeting'
  );
}

export const CONVERSATION_TYPE_OPTIONS: { value: ConversationType; label: string }[] = [
  { value: 'CALL', label: 'Call' },
  { value: 'VIDEO_CALL', label: 'Video Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'COFFEE', label: 'Coffee' },
  { value: 'EVENT', label: 'Event' },
  { value: 'OTHER', label: 'Other' },
];

export const DATE_PRECISION_OPTIONS: { value: DatePrecision; label: string }[] = [
  { value: 'DAY', label: 'Exact Day' },
  { value: 'MONTH', label: 'Month' },
  { value: 'QUARTER', label: 'Quarter' },
  { value: 'YEAR', label: 'Year' },
];

// ─── Relationships ──────────────────────────────────────────

export type RelationshipType = 'REFERRED_BY' | 'WORKS_WITH' | 'KNOWS' | 'INTRODUCED_BY' | 'REPORTS_TO';

export interface Relationship {
  id: number;
  fromContactId: number;
  fromContact: { id: number; name: string };
  toContactId: number;
  toContact: { id: number; name: string };
  type: RelationshipType;
  notes: string | null;
}

export const RELATIONSHIP_TYPE_OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: 'REFERRED_BY', label: 'Referred By' },
  { value: 'WORKS_WITH', label: 'Works With' },
  { value: 'KNOWS', label: 'Knows' },
  { value: 'INTRODUCED_BY', label: 'Introduced By' },
  { value: 'REPORTS_TO', label: 'Reports To' },
];

// ─── Links ──────────────────────────────────────────────────

export interface LinkRecord {
  id: number;
  url: string;
  title: string;
  description: string | null;
  contactId: number | null;
  companyId: number | null;
  actionId: number | null;
  createdAt: string;
}

// ─── Prep Notes ─────────────────────────────────────────────

export interface PrepNote {
  id: number;
  content: string;
  url: string | null;
  urlTitle: string | null;
  date: string;
  ordering: number;
  contactId: number;
  createdAt: string;
}

// ─── Company Prep Notes (Research Dossier) ──────────────────

export interface CompanyPrepNote {
  id: number;
  content: string;
  url: string | null;
  urlTitle: string | null;
  date: string;
  ordering: number;
  companyId: number;
  createdAt: string;
}

// ─── Company Activities ─────────────────────────────────────

export type CompanyActivityType = 'APPLIED' | 'EMAIL' | 'CALL' | 'MEETING' | 'RESEARCH' | 'FOLLOW_UP' | 'OTHER';

export interface CompanyActivity {
  id: number;
  companyId: number;
  date: string;
  type: CompanyActivityType;
  title: string;
  notes: string | null;
  createdAt: string;
}

export const COMPANY_ACTIVITY_TYPE_OPTIONS: { value: CompanyActivityType; label: string }[] = [
  { value: 'APPLIED', label: 'Applied' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'CALL', label: 'Call' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'RESEARCH', label: 'Research' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'OTHER', label: 'Other' },
];

// ─── Employment History ─────────────────────────────────────

export interface EmploymentHistory {
  id: number;
  contactId: number;
  companyId: number | null;
  company: { id: number; name: string } | null;
  companyName: string | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

// ─── Search ────────────────────────────────────────────────

/** Why a record matched: field name + snippet around the first match. */
export interface SearchMatch {
  field: string;
  snippet: string;
}

export type SearchScope = 'people-profile' | 'people-notes' | 'useful' | 'orgs' | 'meetings' | 'actions' | 'ideas';
export type SearchSort = 'relevance' | 'newest' | 'oldest' | 'alpha' | 'recent-contact';

export interface SearchResult {
  query: string;
  terms?: string[];
  scopes?: SearchScope[];
  sort?: SearchSort;
  caseSensitive?: boolean;
  totals?: {
    contacts: number;
    companies: number;
    actions: number;
    ideas: number;
    conversations: number;
  };
  contacts: ContactSearchResult[];
  companies: CompanySearchResult[];
  actions: ActionSearchResult[];
  ideas: IdeaSearchResult[];
  conversations?: ConversationSearchResult[];
}

export interface ConversationSearchResult {
  id: number;
  title: string | null;
  summary: string | null;
  date: string;
  type: string;
  displayName: string;
  contact?: { id: number; name: string } | null;
  company?: { id: number; name: string } | null;
  matches?: SearchMatch[];
}

export interface RelatedCompany {
  id: number;
  name: string;
  relationship: string;
}

export interface RelatedContact {
  id: number;
  name: string;
  relationship: string;
}

export interface ContactSearchResult {
  id: number;
  name: string;
  title: string | null;
  ecosystem: string;
  status: string;
  company?: { id: number; name: string } | null;
  matches?: SearchMatch[];
  related?: {
    companies: RelatedCompany[];
    contacts: RelatedContact[];
    actions: { id: number; title: string; completed: boolean }[];
    ideas: { id: number; title: string }[];
    conversations: { id: number; summary: string | null; date: string }[];
  };
}

export interface CompanySearchResult {
  id: number;
  name: string;
  industry: string | null;
  status: string;
  _count?: { contacts: number };
  matches?: SearchMatch[];
  related?: {
    contacts: { id: number; name: string; title: string | null }[];
    actions: { id: number; title: string; completed: boolean }[];
    ideas: { id: number; title: string }[];
    conversations: { id: number; summary: string | null; date: string; contactName: string }[];
  };
}

export interface ActionSearchResult {
  id: number;
  title: string;
  type: string;
  completed: boolean;
  dueDate: string | null;
  contact?: { id: number; name: string } | null;
  company?: { id: number; name: string } | null;
  matches?: SearchMatch[];
}

export interface IdeaSearchResult {
  id: number;
  title: string;
  description: string | null;
  contacts?: { id: number; name: string }[];
  companies?: { id: number; name: string }[];
  matches?: SearchMatch[];
}
