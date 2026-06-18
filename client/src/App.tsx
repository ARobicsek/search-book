import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { PWAUpdatePrompt } from '@/components/pwa-update-prompt'
import { LoginGate } from '@/components/login-gate'
import { PASSWORD_STORAGE_KEY } from '@/lib/api'
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
import { MeetingsPage } from '@/pages/meetings'
import { MentionsPage } from '@/pages/mentions'
import { IdeaListPage } from '@/pages/ideas/idea-list'
import { AnalyticsPage } from '@/pages/analytics'
import { SettingsPage } from '@/pages/settings'
import { DuplicatesPage } from '@/pages/duplicates'
import { SearchPage } from '@/pages/search'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'

function App() {
  const [authed, setAuthed] = useState<boolean>(
    () => !!localStorage.getItem(PASSWORD_STORAGE_KEY)
  )

  // A 401 anywhere clears the stored password (in api.ts) and fires this event —
  // drop back to the login gate so the user can re-enter it.
  useEffect(() => {
    const onUnauthorized = () => setAuthed(false)
    window.addEventListener('searchbook:unauthorized', onUnauthorized)
    return () => window.removeEventListener('searchbook:unauthorized', onUnauthorized)
  }, [])

  if (!authed) {
    return <LoginGate onSuccess={() => setAuthed(true)} />
  }

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
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/mentions" element={<MentionsPage />} />
          {/* Calendar merged into the Actions page as a view; redirect old links/PWA shortcuts. */}
          <Route path="/calendar" element={<Navigate to="/actions?view=calendar" replace />} />
          <Route path="/ideas" element={<IdeaListPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/duplicates" element={<DuplicatesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <KeyboardShortcutsDialog />
      <Toaster />
      <PWAUpdatePrompt />
    </BrowserRouter>
  )
}

export default App
