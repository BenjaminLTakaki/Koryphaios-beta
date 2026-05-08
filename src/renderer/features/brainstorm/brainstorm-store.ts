import { makeAutoObservable, toJS } from 'mobx';

export type BrainstormMessageRole = 'user' | 'assistant';

export type BrainstormMessage = {
  id: string;
  role: BrainstormMessageRole;
  content: string;
  createdAt: number;
};

export type BrainstormSnapshot = {
  messages: BrainstormMessage[];
  consultation: string | null;
};

function createMessage(role: BrainstormMessageRole, content: string): BrainstormMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: Date.now(),
  };
}

const WELCOME_MESSAGE = createMessage(
  'assistant',
  'Bring me the messy version: goals, constraints, doubts, sharp edges. I will help turn it into a plan before anyone touches a worktree.'
);

export class BrainstormStore {
  messages: BrainstormMessage[] = [WELCOME_MESSAGE];
  consultation: string | null = null;
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

  addAssistantMessage(content: string): void {
    const trimmed = content.trim();
    if (!trimmed) return;

    this.messages.push(createMessage('assistant', trimmed));
    this.consultation = trimmed;
    this.consultationError = null;
  }

  reset(): void {
    this.messages = [createMessage('assistant', WELCOME_MESSAGE.content)];
    this.consultation = null;
    this.consultationError = null;
  }

  get snapshot(): BrainstormSnapshot {
    return {
      messages: toJS(this.messages),
      consultation: this.consultation,
    };
  }

  restoreSnapshot(snapshot: Partial<BrainstormSnapshot>): void {
    if (Array.isArray(snapshot.messages) && snapshot.messages.length > 0) {
      this.messages = snapshot.messages;
    }
    if (typeof snapshot.consultation === 'string' || snapshot.consultation === null) {
      this.consultation = snapshot.consultation;
    }
  }

  setConsulting(isConsulting: boolean): void {
    this.isConsulting = isConsulting;
  }

  setConsultation(consultation: string): void {
    this.addAssistantMessage(consultation);
  }

  setConsultationError(error: string): void {
    this.consultationError = error;
  }
}
