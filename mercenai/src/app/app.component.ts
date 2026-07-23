import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TerminalWindowComponent } from './terminal/terminal-window/terminal-window.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TerminalWindowComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'mercenai';
}
