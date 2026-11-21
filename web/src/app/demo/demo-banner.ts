import { Component, inject } from '@angular/core';
import { DemoBackend } from './demo-backend';

/** Shown only in the GitHub Pages demo build. */
@Component({
  selector: 'app-demo-banner',
  template: `
    <div class="demo-banner" role="note">
      <p>
        <strong>Live demo.</strong> This copy runs in your browser on sample data, with the order and
        inventory services simulated. The full system is a Java service, a Python service, and this
        Angular app on PostgreSQL.
        <a href="https://github.com/mjsampsonmusic/sizerun" target="_blank" rel="noopener">See the code</a>
      </p>
      <label class="demo-toggle">
        <input type="checkbox" [checked]="backend.outage()" (change)="toggleOutage($event)" />
        Simulate an inventory outage
      </label>
    </div>
  `,
})
export class DemoBanner {
  protected readonly backend = inject(DemoBackend);

  protected toggleOutage(event: Event): void {
    this.backend.outage.set((event.target as HTMLInputElement).checked);
  }
}
