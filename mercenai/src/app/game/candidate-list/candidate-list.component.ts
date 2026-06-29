import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Candidate } from '../../models/candidate';
import { CandidateService } from '../../core/candidate.service';

@Component({
  selector: 'app-candidate-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './candidate-list.component.html',
  styleUrl: './candidate-list.component.scss',
})
export class CandidateListComponent {
  candidateService = inject(CandidateService);

  get candidates(): Candidate[] {
    return this.candidateService.candidates;
  }

  archetypeLabel(c: Candidate): string {
    switch (c.archetype) {
      case 'specialized':        return 'Spécialisé';
      case 'well-rounded':       return 'Polyvalent';
      case 'jack-of-all-trades': return 'Touche-à-tout';
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
    };
  }
}
