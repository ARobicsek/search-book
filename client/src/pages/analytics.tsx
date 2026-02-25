import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Building2, CheckCircle, AlertTriangle, Loader2, Calendar as CalendarIcon, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { CONVERSATION_TYPE_OPTIONS } from '@/lib/types'
import type { ConversationType } from '@/lib/types'

interface SparklineData {
  date: string
  count: number
}

interface Overview {
  contactsCount: number
  companiesCount: number
  pendingActionsCount: number
  overdueActionsCount: number
  completedActionsCount: number
  sparklines: {
    contacts: SparklineData[]
    companies: SparklineData[]
    completedActions: SparklineData[]
  }
}

interface ContactMetric {
  date: string
  added: number
  awaitingToConnected: number
  firstEmail: number
  firstLinkedIn: number
  firstCallOrMeeting: number
}

interface CompanyMetric {
  date: string
  added: number
  toInDiscussions: number
}

interface CompletedMetric {
  date: string
  completed: number
}

type ConversationMetric = { date: string } & Record<ConversationType, number>

function formatDate(dateStr: unknown): string {
  if (!dateStr) return ''
  const d = new Date(String(dateStr) + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitialDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 30)
  return {
    startDate: start.toLocaleDateString('en-CA'),
    endDate: end.toLocaleDateString('en-CA'),
  }
}

const COLORS = {
  Added: '#3b82f6',
  AwaitingToConnected: '#8b5cf6',
  FirstEmail: '#10b981',
  FirstLinkedIn: '#06b6d4',
  FirstCallOrMeeting: '#f59e0b',
  ToInDiscussions: '#f43f5e',
  Completed: '#22c55e',
}

const CONV_COLORS: Record<ConversationType, string> = {
  CALL: '#3b82f6',
  VIDEO_CALL: '#8b5cf6',
  EMAIL: '#10b981',
  MEETING: '#f59e0b',
  LINKEDIN: '#06b6d4',
  COFFEE: '#eab308',
  EVENT: '#f43f5e',
  OTHER: '#9ca3af',
}

