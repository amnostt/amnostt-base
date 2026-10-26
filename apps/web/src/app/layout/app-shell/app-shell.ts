import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMoon, lucideSun } from '@ng-icons/lucide';
import { ZardBreadcrumbImports } from '@/shared/zard/components/breadcrumb/breadcrumb.imports';
import { ZardButtonComponent } from '@/shared/zard/components/button';
import { ZardSeparatorComponent } from '@/shared/zard/components/separator/separator.component';
import { ZardSidebarImports } from '@/shared/zard/components/sidebar/sidebar.imports';
import { ZardDarkMode } from '@/shared/zard/services/dark-mode';
import { AppSidebar } from '../app-sidebar/app-sidebar';

@Component({
  imports: [
    RouterOutlet,
    RouterLink,
    AppSidebar,
    ZardSeparatorComponent,
    NgIcon,
    ZardButtonComponent,
    ...ZardSidebarImports,
    ...ZardBreadcrumbImports,
  ],
  selector: 'app-app-shell',
  viewProviders: [provideIcons({ lucideMoon, lucideSun })],
  styleUrl: './app-shell.css',
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly title = inject(Title);

  protected readonly darkMode = inject(ZardDarkMode);

  toggleTheme(): void {
    this.darkMode.toggleTheme();
  }
}
