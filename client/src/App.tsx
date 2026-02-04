import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { PWAUpdatePrompt } from '@/components/pwa-update-prompt'
import { Layout } from '@/components/layout'
import { DashboardPage } from '@/pages/dashboard'
import { ContactListPage } from '@/pages/contacts/contact-list'
import { ContactFormPage } from '@/pages/contacts/contact-form'
import { ContactDetailPage } from '@/pages/contacts/contact-detail'
import { CompanyListPage } from '@/pages/companies/company-list'
import { CompanyFormPage } from '@/pages/companies/company-form'
import { CompanyDetailPage } from '@/pages/companies/company-detail'
import { ActionListPage } from '@/pages/actions/action-list'
import { ActionFormPage } from '@/pages/actions/action-form'
import { ActionDetailPage } from '@/pages/actions/action-detail'
import { CalendarPage } from '@/pages/calendar'
import { IdeaListPage } from '@/pages/ideas/idea-list'
import { AnalyticsPage } from '@/pages/analytics'
import { SettingsPage } from '@/pages/settings'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/contacts" element={<ContactListPage />} />
          <Route path="/contacts/new" element={<ContactFormPage />} />
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
          <Route path="/contacts/:id/edit" element={<ContactFormPage />} />
          <Route path="/companies" element={<CompanyListPage />} />
          <Route path="/companies/new" element={<CompanyFormPage />} />
          <Route path="/companies/:id" element={<CompanyDetailPage />} />
          <Route path="/companies/:id/edit" element={<CompanyFormPage />} />
          <Route path="/actions" element={<ActionListPage />} />
          <Route path="/actions/new" element={<ActionFormPage />} />
          <Route path="/actions/:id" element={<ActionDetailPage />} />
          <Route path="/actions/:id/edit" element={<ActionFormPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/ideas" element={<IdeaListPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
      <PWAUpdatePrompt />
    </BrowserRouter>
  )
}

export default App
