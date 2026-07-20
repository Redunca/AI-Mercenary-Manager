import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GenerationResult, GraphDefinition, GraphSummary, MockState } from '../models/graph';

@Injectable({ providedIn: 'root' })
export class GraphApiService {
  private http = inject(HttpClient);
  private base = '/api/graphs';

  listGraphs(): Promise<GraphSummary[]> {
    return firstValueFrom(this.http.get<GraphSummary[]>(this.base));
  }

  getGraph(id: string): Promise<GraphDefinition> {
    return firstValueFrom(this.http.get<GraphDefinition>(`${this.base}/${id}`));
  }

  createGraph(id: string, title: string, description: string): Promise<GraphDefinition> {
    return firstValueFrom(this.http.post<GraphDefinition>(this.base, { id, title, description }));
  }

  saveGraph(def: GraphDefinition): Promise<GraphDefinition> {
    return firstValueFrom(this.http.put<GraphDefinition>(`${this.base}/${def.id}`, def));
  }

  deleteGraph(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/${id}`));
  }

  analyzeGraph(id: string): Promise<{ warnings: string[] }> {
    return firstValueFrom(this.http.get<{ warnings: string[] }>(`${this.base}/${id}/analyze`));
  }

  generate(id: string, initialState: MockState, seed: string): Promise<GenerationResult> {
    return firstValueFrom(this.http.post<GenerationResult>(`${this.base}/${id}/generate`, { initialState, seed }));
  }
}
