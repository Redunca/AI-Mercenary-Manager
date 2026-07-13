import { TerminalController } from './terminal-controller';

// Bug: in execute(), history.push(this.input) was called after parseFn(), which
// already calls setInput('') via routeCommand. So the history recorded empty
// strings instead of the entered commands, and up/down navigation returned ''.
describe('TerminalController - command history', () => {
  let ctrl: TerminalController;

  beforeEach(() => {
    ctrl = new TerminalController(1, {});
  });

  it('should record the entered command in the history after execution', () => {
    ctrl.setInput('mission list');

    // Simulates the behavior of routeCommand, which clears the input before returning
    ctrl.execute((input, _panelId) => {
      ctrl.setInput('');
    });

    ctrl.historyPrevious();
    // With the bug: returns '' (input already cleared before history.push)
    // Expected behavior: return 'mission list'
    expect(ctrl.getInput()).toBe('mission list');
  });

  it('should allow navigating the history across several commands', () => {
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

  it('historyNext should return to an empty entry after the last command', () => {
    ctrl.setInput('logs');
    ctrl.execute((input, _panelId) => {
      ctrl.setInput('');
    });

    ctrl.historyPrevious();
    ctrl.historyNext();
    expect(ctrl.getInput()).toBe('');
  });

  // Regression test for the "two-line terminal" bug: the textarea's Enter
  // key wasn't calling preventDefault(), so the browser inserted a native
  // "\n" after the command ran, and the resulting (input) event re-synced
  // that "\n" back into the controller via setInput(), undoing the clear.
  // execute() must unconditionally win that race by clearing `input` itself
  // *after* parseFn returns, no matter what parseFn (or anything it
  // triggers) does to the input in the meantime.
  it('leaves the input empty after execute() even if parseFn leaves stray characters behind', () => {
    ctrl.setInput('mission list');

    ctrl.execute((input, _panelId) => {
      // Simulates the stale DOM value (trailing newline) that used to leak
      // back in via the textarea's (input) handler before the fix.
      ctrl.setInput(input + '\n');
    });

    expect(ctrl.getInput()).toBe('');
  });
});
