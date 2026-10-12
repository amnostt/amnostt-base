import { Component } from '@angular/core';
import { Routes } from '@angular/router';

@Component({
  selector: 'app-home',
  template: `
    <section aria-labelledby="starter-title">
      <h1 id="starter-title">Angular starter</h1>
      <p>This independent app is a blank foundation for future work.</p>
    </section>
  `,
})
export class HomePage {}

export const routes: Routes = [{ path: '', component: HomePage }];
