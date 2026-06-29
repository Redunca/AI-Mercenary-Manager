import { Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Candidate } from '../../models/candidate';
import { CandidateService } from '../../core/candidate.service';

@Component({
  selector: 'app-candidate-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './candidate-detail.component.html',
  styleUrl: './candidate-detail.component.scss',
})
export class CandidateDetailComponent implements OnInit {
  @Input() id!: string;
  candidateService = inject(CandidateService);

  candidate: Candidate | null = null;

  ngOnInit(): void {
    this.candidate = this.candidateService.candidates.find(c => c.id === this.id) ?? null;
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

  hireError: string | null = null;

  registerCommands() {
    return {
      'hire': () => {
        if (!this.candidate) return;
        const result = this.candidateService.hireCandidate(this.candidate.id);
        if (!result) {
          this.hireError = `Effectif complet (max ${this.candidateService.game.maxRecruits} recrues)`;
        }
      },
    };
  }
}
