import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { Layout } from '@/components/layout'
import { HomePage } from '@/pages/home'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/contacts" element={<div>Contacts list placeholder</div>} />
          <Route path="/contacts/new" element={<div>New contact placeholder</div>} />
          <Route path="/contacts/:id" element={<div>Contact detail placeholder</div>} />
          <Route path="/contacts/:id/edit" element={<div>Edit contact placeholder</div>} />
          <Route path="/companies" element={<div>Companies list placeholder</div>} />
          <Route path="/companies/new" element={<div>New company placeholder</div>} />
          <Route path="/companies/:id" element={<div>Company detail placeholder</div>} />
          <Route path="/companies/:id/edit" element={<div>Edit company placeholder</div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
