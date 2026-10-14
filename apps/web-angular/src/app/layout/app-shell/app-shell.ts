import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ZardBreadcrumbImports } from '@/shared/zard/components/breadcrumb/breadcrumb.imports';
import { ZardSeparatorComponent } from '@/shared/zard/components/separator/separator.component';
import { ZardSidebarImports } from '@/shared/zard/components/sidebar/sidebar.imports';
import { AppSidebar } from '../app-sidebar/app-sidebar';

@Component({
  imports: [
    RouterOutlet,
    RouterLink,
    AppSidebar,
    ZardSeparatorComponent,
    ...ZardSidebarImports,
    ...ZardBreadcrumbImports,
  ],
  selector: 'app-app-shell',
  styleUrl: './app-shell.css',
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly title = inject(Title);
}
