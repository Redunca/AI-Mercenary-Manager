export type OperaStatus = 'in_progress' | 'completed' | 'failed';
export type OperaTaskStatus = 'done' | 'current';

// One revealed beat of the walk -- story text, a mission handed off, a
// choice presented, or the final outcome. Only beats the walk has actually
// reached appear here: an opera never shows locked/future tasks, since the
// underlying graph hasn't decided what those are yet (see the opera
// generation plan's "linear list of tasks, revealed one at a time").
export interface OperaTask {
  nodeId: string;
  type: 'story' | 'check' | 'seed' | 'mission' | 'choice' | 'end';
  text: string;
  status: OperaTaskStatus;
  templateId?: number;
  outcome?: 'success' | 'failure' | 'neutral';
  options?: { id: string; label: string }[];
}

export interface OperaChoicePrompt {
  nodeId: string;
  text: string;
  options: { id: string; label: string }[];
}

export interface OperaSummary {
  id: string;
  templateId: string;
  title: string;
  description: string;
  status: OperaStatus;
  slotIndex: number | null;
  tasks: OperaTask[];
  pendingChoice: OperaChoicePrompt | null;
}