export function AnalyticsPage() {
  const [dates, setDates] = useState(getInitialDates())
  const [overview, setOverview] = useState<Overview | null>(null)
  const [contactsMetrics, setContactsMetrics] = useState<ContactMetric[]>([])
  const [conversationsMetrics, setConversationsMetrics] = useState<ConversationMetric[]>([])
  const [companiesMetrics, setCompaniesMetrics] = useState<CompanyMetric[]>([])
  const [actionsMetrics, setActionsMetrics] = useState<CompletedMetric[]>([])
  const [loading, setLoading] = useState(true)

  // Toggles for conversation types to display
  const [activeConvTypes, setActiveConvTypes] = useState<Record<ConversationType, boolean>>(() => {
    const initial: Partial<Record<ConversationType, boolean>> = {}
    CONVERSATION_TYPE_OPTIONS.forEach(opt => initial[opt.value] = true)
    return initial as Record<ConversationType, boolean>
  })

  const toggleConvType = (type: ConversationType) => {
    setActiveConvTypes(prev => ({ ...prev, [type]: !prev[type] }))
  }

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDates(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    if (!dates.startDate || !dates.endDate) return

    setLoading(true)
    const q = `?startDate=${dates.startDate}&endDate=${dates.endDate}`
    Promise.all([
      api.get<Overview>(`/analytics/overview${q}`),
      api.get<ContactMetric[]>(`/analytics/contacts-metrics${q}`),
      api.get<ConversationMetric[]>(`/analytics/conversations-metrics${q}`),
      api.get<CompanyMetric[]>(`/analytics/companies-metrics${q}`),
      api.get<CompletedMetric[]>(`/analytics/actions-metrics${q}`),
    ])
      .then(([ov, contacts, convos, companies, actions]) => {
        setOverview(ov)
        setContactsMetrics(contacts)
        setConversationsMetrics(convos)
        setCompaniesMetrics(companies)
        setActionsMetrics(actions)
      })
      .catch((err) => toast.error(err.message || 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [dates])

  // Compute totals for Contact metrics
  const contactTotals = contactsMetrics.reduce((acc, curr) => ({
    added: acc.added + curr.added,
    awaitingToConnected: acc.awaitingToConnected + curr.awaitingToConnected,
    firstEmail: acc.firstEmail + curr.firstEmail,
    firstLinkedIn: acc.firstLinkedIn + curr.firstLinkedIn,
    firstCallOrMeeting: acc.firstCallOrMeeting + curr.firstCallOrMeeting,
  }), { added: 0, awaitingToConnected: 0, firstEmail: 0, firstLinkedIn: 0, firstCallOrMeeting: 0 })

  // Compute totals for Conversation metrics
  const convTotals = conversationsMetrics.reduce((acc, curr) => {
    CONVERSATION_TYPE_OPTIONS.forEach(opt => {
      acc[opt.value] = (acc[opt.value] || 0) + (curr[opt.value] || 0)
    })
    return acc
  }, {} as Record<ConversationType, number>)

  // Compute totals for Company metrics
  const companyTotals = companiesMetrics.reduce((acc, curr) => ({
    added: acc.added + curr.added,
    toInDiscussions: acc.toInDiscussions + curr.toInDiscussions,
  }), { added: 0, toInDiscussions: 0 })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Track your networking activity over your chosen timeframe
          </p>
        </div>

        <div className="flex items-center gap-2 bg-muted p-2 rounded-md">
          <CalendarIcon className="w-4 h-4 text-muted-foreground ml-1" />
          <div className="flex items-center">
            <Input
              type="date"
              value={dates.startDate}
              onChange={e => handleDateChange('startDate', e.target.value)}
              className="h-8 max-w-[140px] text-sm"
            />
          </div>
          <span className="text-muted-foreground text-sm">to</span>
          <div className="flex items-center">
            <Input
              type="date"
              value={dates.endDate}
              onChange={e => handleDateChange('endDate', e.target.value)}
              className="h-8 max-w-[140px] text-sm"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.contactsCount ?? 0}</div>
                {overview?.sparklines.contacts && overview.sparklines.contacts.length > 0 && (
                  <div className="h-[40px] mt-3 -mx-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={overview.sparklines.contacts}>
                        <Line type="monotone" dataKey="count" stroke={COLORS.Added} strokeWidth={2} dot={false} />
                        <Tooltip labelFormatter={formatDate} contentStyle={{ fontSize: '12px', padding: '4px 8px' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.companiesCount ?? 0}</div>
                {overview?.sparklines.companies && overview.sparklines.companies.length > 0 && (
                  <div className="h-[40px] mt-3 -mx-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={overview.sparklines.companies}>
                        <Line type="monotone" dataKey="count" stroke={COLORS.AwaitingToConnected} strokeWidth={2} dot={false} />
                        <Tooltip labelFormatter={formatDate} contentStyle={{ fontSize: '12px', padding: '4px 8px' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col justify-between">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.pendingActionsCount ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">Across all time</div>
              </CardContent>
            </Card>

            <Card className="flex flex-col justify-between">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overdue Actions</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  {overview?.overdueActionsCount ?? 0}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Across all time</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed Actions</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.completedActionsCount ?? 0}</div>
                {overview?.sparklines.completedActions && overview.sparklines.completedActions.length > 0 && (
                  <div className="h-[40px] mt-3 -mx-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={overview.sparklines.completedActions}>
                        <Line type="monotone" dataKey="count" stroke={COLORS.Completed} strokeWidth={2} dot={false} />
                        <Tooltip labelFormatter={formatDate} contentStyle={{ fontSize: '12px', padding: '4px 8px' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">

            {/* Contacts Metrics Chart */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  Contacts Activity
                </CardTitle>
                <div className="text-sm text-muted-foreground space-y-1 pt-2">
                  <div className="flex justify-between border-b pb-1"><span>Added:</span> <strong>{contactTotals.added}</strong></div>
                  <div className="flex justify-between border-b pb-1"><span>Awaiting → Connected:</span> <strong>{contactTotals.awaitingToConnected}</strong></div>
                  <div className="flex justify-between border-b pb-1"><span>First Email:</span> <strong>{contactTotals.firstEmail}</strong></div>
                  <div className="flex justify-between border-b pb-1"><span>First LinkedIn:</span> <strong>{contactTotals.firstLinkedIn}</strong></div>
                  <div className="flex justify-between pb-1"><span>First Call/Video/Meeting/Coffee:</span> <strong>{contactTotals.firstCallOrMeeting}</strong></div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contactsMetrics}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis allowDecimals={false} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip labelFormatter={formatDate} contentStyle={{ backgroundColor: 'hsl(var(--background))', borderRadius: '6px' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar name="Added" dataKey="added" fill={COLORS.Added} radius={[2, 2, 0, 0]} />
                    <Bar name="Awaiting → Connected" dataKey="awaitingToConnected" fill={COLORS.AwaitingToConnected} radius={[2, 2, 0, 0]} />
                    <Bar name="1st Email" dataKey="firstEmail" fill={COLORS.FirstEmail} radius={[2, 2, 0, 0]} />
                    <Bar name="1st LinkedIn" dataKey="firstLinkedIn" fill={COLORS.FirstLinkedIn} radius={[2, 2, 0, 0]} />
                    <Bar name="1st Direct (Call/Meet)" dataKey="firstCallOrMeeting" fill={COLORS.FirstCallOrMeeting} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Conversations Metrics Chart */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-muted-foreground" />
                  Conversations by Type
                </CardTitle>
                <div className="flex flex-wrap gap-3 pt-2">
                  {CONVERSATION_TYPE_OPTIONS.map(opt => (
                    <div key={opt.value} className="flex items-center gap-1.5">
                      <Checkbox
                        id={`conv-${opt.value}`}
                        checked={activeConvTypes[opt.value]}
                        onCheckedChange={() => toggleConvType(opt.value)}
                      />
                      <Label htmlFor={`conv-${opt.value}`} className="text-xs cursor-pointer font-normal">
                        {opt.label} <span className="text-muted-foreground">({convTotals[opt.value] || 0})</span>
                      </Label>
                    </div>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversationsMetrics}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis allowDecimals={false} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip labelFormatter={formatDate} contentStyle={{ backgroundColor: 'hsl(var(--background))', borderRadius: '6px' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {CONVERSATION_TYPE_OPTIONS.filter(opt => activeConvTypes[opt.value]).map(opt => (
                      <Bar key={opt.value} name={opt.label} dataKey={opt.value} stackId="a" fill={CONV_COLORS[opt.value]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Companies Metrics Chart */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  Companies Activity
                </CardTitle>
                <div className="text-sm text-muted-foreground space-y-1 pt-2">
                  <div className="flex justify-between border-b pb-1"><span>Added:</span> <strong>{companyTotals.added}</strong></div>
                  <div className="flex justify-between pb-1"><span>Added/Changed to 'In Discussions':</span> <strong>{companyTotals.toInDiscussions}</strong></div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={companiesMetrics}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis allowDecimals={false} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip labelFormatter={formatDate} contentStyle={{ backgroundColor: 'hsl(var(--background))', borderRadius: '6px' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar name="Added" dataKey="added" fill={COLORS.Added} radius={[2, 2, 0, 0]} />
                    <Bar name="To 'In Discussions'" dataKey="toInDiscussions" fill={COLORS.ToInDiscussions} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Actions Completed Chart */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-muted-foreground" />
                  Actions Completed
                </CardTitle>
                <div className="text-sm text-muted-foreground pt-2">
                  <div className="flex justify-between pb-1"><span>Total Completed:</span> <strong>{overview?.completedActionsCount ?? 0}</strong></div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={actionsMetrics}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis allowDecimals={false} className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip labelFormatter={formatDate} contentStyle={{ backgroundColor: 'hsl(var(--background))', borderRadius: '6px' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar name="Completed Actions" dataKey="completed" fill={COLORS.Completed} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

          </div>
        </>
      )}
    </div>
  )
}
