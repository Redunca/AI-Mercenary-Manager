import { Injectable } from '@angular/core';
import { ModuleDisplayBaseComponent } from '../modules/module-display-base/module-display-base.component';

@Injectable({
  providedIn: 'root'
})
export class TerminalService {

  constructor() { }

  public currentInput = '';

  private history: string[] = [];
  private historyIndex: number = -1;

  public activePanelId: number = 0;
  public activeCommands: {[commandName: string]: () => void} = {};

  public setActivePanel(module : ModuleDisplayBaseComponent)
  {
    this.activeCommands = module.commands;
  }

  public setInput(textInput: string){
    this.currentInput = textInput;
  }

  public getInput():string{
    return this.currentInput;
  }

  public handleEnter(){
    this.history.push(this.currentInput);
    this.historyIndex = -1;
    if(this.activeCommands[this.currentInput] != null){
      this.activeCommands[this.currentInput]();
    }
    this.currentInput = '';
  }

  //Flèche vers le haut
  public historyPrevious(){
    if(this.history != null && this.history.length !=0){
      if(this.historyIndex == -1)
      {
        this.historyIndex = this.history.length -1;
      }
      else if(this.historyIndex > 0){
        //Si on arrive à 0, on est sur la plus vieille commande
        //Donc on ne fait plus rien
        this.historyIndex--;
      }
      else if(this.historyIndex == 0){
        //do nothing
      }
      this.setInput(this.history[this.historyIndex]);
    }
    
  }

  //Flèche vers le bas
  public historyNext(){
    this.historyIndex++;
    if(this.historyIndex == this.history.length){
      //on est resortis de l'historique, on clear l'input
      this.setInput('');
      this.historyIndex = -1;
    }
    else{
      this.setInput(this.history[this.historyIndex]);
    }
  }

  public getSuggestions(): string[]{
    //TODO
    return [];
  }

}
