import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { CommandPalette } from '@/components/command-palette'
import { Separator } from '@/components/ui/separator'

export function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <span className="text-sm text-muted-foreground">SearchBook</span>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">Ctrl</kbd>
            {' + '}
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">K</kbd>
          </span>
        </header>
        <main className="flex-1 overflow-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  )
}
