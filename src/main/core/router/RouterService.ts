import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { log } from '@main/lib/logger';

const execFileAsync = promisify(execFile);
d
const GEMINI_TIMEOUT_MS = 120_000;
const MAX_CLI_BUFFER_BYTES = 1024 * 1024 * 10;
const GEMINI_CONSULTANT_MODEL = 'gemini-2.5-flash';
const GEMINI_PROMPT_FLAG = '-p';

export class RouterService {
  async consultArchitecture(conversation: string): Promise<string> {
    const normalizedConversation = conversation.trim();
    if (!normalizedConversation) {
      throw new Error('Goal is required to consult on an agent strategy.');
    }

    try {
      return await this.generateGeminiConsultation(normalizedConversation);
    } catch (error) {
      log.warn('RouterService: Gemini CLI consultation failed, using local fallback', {
        error: String(error),
      });
      return this.generateFallbackConsultation(normalizedConversation);
    }
  }

  getConsultationPrompt(conversation: string): string {
    return [
      'You are the Koryphaios Brainstorm Consultant, an expert AI orchestrator.',
      'You are NOT the implementation agent for this request.',
      'Do not run tools, inspect files, edit files, execute commands, or claim that any work has been completed.',
      'Your job is to talk with the user and help shape the idea before implementation.',
      '',
      'Default behavior:',
      '- Be conversational and concise.',
      '- Ask 1 to 3 useful clarifying questions when the request is still underspecified.',
      '- Offer tradeoffs or a lightweight recommendation when helpful.',
      '- Do NOT immediately produce a full agent plan unless the user clearly asks to plan, says something like "ok plan this", "make the plan", "let\'s plan properly", or asks for copy/paste agent prompts.',
      '',
      'When the user explicitly asks for a proper plan:',
      '- Produce clean Markdown with copy/paste prompts.',
      '- Recommend only the agents that are actually useful for the task.',
      '- For easy tasks, it is fine to recommend exactly one agent.',
      '- Prefer Gemini CLI for simple research, small prototypes, or cheap/fast planning.',
      '- Prefer Claude Code for complex architecture, tricky multi-file logic, or large refactors.',
      '- Prefer Codex for focused code edits, debugging, verification, and terminal-first implementation.',
      '- Never force Claude Code, Gemini CLI, and Codex all into the plan unless each has a clear reason.',
      '',
      'If planning, use this shape:',
      '## Recommended Approach',
      'Brief summary of the chosen path.',
      '',
      '### Step 1: ...',
      '**Use:** Agent name',
      '**Why:** Short reason this agent is appropriate.',
      '**Prompt to copy:**',
      '```text',
      'Exact prompt',
      '```',
      '',
      'End with the next manual action for the user.',
      '',
      'Conversation so far:',
      conversation.trim(),
    ].join('\n');
  }

  private async generateGeminiConsultation(conversation: string): Promise<string> {
    const prompt = this.getConsultationPrompt(conversation);
    const args = [
      '--skip-trust',
      '--approval-mode',
      'plan',
      '--model',
      GEMINI_CONSULTANT_MODEL,
      GEMINI_PROMPT_FLAG,
      prompt,
    ];
    const { stdout } = await this.execGeminiCli(args);

    const markdown = stripAnsi(stdout).trim();
    if (!markdown) {
      throw new Error('Gemini CLI returned an empty consultation.');
    }
    return markdown;
  }

  private async execGeminiCli(args: string[]): Promise<{ stdout: string }> {
    const attempts = getGeminiCliAttempts(args);
    let lastError: unknown;

    for (const attempt of attempts) {
      try {
        return await execFileAsync(attempt.command, attempt.args, this.getCliOptions());
      } catch (error) {
        lastError = error;
        log.warn('RouterService: Gemini CLI attempt failed', {
          command: attempt.command,
          args: sanitizeArgsForLog(attempt.args),
          error: getExecErrorMessage(error),
        });
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private getCliOptions() {
    return {
      timeout: GEMINI_TIMEOUT_MS,
      maxBuffer: MAX_CLI_BUFFER_BYTES,
      windowsHide: true,
      ...(process.platform === 'win32' ? { windowsVerbatimArguments: true } : {}),
      env: {
        ...process.env,
        CI: 'true',
        GEMINI_CLI_TRUST_WORKSPACE: 'true',
        NO_COLOR: '1',
        TERM: process.env.TERM || 'xterm-256color',
      },
    };
  }

  private generateFallbackConsultation(conversation: string): string {
    return [
      'I could not reach Gemini CLI for the live consultant response, but we can still shape this together.',
      '',
      'A few questions before planning:',
      '',
      '1. What outcome do you want first: a tiny prototype, a polished implementation, or an architecture sketch?',
      '2. Are there any constraints like one file, no dependencies, or a specific framework?',
      '3. Do you want me to keep discussing options, or are you ready for a copy/paste agent plan?',
      '',
      'Current context I saw:',
      '',
      `> ${conversation.slice(-500)}`,
    ].join('\n');
  }
}

function stripAnsi(value: string): string {
  return value.replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    ''
  );
}

type GeminiCliAttempt = {
  command: string;
  args: string[];
};

function getGeminiCliAttempts(args: string[]): GeminiCliAttempt[] {
  const attempts =
    process.platform === 'win32'
      ? [
          createWindowsCmdAttempt(getGeminiCommand(), args),
          createWindowsCmdAttempt(getNpxCommand(), ['gemini', ...args]),
        ]
      : [
          { command: getGeminiCommand(), args },
          { command: getNpxCommand(), args: ['gemini', ...args] },
        ];

  const absoluteNpx = getAbsoluteWindowsNpxCommand();
  if (absoluteNpx) {
    attempts.push(createWindowsCmdAttempt(absoluteNpx, ['gemini', ...args]));
  }

  return attempts;
}

function createWindowsCmdAttempt(command: string, args: string[]): GeminiCliAttempt {
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/c', buildWindowsCommandLine(command, args)],
  };
}

function buildWindowsCommandLine(command: string, args: string[]): string {
  return ['call', quoteWindowsCmdArg(command), ...args.map(quoteWindowsCmdArg)].join(' ');
}

function quoteWindowsCmdArg(value: string): string {
  const escaped = value.replace(/\r?\n/g, ' ').replace(/"/g, "'").replace(/%/g, '%%');

  return `"${escaped}"`;
}

function getGeminiCommand(): string {
  return process.platform === 'win32' ? 'gemini.cmd' : 'gemini';
}

function getNpxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function getAbsoluteWindowsNpxCommand(): string | null {
  if (process.platform !== 'win32') return null;

  const appData = process.env.APPDATA;
  if (!appData) return null;

  return path.join(appData, 'npm', 'npx.cmd');
}

function sanitizeArgsForLog(args: string[]): string[] {
  return args.map((arg) => (arg.length > 200 ? `${arg.slice(0, 197)}...` : arg));
}

function getExecErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const routerService = new RouterService();
