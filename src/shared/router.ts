export type RouterConsultationSource = 'gemini' | 'fallback';

export type RouterConsultation = {
  markdown: string;
  source: RouterConsultationSource;
  model?: string;
  fallbackReason?: string;
};
