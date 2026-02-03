import { BookUser, Building2, LayoutDashboard, CalendarDays, ListTodo, Lightbulb } from 'lucide-react'
import { useLocation, Link } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const mainNav = [
  { title: 'Contacts', url: '/contacts', icon: BookUser },
  { title: 'Companies', url: '/companies', icon: Building2 },
]

const futureNav = [
  { title: 'Dashboard', url: '#', icon: LayoutDashboard, disabled: true },
  { title: 'Calendar', url: '#', icon: CalendarDays, disabled: true },
  { title: 'Actions', url: '#', icon: ListTodo, disabled: true },
  { title: 'Ideas', url: '#', icon: Lightbulb, disabled: true },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar>
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2 px-2 py-1">
          <BookUser className="h-6 w-6" />
          <span className="text-lg font-bold">SearchBook</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname.startsWith(item.url)}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Coming Soon</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {futureNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton disabled>
                    <item.icon />
                    <span className="text-muted-foreground">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
