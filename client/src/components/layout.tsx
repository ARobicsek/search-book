import { Outlet, useNavigate } from 'react-router-dom'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { CommandPaletteProvider, useCommandPalette } from '@/components/command-palette'
import { QuickLogProvider, useQuickLog } from '@/components/quick-log-dialog'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Search, MessageSquarePlus } from 'lucide-react'

function LayoutContent() {
  const navigate = useNavigate()
  const quickLog = useQuickLog()
  const commandPalette = useCommandPalette()

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <span className="text-sm text-muted-foreground">SearchBook</span>
          <div className="ml-auto flex items-center gap-2">
            {/* Quick Log — a meeting is loggable from anywhere in two taps */}
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={quickLog.open}
            >
              <MessageSquarePlus className="mr-1 h-4 w-4" />
              Log Meeting
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 sm:hidden"
              onClick={quickLog.open}
              aria-label="Quick log meeting"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </Button>
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
            {/* Desktop search — clickable, opens the command palette (kbd hint as adornment) */}
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={commandPalette.open}
              aria-label="Open search"
            >
              <Search className="mr-1 h-4 w-4" />
              Search
              <span className="ml-2 text-muted-foreground">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">Ctrl</kbd>
                {' + '}
                <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">K</kbd>
              </span>
            </Button>
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
      <QuickLogProvider>
        <CommandPaletteProvider>
          <LayoutContent />
        </CommandPaletteProvider>
      </QuickLogProvider>
    </SidebarProvider>
  )
}
