import { AlertTriangle, Bot, Loader2, RotateCcw, Send, User } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { rpc } from '@renderer/lib/ipc';
import { appState } from '@renderer/lib/stores/app-state';
import { Button } from '@renderer/lib/ui/button';
import { MarkdownRenderer } from '@renderer/lib/ui/markdown-renderer';
import { Textarea } from '@renderer/lib/ui/textarea';
import { cn } from '@renderer/utils/utils';

export const BrainstormView = observer(function BrainstormView() {
  const [draft, setDraft] = useState('');
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const { messages, isConsulting, consultationError } = appState.brainstorm;

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, isConsulting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goal = draft.trim();
    if (!goal || isConsulting) return;

    appState.brainstorm.submitPrompt(goal);
    setDraft('');
    appState.brainstorm.setConsulting(true);
    try {
      const result = await rpc.router.consultArchitecture({
        conversationTranscript: buildConsultationTranscript(appState.brainstorm.messages),
      });
      if (result.success) {
        appState.brainstorm.addAssistantResponse(result.data.markdown, {
          source: result.data.source,
          fallbackReason: result.data.fallbackReason,
        });
      } else {
        appState.brainstorm.setConsultationError(result.error);
      }
    } catch (error) {
      appState.brainstorm.setConsultationError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      appState.brainstorm.setConsulting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground">Brainstorm</h1>
          <p className="mt-0.5 truncate text-xs text-foreground-muted">
            Explore architecture and strategy before opening a coding worktree.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => appState.brainstorm.reset()}
          aria-label="Reset brainstorm"
        >
          <RotateCcw className="size-4" />
          Reset
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && <MessageAvatar role={message.role} />}
              <article
                className={cn(
                  'max-w-[78%] rounded-lg border px-3.5 py-3 text-sm leading-6 shadow-sm',
                  message.role === 'user'
                    ? 'border-primary/30 bg-primary-button-background text-primary-button-foreground'
                    : 'border-border bg-background-1 text-foreground'
                )}
              >
                {message.role === 'assistant' ? (
                  <>
                    {message.source === 'fallback' && (
                      <div className="mb-2 flex items-center gap-1.5 rounded-md border border-border bg-background-2 px-2 py-1 text-xs text-foreground-muted">
                        <AlertTriangle className="size-3.5" />
                        Local fallback. Gemini CLI was unavailable.
                      </div>
                    )}
                    <MarkdownRenderer
                      content={message.content}
                      variant="compact"
                      className="max-w-none"
                    />
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </article>
              {message.role === 'user' && <MessageAvatar role={message.role} />}
            </div>
          ))}
          {isConsulting && (
            <div className="flex justify-start gap-3">
              <MessageAvatar role="assistant" />
              <article className="flex max-w-[78%] items-center gap-2 rounded-lg border border-border bg-background-1 px-3.5 py-3 text-sm text-foreground-muted shadow-sm">
                <Loader2 className="size-4 animate-spin" />
                Consulting assistant...
              </article>
            </div>
          )}
          <div ref={scrollAnchorRef} />
        </div>
      </div>

      {consultationError && (
        <div className="border-t border-border bg-background-1 px-5 py-3">
          <div className="mx-auto w-full max-w-3xl">
            <p className="text-sm text-foreground-destructive">{consultationError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-border bg-background px-5 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={'Talk through the idea. When ready, say "let\'s plan this properly"...'}
            className="max-h-40 min-h-20 resize-none bg-background-1"
            disabled={isConsulting}
          />
          <Button
            type="submit"
            size="icon-lg"
            aria-label="Send message"
            disabled={!draft.trim() || isConsulting}
          >
            {isConsulting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
});

function buildConsultationTranscript(
  messages: Array<{ role: 'assistant' | 'user'; content: string }>
): string {
  return messages
    .map((message) => `${message.role === 'user' ? 'User' : 'Consultant'}: ${message.content}`)
    .join('\n\n');
}

function MessageAvatar({ role }: { role: 'assistant' | 'user' }) {
  const Icon = role === 'assistant' ? Bot : User;

  return (
    <div
      className={cn(
        'mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border',
        role === 'assistant'
          ? 'border-border bg-background-2 text-foreground-muted'
          : 'border-primary/30 bg-primary/10 text-primary'
      )}
    >
      <Icon className="size-4" />
    </div>
  );
}
