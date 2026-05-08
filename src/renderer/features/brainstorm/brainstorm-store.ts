import { makeAutoObservable, toJS } from 'mobx';
import type { RouterConsultationSource } from '@shared/router';

export type BrainstormMessageRole = 'user' | 'assistant';

export type BrainstormMessage = {
  id: string;
  role: BrainstormMessageRole;
  content: string;
  createdAt: number;
  source?: RouterConsultationSource;
  fallbackReason?: string;
};

export type BrainstormSnapshot = {
  messages: BrainstormMessage[];
};

function createMessage(
  role: BrainstormMessageRole,
  content: string,
  metadata?: Pick<BrainstormMessage, 'source' | 'fallbackReason'>
): BrainstormMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: Date.now(),
    ...metadata,
  };
}

const WELCOME_MESSAGE = createMessage(
  'assistant',
  'Bring me the messy version: goals, constraints, doubts, sharp edges. I will help turn it into a plan before anyone touches a worktree.'
);

export class BrainstormStore {
  messages: BrainstormMessage[] = [WELCOME_MESSAGE];
  isConsulting = false;
  consultationError: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  submitPrompt(prompt: string): void {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    this.messages.push(createMessage('user', trimmed));
  }

  reset(): void {
    this.messages = [createMessage('assistant', WELCOME_MESSAGE.content)];
    this.consultationError = null;
  }

  get snapshot(): BrainstormSnapshot {
    return {
      messages: toJS(this.messages),
    };
  }

  restoreSnapshot(snapshot: Partial<BrainstormSnapshot>): void {
    if (Array.isArray(snapshot.messages) && snapshot.messages.length > 0) {
      this.messages = snapshot.messages;
    }
  }

  setConsulting(isConsulting: boolean): void {
    this.isConsulting = isConsulting;
  }

  addAssistantResponse(
    response: string,
    metadata?: Pick<BrainstormMessage, 'source' | 'fallbackReason'>
  ): void {
    const trimmed = response.trim();
    if (!trimmed) return;

    this.messages.push(createMessage('assistant', trimmed, metadata));
    this.consultationError = null;
  }

  setConsultationError(error: string): void {
    this.consultationError = error;
  }
}
