import { Component, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Candidate } from '../../models/candidate';
import { CandidateService } from '../../core/candidate.service';
import { GameService } from '../../core/game.service';

@Component({
  selector: 'app-candidate-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './candidate-detail.component.html',
  styleUrl: './candidate-detail.component.scss',
})
export class CandidateDetailComponent {
  @Input() id!: string;
  candidateService = inject(CandidateService);
  game = inject(GameService);

  hireError: string | null = null;

  get candidate(): Candidate | null {
    return this.candidateService.candidates.find(c => c.id === this.id) ?? null;
  }

  archetypeLabel(c: Candidate): string {
    switch (c.archetype) {
      case 'specialized':        return 'Spécialisé';
      case 'well-rounded':       return 'Polyvalent';
      case 'jack-of-all-trades': return 'Touche-à-tout';
    }
  }

  statBar(value: number): string {
    return '[' + '■'.repeat(value) + '□'.repeat(10 - value) + ']';
  }

  registerCommands() {
    return {
      'hire': () => {
        if (!this.candidate) return;
        void this.candidateService.hireCandidate(this.candidate.id).then(result => {
          if (!result) {
            this.hireError = `Effectif complet (max ${this.game.player$.value.maxNumberOfRecruits} recrues)`;
          }
        });
      },
    };
  }
}
