export type Ecosystem = 'RECRUITER' | 'ROLODEX' | 'TARGET' | 'INFLUENCER' | 'ACADEMIA' | 'INTRO_SOURCE';
export type ContactStatus = 'NEW' | 'CONNECTED' | 'AWAITING_RESPONSE' | 'FOLLOW_UP_NEEDED' | 'WARM_LEAD' | 'ON_HOLD' | 'CLOSED';
export type CompanyStatus = 'RESEARCHING' | 'ACTIVE_TARGET' | 'CONNECTED' | 'ON_HOLD' | 'CLOSED';

export interface Contact {
  id: number;
  name: string;
  title: string | null;
  companyId: number | null;
  company: { id: number; name: string } | null;
  companyName: string | null;
  ecosystem: Ecosystem;
  email: string | null;
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
  createdAt: string;
  updatedAt: string;
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
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'AWAITING_RESPONSE', label: 'Awaiting Response' },
  { value: 'FOLLOW_UP_NEEDED', label: 'Follow-Up Needed' },
  { value: 'WARM_LEAD', label: 'Warm Lead' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'CLOSED', label: 'Closed' },
];

export const COMPANY_STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: 'RESEARCHING', label: 'Researching' },
  { value: 'ACTIVE_TARGET', label: 'Active Target' },
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'CLOSED', label: 'Closed' },
];
