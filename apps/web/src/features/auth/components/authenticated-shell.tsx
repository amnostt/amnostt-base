import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Link, Outlet, useLocation } from 'react-router';
import { useSession } from './session-provider';

export function AuthenticatedShell() {
  const { snapshot, logout } = useSession();
  const location = useLocation();
  if (
    snapshot.status !== 'authenticated' &&
    snapshot.status !== 'logout-pending'
  )
    return null;
  const user = snapshot.status === 'authenticated' ? snapshot.user : undefined;
  const canReadTasks =
    user?.permissions.includes('tasks:read:own') ||
    user?.permissions.includes('tasks:read:any');
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <nav aria-label="Primary navigation" className="grid gap-2">
            <Link to="/">Home</Link>
            <Link to="/password">Change password</Link>
            {canReadTasks && <Link to="/tasks">Tasks</Link>}
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <Button
            type="button"
            onClick={() => void logout()}
            disabled={snapshot.status === 'logout-pending'}
          >
            {snapshot.status === 'logout-pending' ? 'Logging out…' : 'Log out'}
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header
          className="flex items-center gap-2 border-b p-4"
          aria-label="Breadcrumb"
        >
          <SidebarTrigger />
          Home{location.pathname !== '/' && ` / ${location.pathname.slice(1)}`}
        </header>
        <main className="mx-auto grid w-full max-w-5xl gap-4 p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
