export type Ecosystem = 'RECRUITER' | 'ROLODEX' | 'TARGET' | 'INFLUENCER' | 'ACADEMIA' | 'INTRO_SOURCE';
export type ContactStatus = 'NEW' | 'RESEARCHING' | 'CONNECTED' | 'AWAITING_RESPONSE' | 'FOLLOW_UP_NEEDED' | 'LEAD_TO_PURSUE' | 'ON_HOLD' | 'CLOSED';
export type CompanyStatus = 'RESEARCHING' | 'ACTIVE_TARGET' | 'IN_DISCUSSIONS' | 'CONNECTED' | 'ON_HOLD' | 'CLOSED';

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
  { value: 'RECRUITER', label: 'Recruiter' },
  { value: 'ROLODEX', label: 'Rolodex' },
  { value: 'TARGET', label: 'Target' },
  { value: 'INFLUENCER', label: 'Influencer' },
  { value: 'ACADEMIA', label: 'Academia' },
  { value: 'INTRO_SOURCE', label: 'Intro Source' },
];

export const CONTACT_STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'RESEARCHING', label: 'Researching' },
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'AWAITING_RESPONSE', label: 'Awaiting Response' },
  { value: 'FOLLOW_UP_NEEDED', label: 'Follow-Up Needed' },
  { value: 'LEAD_TO_PURSUE', label: 'Lead to Pursue' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'CLOSED', label: 'Closed' },
];

export const COMPANY_STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: 'RESEARCHING', label: 'Researching' },
  { value: 'ACTIVE_TARGET', label: 'Active Target' },
  { value: 'IN_DISCUSSIONS', label: 'In Discussions' },
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'CLOSED', label: 'Closed' },
];

// ─── Actions ─────────────────────────────────────────────────

export type ActionType = 'EMAIL' | 'CALL' | 'MEET' | 'READ' | 'WRITE' | 'RESEARCH' | 'FOLLOW_UP' | 'INTRO' | 'OTHER';
export type ActionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Action {
  id: number;
  title: string;
  description: string | null;
  type: ActionType;
  dueDate: string | null;
  completed: boolean;
  completedDate: string | null;
  contactId: number | null;
  contact: { id: number; name: string } | null;
  companyId: number | null;
  company: { id: number; name: string } | null;
  conversationId: number | null;
  conversation: { id: number; summary: string | null } | null;
  priority: ActionPriority;
  recurring: boolean;
  recurringIntervalDays: number | null;
  recurringEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  actionContacts?: { contact: { id: number; name: string } }[];
  actionCompanies?: { company: { id: number; name: string } }[];
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
  tags: string | null;
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
  contactId: number;
  contact: { id: number; name: string };
  date: string;
  datePrecision: DatePrecision;
  type: ConversationType;
  summary: string | null;
  notes: string | null;
  nextSteps: string | null;
  photoFile: string | null;
  createdAt: string;
  contactsDiscussed: { contact: { id: number; name: string } }[];
  companiesDiscussed: { company: { id: number; name: string } }[];
  actions?: { id: number; title: string; completed: boolean; dueDate: string | null }[];
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

export interface SearchResult {
  query: string;
  contacts: ContactSearchResult[];
  companies: CompanySearchResult[];
  actions: ActionSearchResult[];
  ideas: IdeaSearchResult[];
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
}

export interface IdeaSearchResult {
  id: number;
  title: string;
  description: string | null;
  contacts?: { id: number; name: string }[];
  companies?: { id: number; name: string }[]
}
