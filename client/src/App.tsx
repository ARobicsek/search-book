import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { Layout } from '@/components/layout'
import { HomePage } from '@/pages/home'
import { ContactListPage } from '@/pages/contacts/contact-list'
import { ContactFormPage } from '@/pages/contacts/contact-form'
import { ContactDetailPage } from '@/pages/contacts/contact-detail'
import { CompanyListPage } from '@/pages/companies/company-list'
import { CompanyFormPage } from '@/pages/companies/company-form'
import { CompanyDetailPage } from '@/pages/companies/company-detail'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/contacts" element={<ContactListPage />} />
          <Route path="/contacts/new" element={<ContactFormPage />} />
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
          <Route path="/contacts/:id/edit" element={<ContactFormPage />} />
          <Route path="/companies" element={<CompanyListPage />} />
          <Route path="/companies/new" element={<CompanyFormPage />} />
          <Route path="/companies/:id" element={<CompanyDetailPage />} />
          <Route path="/companies/:id/edit" element={<CompanyFormPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
