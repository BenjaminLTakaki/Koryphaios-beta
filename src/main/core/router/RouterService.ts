import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { RouterConsultation } from '@shared/router';
import { log } from '@main/lib/logger';
import {
  GEMINI_PROMPT_FLAG,
  GEMINI_TIMEOUT_MS,
  MAX_CLI_BUFFER_BYTES,
  getConsultationPrompt,
  getGeminiConsultantModel,
} from './consultationPrompt';

const execFileAsync = promisify(execFile);

export class RouterService {
  async consultArchitecture(conversation: string): Promise<RouterConsultation> {
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
      return this.generateFallbackConsultation(normalizedConversation, getExecErrorMessage(error));
    }
  }

  getConsultationPrompt(conversation: string): string {
    return getConsultationPrompt(conversation);
  }

  private async generateGeminiConsultation(conversation: string): Promise<RouterConsultation> {
    const prompt = this.getConsultationPrompt(conversation);
    const model = getGeminiConsultantModel();
    const args = ['--skip-trust', '--model', model, GEMINI_PROMPT_FLAG, prompt];
    const { stdout } = await this.execGeminiCli(args);

    const markdown = stripAnsi(stdout).trim();
    if (!markdown) {
      throw new Error('Gemini CLI returned an empty consultation.');
    }
    return { markdown, source: 'gemini', model };
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
      env: {
        ...process.env,
        CI: 'true',
        GEMINI_CLI_TRUST_WORKSPACE: 'true',
        NO_COLOR: '1',
        TERM: process.env.TERM || 'xterm-256color',
      },
    };
  }

  private generateFallbackConsultation(
    conversation: string,
    fallbackReason: string
  ): RouterConsultation {
    const markdown = [
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

    return { markdown, source: 'fallback', fallbackReason };
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
    args: ['/d', '/c', 'call', command, ...args],
  };
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
