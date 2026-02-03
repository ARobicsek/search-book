import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookUser, Building2 } from 'lucide-react'

export function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome to SearchBook</h1>
        <p className="text-muted-foreground mt-1">Your personal CRM for executive job search networking.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 max-w-2xl">
        <Link to="/contacts">
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3">
              <BookUser className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Contacts</CardTitle>
                <CardDescription>Manage your networking contacts</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Track contacts across all ecosystems — recruiters, rolodex, targets, influencers, and more.</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/companies">
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Companies</CardTitle>
                <CardDescription>Track target companies</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Manage target companies, research notes, and see who you know at each one.</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
