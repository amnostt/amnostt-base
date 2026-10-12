import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterLink, RouterOutlet],
  selector: 'app-root',
  template: `
    <header>
      <a routerLink="/" aria-label="Amnostt home">Amnostt</a>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
})
export class App {}
