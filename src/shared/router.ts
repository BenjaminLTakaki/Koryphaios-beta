export type PreferredAgent = 'claude' | 'gemini' | 'codex';

export type AgentTask = {
  id: string;
  title: string;
  description: string;
  preferredAgent: PreferredAgent;
  dependencies: string[];
};
