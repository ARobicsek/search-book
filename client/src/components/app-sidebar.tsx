import { BookUser, Building2, LayoutDashboard, CalendarDays, ListTodo, Lightbulb, BarChart3, Settings } from 'lucide-react'
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
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, exact: true },
  { title: 'Contacts', url: '/contacts', icon: BookUser },
  { title: 'Companies', url: '/companies', icon: Building2 },
  { title: 'Actions', url: '/actions', icon: ListTodo },
  { title: 'Calendar', url: '/calendar', icon: CalendarDays },
  { title: 'Ideas', url: '/ideas', icon: Lightbulb },
  { title: 'Analytics', url: '/analytics', icon: BarChart3 },
  { title: 'Settings', url: '/settings', icon: Settings },
]

export function AppSidebar() {
  const location = useLocation()

  function isActive(item: typeof mainNav[number]) {
    if (item.exact) return location.pathname === item.url
    return location.pathname.startsWith(item.url)
  }

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
                  <SidebarMenuButton asChild isActive={isActive(item)}>
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
      </SidebarContent>
    </Sidebar>
  )
}
