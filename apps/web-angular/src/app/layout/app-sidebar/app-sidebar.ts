import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
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
  protected readonly sidebar = inject(ZardSidebarService);
  protected readonly menuSide = computed(() => (this.sidebar.isMobile() ? 'bottom' : 'right'));
  protected readonly menuAlign = computed(() => (this.sidebar.isMobile() ? 'end' : 'start'));

  // Presentation fixtures only: no account, team, project, or session API is called.
  protected readonly user = { name: 'María García', email: 'maria@example.com', initials: 'MG' };
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
}
