import { Outlet, useNavigate } from 'react-router-dom'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { CommandPaletteProvider, useCommandPalette } from '@/components/command-palette'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

function LayoutContent() {
  const { open: openPalette } = useCommandPalette()
  const navigate = useNavigate()

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <span className="text-sm text-muted-foreground">SearchBook</span>
          <div className="ml-auto flex items-center gap-2">
            {/* Mobile search button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 sm:hidden"
              onClick={() => navigate('/search')}
              aria-label="Open search"
            >
              <Search className="h-5 w-5" />
            </Button>
            {/* Desktop keyboard shortcut hint */}
            <span className="hidden text-xs text-muted-foreground sm:inline">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">Ctrl</kbd>
              {' + '}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">K</kbd>
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </>
  )
}

export function Layout() {
  return (
    <SidebarProvider>
      <CommandPaletteProvider>
        <LayoutContent />
      </CommandPaletteProvider>
    </SidebarProvider>
  )
}
