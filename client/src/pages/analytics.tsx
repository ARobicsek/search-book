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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Users, Building2, CheckCircle, AlertTriangle, Loader2, Calendar as CalendarIcon, Activity, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
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
  inDiscussionsCompaniesCount: number
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

  // Drilldown state
  const [drilldownOpen, setDrilldownOpen] = useState(false)
  const [drilldownConfig, setDrilldownConfig] = useState<{
    type: 'contact-transitions' | 'contacts' | 'conversations' | 'companies' | 'actions',
    date: string,
    metric: string,
    title: string
  } | null>(null)
  const [drilldownData, setDrilldownData] = useState<any[] | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)

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

  useEffect(() => {
    if (drilldownOpen && drilldownConfig) {
      setDrilldownLoading(true)
      let endpoint = '';
      if (drilldownConfig.type === 'contact-transitions') {
        endpoint = `/analytics/drilldown/contact-transitions?date=${drilldownConfig.date}&oldStatus=AWAITING_RESPONSE&newStatus=CONNECTED`;
      } else if (drilldownConfig.type === 'contacts') {
        endpoint = `/analytics/drilldown/contacts?date=${drilldownConfig.date}&metric=${drilldownConfig.metric}`;
      } else if (drilldownConfig.type === 'conversations') {
        endpoint = `/analytics/drilldown/conversations?date=${drilldownConfig.date}&type=${drilldownConfig.metric}`;
      } else if (drilldownConfig.type === 'companies') {
        endpoint = `/analytics/drilldown/companies?date=${drilldownConfig.date}&metric=${drilldownConfig.metric}`;
      } else if (drilldownConfig.type === 'actions') {
        endpoint = `/analytics/drilldown/actions?date=${drilldownConfig.date}`;
      }

      api.get<any[]>(endpoint)
        .then(data => setDrilldownData(data))
        .catch(err => toast.error('Failed to load drill-down data: ' + err.message))
        .finally(() => setDrilldownLoading(false))
    } else {
      setDrilldownData(null)
    }
  }, [drilldownOpen, drilldownConfig])

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
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-6">
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
                      <LineChart data={overview.sparklines.contacts} margin={{ top: 15, right: 5, left: 15, bottom: 0 }}>
                        <XAxis dataKey="date" hide />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke={COLORS.Added}
                          strokeWidth={2}
                          dot={(props: any) => {
                            if (props.index === 0) {
                              return (
                                <g key="custom-dot-first">
                                  <circle cx={props.cx} cy={props.cy} r={3} fill={COLORS.Added} />
                                  <text x={props.cx - 5} y={props.cy - 10} fontSize={10} fill="currentColor" className="text-muted-foreground font-medium" textAnchor="middle">
                                    {props.value}
                                  </text>
                                </g>
                              );
                            }
                            return <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={0} />;
                          }}
                          isAnimationActive={false}
                        />
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
                      <LineChart data={overview.sparklines.companies} margin={{ top: 15, right: 5, left: 15, bottom: 0 }}>
                        <XAxis dataKey="date" hide />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke={COLORS.AwaitingToConnected}
                          strokeWidth={2}
                          dot={(props: any) => {
                            if (props.index === 0) {
                              return (
                                <g key="custom-dot-first">
                                  <circle cx={props.cx} cy={props.cy} r={3} fill={COLORS.AwaitingToConnected} />
                                  <text x={props.cx - 5} y={props.cy - 10} fontSize={10} fill="currentColor" className="text-muted-foreground font-medium" textAnchor="middle">
                                    {props.value}
                                  </text>
                                </g>
                              );
                            }
                            return <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={0} />;
                          }}
                          isAnimationActive={false}
                        />
                        <Tooltip labelFormatter={formatDate} contentStyle={{ fontSize: '12px', padding: '4px 8px' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col justify-between">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Companies in Discussions</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.inDiscussionsCompaniesCount ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">Status: In Discussions</div>
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
                {overview?.overdueActionsCount === 0 ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${overview?.overdueActionsCount === 0 ? 'text-emerald-500' : 'text-destructive'}`}>
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
                      <LineChart data={overview.sparklines.completedActions} margin={{ top: 15, right: 5, left: 15, bottom: 0 }}>
                        <XAxis dataKey="date" hide />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke={COLORS.Completed}
                          strokeWidth={2}
                          dot={(props: any) => {
                            if (props.index === 0) {
                              return (
                                <g key="custom-dot-first">
                                  <circle cx={props.cx} cy={props.cy} r={3} fill={COLORS.Completed} />
                                  <text x={props.cx - 5} y={props.cy - 10} fontSize={10} fill="currentColor" className="text-muted-foreground font-medium" textAnchor="middle">
                                    {props.value}
                                  </text>
                                </g>
                              );
                            }
                            return <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={0} />;
                          }}
                          isAnimationActive={false}
                        />
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
                    <Bar name="Added" dataKey="added" fill={COLORS.Added} radius={[2, 2, 0, 0]} onClick={(d: any) => { if (d?.date && d.added > 0) { setDrilldownConfig({ type: 'contacts', metric: 'added', date: d.date, title: 'Contacts Added' }); setDrilldownOpen(true); } }} className="cursor-pointer hover:opacity-80 transition-opacity" />
                    <Bar
                      name="Awaiting → Connected"
                      dataKey="awaitingToConnected"
                      fill={COLORS.AwaitingToConnected}
                      radius={[2, 2, 0, 0]}
                      onClick={(data: any) => {
                        if (data && data.date && data.awaitingToConnected > 0) {
                          setDrilldownConfig({ type: 'contact-transitions', metric: 'awaitingToConnected', date: data.date, title: 'Awaiting → Connected' });
                          setDrilldownOpen(true);
                        }
                      }}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    />
                    <Bar name="1st Email" dataKey="firstEmail" fill={COLORS.FirstEmail} radius={[2, 2, 0, 0]} onClick={(d: any) => { if (d?.date && d.firstEmail > 0) { setDrilldownConfig({ type: 'contacts', metric: 'firstEmail', date: d.date, title: '1st Email' }); setDrilldownOpen(true); } }} className="cursor-pointer hover:opacity-80 transition-opacity" />
                    <Bar name="1st LinkedIn" dataKey="firstLinkedIn" fill={COLORS.FirstLinkedIn} radius={[2, 2, 0, 0]} onClick={(d: any) => { if (d?.date && d.firstLinkedIn > 0) { setDrilldownConfig({ type: 'contacts', metric: 'firstLinkedIn', date: d.date, title: '1st LinkedIn' }); setDrilldownOpen(true); } }} className="cursor-pointer hover:opacity-80 transition-opacity" />
                    <Bar name="1st Direct (Call/Meet)" dataKey="firstCallOrMeeting" fill={COLORS.FirstCallOrMeeting} radius={[2, 2, 0, 0]} onClick={(d: any) => { if (d?.date && d.firstCallOrMeeting > 0) { setDrilldownConfig({ type: 'contacts', metric: 'firstCallOrMeeting', date: d.date, title: '1st Direct (Call/Meet)' }); setDrilldownOpen(true); } }} className="cursor-pointer hover:opacity-80 transition-opacity" />
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
                      <Bar key={opt.value} name={opt.label} dataKey={opt.value} stackId="a" fill={CONV_COLORS[opt.value]} onClick={(d: any) => { if (d?.date && d[opt.value] > 0) { setDrilldownConfig({ type: 'conversations', metric: opt.value, date: d.date, title: opt.label }); setDrilldownOpen(true); } }} className="cursor-pointer hover:opacity-80 transition-opacity" />
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
                    <Bar name="Added" dataKey="added" fill={COLORS.Added} radius={[2, 2, 0, 0]} onClick={(d: any) => { if (d?.date && d.added > 0) { setDrilldownConfig({ type: 'companies', metric: 'added', date: d.date, title: 'Companies Added' }); setDrilldownOpen(true); } }} className="cursor-pointer hover:opacity-80 transition-opacity" />
                    <Bar name="To 'In Discussions'" dataKey="toInDiscussions" fill={COLORS.ToInDiscussions} radius={[2, 2, 0, 0]} onClick={(d: any) => { if (d?.date && d.toInDiscussions > 0) { setDrilldownConfig({ type: 'companies', metric: 'toInDiscussions', date: d.date, title: "Companies Moved to 'In Discussions'" }); setDrilldownOpen(true); } }} className="cursor-pointer hover:opacity-80 transition-opacity" />
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
                    <Bar name="Completed Actions" dataKey="completed" fill={COLORS.Completed} radius={[2, 2, 0, 0]} onClick={(d: any) => { if (d?.date && d.completed > 0) { setDrilldownConfig({ type: 'actions', metric: 'completed', date: d.date, title: 'Completed Actions' }); setDrilldownOpen(true); } }} className="cursor-pointer hover:opacity-80 transition-opacity" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

          </div>

          <Dialog open={drilldownOpen} onOpenChange={setDrilldownOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{drilldownConfig?.title} ({drilldownConfig?.date ? formatDate(drilldownConfig.date) : ''})</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {drilldownLoading ? (
                  <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : drilldownData?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center p-4">No records found for this metric on this date.</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {drilldownData?.map((item) => (
                      <div key={item.id} className="flex flex-col p-3 border rounded-md gap-2">
                        <div className="flex items-center justify-between">
                          <div>
                            {drilldownConfig?.type === 'conversations' ? (
                              <>
                                <p className="font-medium text-sm">
                                  {(() => {
                                    const names = new Set<string>();
                                    if (item.contact?.name) names.add(item.contact.name);
                                    item.contactsDiscussed?.forEach((cd: any) => {
                                      if (cd.contact?.name) names.add(cd.contact.name);
                                    });
                                    return Array.from(names).join(', ') || 'No Contacts';
                                  })()}
                                </p>
                                <p className="text-xs text-muted-foreground capitalize">{String(item.type).replace('_', ' ').toLowerCase()}</p>
                              </>
                            ) : drilldownConfig?.type === 'actions' ? (
                              <>
                                <p className="font-medium text-sm">{item.title}</p>
                                <p className="text-xs text-muted-foreground capitalize">{String(item.priority).toLowerCase()} Priority</p>
                              </>
                            ) : (
                              <>
                                <p className="font-medium text-sm">{item.name}</p>
                                <p className="text-xs text-muted-foreground">{item.title || item.website || (item.status ? String(item.status).replace('_', ' ') : '')}</p>
                              </>
                            )}
                          </div>
                          {(drilldownConfig?.type === 'contacts' || drilldownConfig?.type === 'contact-transitions') && (
                            <Link to={`/contacts/${item.id}`} className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs shrink-0">
                              Profile <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                          {drilldownConfig?.type === 'companies' && (
                            <Link to={`/companies/${item.id}`} className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs shrink-0">
                              Company <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                        {drilldownConfig?.type === 'conversations' && item.summary && (
                          <div className="text-sm text-foreground bg-muted p-2 rounded-md">
                            {item.summary}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
