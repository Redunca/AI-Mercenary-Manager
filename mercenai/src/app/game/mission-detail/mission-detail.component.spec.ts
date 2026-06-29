import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MissionDetailComponent } from './mission-detail.component';

// Bug : le getter `mission` utilise missions[this.id] (accès par index de tableau)
// au lieu de missions.find(m => m.id === this.id) (recherche par identifiant).
// Les IDs de missions commencent à 1, les indices de tableau à 0 : décalage systématique.
describe('MissionDetailComponent - getter mission', () => {
  let component: MissionDetailComponent;
  let fixture: ComponentFixture<MissionDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MissionDetailComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MissionDetailComponent);
    component = fixture.componentInstance;
  });

  it('devrait retourner la mission avec id=1 quand le composant reçoit id=1', () => {
    component.id = 1;
    fixture.detectChanges();

    // Avec le bug : missions[1] retourne la mission id=2 ("Livraison express")
    // Comportement attendu : retourner la mission id=1 ("Patrouille de couloir")
    expect(component.mission).not.toBeNull();
    expect(component.mission?.id).toBe(1);
  });

  it('devrait retourner la mission avec id=2 quand le composant reçoit id=2', () => {
    component.id = 2;
    fixture.detectChanges();

    // Avec le bug : missions[2] retourne la mission id=3
    // Comportement attendu : retourner la mission id=2 ("Livraison express")
    expect(component.mission).not.toBeNull();
    expect(component.mission?.id).toBe(2);
  });

  it('devrait retourner null pour un id de mission inexistant', () => {
    component.id = 999;
    fixture.detectChanges();

    expect(component.mission).toBeNull();
  });
});
