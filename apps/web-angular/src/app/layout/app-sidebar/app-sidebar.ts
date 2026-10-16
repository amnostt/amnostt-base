import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAudioWaveform,
  lucideBadgeCheck,
  lucideBell,
  lucideBookOpen,
  lucideBot,
  lucideChevronRight,
  lucideChevronsUpDown,
  lucideCommand,
  lucideCreditCard,
  lucideFolder,
  lucideForward,
  lucideFrame,
  lucideGalleryVerticalEnd,
  lucideLogOut,
  lucideMap,
  lucideMoreHorizontal,
  lucidePieChart,
  lucidePlus,
  lucideSettings2,
  lucideSparkles,
  lucideSquareTerminal,
  lucideTrash2,
} from '@ng-icons/lucide';
import { ZardAvatarComponent } from '@/shared/zard/components/avatar/avatar.component';
import { ZardCollapsibleImports } from '@/shared/zard/components/collapsible/collapsible.imports';
import { ZardDropdownImports } from '@/shared/zard/components/dropdown/dropdown.imports';
import { ZardSidebarImports } from '@/shared/zard/components/sidebar/sidebar.imports';
import { ZardSidebarService } from '@/shared/zard/components/sidebar/sidebar.service';
import { SessionStore } from '@/features/auth/application/session-store';
import { CurrentUser } from '@/features/auth/domain/auth-models';

interface SidebarUser {
  name: string;
  email: string;
  initials: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgIcon,
    ZardAvatarComponent,
    ...ZardSidebarImports,
    ...ZardCollapsibleImports,
    ...ZardDropdownImports,
  ],
  viewProviders: [
    provideIcons({
      lucideAudioWaveform,
      lucideBadgeCheck,
      lucideBell,
      lucideBookOpen,
      lucideBot,
      lucideChevronRight,
      lucideChevronsUpDown,
      lucideCommand,
      lucideCreditCard,
      lucideFolder,
      lucideForward,
      lucideFrame,
      lucideGalleryVerticalEnd,
      lucideLogOut,
      lucideMap,
      lucideMoreHorizontal,
      lucidePieChart,
      lucidePlus,
      lucideSettings2,
      lucideSparkles,
      lucideSquareTerminal,
      lucideTrash2,
    }),
  ],
  templateUrl: './app-sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class AppSidebar {
  private readonly sessionStore = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly logoutUser = signal<SidebarUser | null>(null);

  protected readonly isLoggingOut = computed(
    () => this.sessionStore.state().status === 'logout-pending',
  );

  protected readonly user = computed(() => {
    const state = this.sessionStore.state();
    if (state.status === 'logout-pending') return this.logoutUser();
    if (state.status !== 'authenticated') return null;

    const user: CurrentUser = state.user;
    const initials =
      user.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join('')
        .toUpperCase() || user.email.charAt(0).toUpperCase();

    return { name: user.name, email: user.email, initials };
  });

  protected readonly sidebar = inject(ZardSidebarService);
  protected readonly menuSide = computed(() => (this.sidebar.isMobile() ? 'bottom' : 'right'));
  protected readonly menuAlign = computed(() => (this.sidebar.isMobile() ? 'end' : 'start'));

  // Team, and project presentation fixtures; logout uses the real session API.
  protected readonly teams = [
    { name: 'Estudio Norte', logo: 'lucideGalleryVerticalEnd', plan: 'Plan empresarial' },
    { name: 'Equipo Horizonte', logo: 'lucideAudioWaveform', plan: 'Plan inicial' },
    { name: 'Laboratorio Sur', logo: 'lucideCommand', plan: 'Plan gratuito' },
  ];
  protected readonly selectedTeam = signal(this.teams[0]);
  protected readonly navigation = [
    {
      title: 'Área de trabajo',
      icon: 'lucideSquareTerminal',
      open: true,
      items: ['Historial', 'Favoritos', 'Configuración'],
    },
    {
      title: 'Modelos',
      icon: 'lucideBot',
      open: false,
      items: ['Modelo inicial', 'Explorador', 'Modelo avanzado'],
    },
    {
      title: 'Documentación',
      icon: 'lucideBookOpen',
      open: false,
      items: ['Introducción', 'Primeros pasos', 'Tutoriales', 'Registro de cambios'],
    },
    {
      title: 'Configuración',
      icon: 'lucideSettings2',
      open: false,
      items: ['General', 'Equipo', 'Facturación', 'Límites'],
    },
  ];
  protected readonly projects = [
    { name: 'Ingeniería de diseño', icon: 'lucideFrame' },
    { name: 'Ventas y marketing', icon: 'lucidePieChart' },
    { name: 'Planificación de viajes', icon: 'lucideMap' },
  ];

  protected async onLogout(): Promise<void> {
    if (this.isLoggingOut()) {
      return;
    }

    this.logoutUser.set(this.user());
    try {
      await this.sessionStore.logout();
    } catch {
      // Local session cleanup is handled by the store.
    } finally {
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    }
  }
}
