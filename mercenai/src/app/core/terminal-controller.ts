export class TerminalController {
  private input = '';
  private history: string[] = [];
  private index = -1;

  constructor(
    public panelId: number,
    public localCommands: { [name: string]: (...args: string[]) => void },
  ) {}

  setInput(value: string) {
    this.input = value;
  }

  getInput() {
    return this.input;
  }

  execute(parseFn: (input: string, panelId: number) => void) {
    const trimmedInput = this.input.trim();
    const snapshot = this.input;
    parseFn(trimmedInput, this.panelId);
    this.history.push(snapshot);
    this.index = -1;
    this.input = '';
  }

  historyPrevious() {
    if (this.history.length === 0) return;

    if (this.index === -1) {
      this.index = this.history.length - 1;
    } else if (this.index > 0) {
      this.index--;
    }

    this.input = this.history[this.index];
  }

  historyNext() {
    if (this.index === -1) return;

    this.index++;
    if (this.index >= this.history.length) {
      this.index = -1;
      this.input = '';
    } else {
      this.input = this.history[this.index];
    }
  }
}
