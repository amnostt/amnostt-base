import { Routes } from '@angular/router';
import { AppShell } from './layout/app-shell/app-shell';
import { Home } from './pages/home/home';
import { Forbidden } from './pages/forbidden/forbidden';
import { NotFound } from './pages/not-found/not-found';
import { Login } from './features/auth/presentation/login/login';

import { authGuard } from './features/auth/presentation/guards/auth.guard';
import { TaskList } from './features/tasks/presentation/task-list/task-list';
import { permissionGuard } from './features/auth/presentation/guards/permission.guard';
import { canReadTasks } from './features/tasks/domain/task-permissions';

export const routes: Routes = [
  {
    path: 'login',
    component: Login,
    title: 'Iniciar sesión',
  },
  {
    path: '',
    component: AppShell,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        component: Home,
        title: 'Inicio',
      },
      {
        path: '403',
        component: Forbidden,
        title: 'Acceso denegado',
      },
      {
        path: 'tasks',
        component: TaskList,
        title: 'Tareas',
        canActivate: [permissionGuard(canReadTasks)],
      },
      {
        path: '**',
        component: NotFound,
        title: 'Página no encontrada',
      },
    ],
  },
];
