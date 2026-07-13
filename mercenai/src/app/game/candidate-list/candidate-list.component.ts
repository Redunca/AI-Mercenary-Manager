import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Candidate } from '../../models/candidate';
import { CandidateService } from '../../core/candidate.service';
import { LayoutService } from '../../core/layout.service';
import { PanelModule } from '../../models/panel';

@Component({
  selector: 'app-candidate-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './candidate-list.component.html',
  styleUrl: './candidate-list.component.scss',
})
export class CandidateListComponent {
  candidateService = inject(CandidateService);
  layout = inject(LayoutService);

  get candidates(): Candidate[] {
    return this.candidateService.candidates;
  }

  archetypeLabel(c: Candidate): string {
    switch (c.archetype) {
      case 'specialized':        return 'Specialist';
      case 'well-rounded':       return 'Versatile';
      case 'jack-of-all-trades': return 'Jack-of-all-trades';
    }
  }

  perkNames(c: Candidate): string {
    return c.perks.map(p => p.name).join(', ');
  }

  flawNames(c: Candidate): string {
    return c.flaws.map(f => f.name).join(', ');
  }

  registerCommands() {
    return {
      'refresh': () => { void this.candidateService.generateCandidates(5); },
      'detail': (id: string) => {
        if (!id) { console.warn('Usage: detail <id>'); return; }
        this.layout.setPanelModule(this.layout.activePanelId!, PanelModule.CandidateDetail, { id });
      },
    };
  }
}
