import { Component, ElementRef, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TAG_CATALOG, allTagNames, extractPlaceholders } from '../models/tags';

// A textarea used for node text/completionText, plus a "Insert tag" picker
// and a live list of the {tagName} placeholders the current text
// references, flagging any not in the shared TAG_CATALOG (same catalog the
// server's analyzeGraph warns about -- see opera-forge/server/src/domain/graph.js).
@Component({
  selector: 'app-tag-text-field',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tag-text-field.component.html',
  styleUrl: './tag-text-field.component.scss',
})
export class TagTextFieldComponent {
  @Input() label = '';
  @Input() rows = 3;
  @Input() value?: string;
  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('ta') textareaRef?: ElementRef<HTMLTextAreaElement>;

  readonly tagCatalog = TAG_CATALOG;
  readonly knownTagNames = new Set(allTagNames());

  get usedTags(): string[] {
    return extractPlaceholders(this.value);
  }

  isKnownTag(name: string): boolean {
    return this.knownTagNames.has(name);
  }

  onInput(text: string): void {
    this.valueChange.emit(text);
  }

  insertTag(tagName: string): void {
    const el = this.textareaRef?.nativeElement;
    const text = this.value ?? '';
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}{${tagName}}${text.slice(end)}`;
    this.valueChange.emit(next);
  }
}
