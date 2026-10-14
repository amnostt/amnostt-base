import { Routes } from '@angular/router';
import { AppShell } from './layout/app-shell/app-shell';
import { Home } from './pages/home/home';
import { Forbidden } from './pages/forbidden/forbidden';
import { NotFound } from './pages/not-found/not-found';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
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
        path: '**',
        component: NotFound,
        title: 'Página no encontrada',
      },
    ],
  },
];
