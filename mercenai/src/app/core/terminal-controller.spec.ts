import { TerminalController } from './terminal-controller';

// Bug : dans execute(), history.push(this.input) est appelé après parseFn() qui
// appelle déjà setInput('') via routeCommand. L'historique enregistre donc des
// chaînes vides au lieu des commandes saisies. La navigation haut/bas retourne ''.
describe('TerminalController - historique des commandes', () => {
  let ctrl: TerminalController;

  beforeEach(() => {
    ctrl = new TerminalController(1, {});
  });

  it('devrait enregistrer la commande saisie dans l\'historique après exécution', () => {
    ctrl.setInput('mission list');

    // Simule le comportement de routeCommand qui vide l'input avant le retour
    ctrl.execute((input, _panelId) => {
      ctrl.setInput('');
    });

    ctrl.historyPrevious();
    // Avec le bug : retourne '' (input déjà vidé avant history.push)
    // Comportement attendu : retourner 'mission list'
    expect(ctrl.getInput()).toBe('mission list');
  });

  it('devrait permettre la navigation dans l\'historique avec plusieurs commandes', () => {
    const commands = ['recruit list', 'mission list', 'home'];

    for (const cmd of commands) {
      ctrl.setInput(cmd);
      ctrl.execute((input, _panelId) => {
        ctrl.setInput('');
      });
    }

    ctrl.historyPrevious();
    expect(ctrl.getInput()).toBe('home');

    ctrl.historyPrevious();
    expect(ctrl.getInput()).toBe('mission list');

    ctrl.historyPrevious();
    expect(ctrl.getInput()).toBe('recruit list');
  });

  it('historyNext devrait revenir à une entrée vide après la dernière commande', () => {
    ctrl.setInput('logs');
    ctrl.execute((input, _panelId) => {
      ctrl.setInput('');
    });

    ctrl.historyPrevious();
    ctrl.historyNext();
    expect(ctrl.getInput()).toBe('');
  });
});
