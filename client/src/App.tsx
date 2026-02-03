import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="p-8"><h1 className="text-2xl font-bold">SearchBook</h1><p className="text-muted-foreground mt-2">App shell coming next...</p></div>} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
