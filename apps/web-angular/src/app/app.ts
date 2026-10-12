import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ZardButtonComponent } from '@/shared/zard/components/button/button.component';

@Component({
  imports: [RouterOutlet, ZardButtonComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('web-angular');
}
