export type OperaStatus = 'new' | 'in_progress' | 'completed' | 'failed';
export type OperaStepOrder = 'sequential' | 'checklist';

export interface OperaStepSummary {
  id: string;
  description: string;
  completed: boolean;
}

export interface OperaSummary {
  id: string;
  title: string;
  description: string;
  autoStart: boolean;
  stepOrder: OperaStepOrder;
  status: OperaStatus;
  steps: OperaStepSummary[];
}
