import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AgentProviderId } from '@shared/agent-provider-registry';
import type { IExecutionContext } from '@main/core/execution-context/types';
import { log } from '@main/lib/logger';
import { quoteShellArg } from '@main/utils/shellEscape';

const execFileAsync = promisify(execFile);

export const KORYPHAIOS_CONTEXT_FILE = 'KORYPHAIOS_CONTEXT.md';

const CLAUDE_TIMEOUT_MS = 30_000;
const MAX_CLI_BUFFER_BYTES = 1024 * 1024;
const MAX_CAPTURE_CHARS = 64 * 1024;
const MAX_SUMMARY_CHARS = 6 * 1024;
const MAX_CONTEXT_FILE_CHARS = 256 * 1024;

type AgentOutputRecord = {
  projectPath: string;
  taskId: string;
  conversationId: string;
  providerId: AgentProviderId;
  output: string;
  exitCode?: number | null;
  ctx: IExecutionContext;
};

export class MemoryService {
  createContextInstruction(projectPath: string): string {
    const contextPath = path.join(projectPath, KORYPHAIOS_CONTEXT_FILE);
    return [
      `Before working, read the shared Koryphaios memory file if it exists: ${contextPath}`,
      'Use it as project context, and preserve any useful findings for later agents.',
    ].join('\n');
  }

  appendToCapture(current: string, chunk: string): string {
    const next = current + chunk;
    return next.length > MAX_CAPTURE_CHARS ? next.slice(-MAX_CAPTURE_CHARS) : next;
  }

  async recordAgentOutput(record: AgentOutputRecord): Promise<void> {
    const cleaned = this.cleanTerminalOutput(record.output);
    if (!cleaned.trim()) return;

    const summary = await this.summarize(cleaned);
    const section = [
      '',
      `## Agent Session: ${record.providerId} (${new Date().toISOString()})`,
      '',
      `- Task: ${record.taskId}`,
      `- Conversation: ${record.conversationId}`,
      `- Exit code: ${typeof record.exitCode === 'number' ? record.exitCode : 'unknown'}`,
      '',
      '```text',
      summary,
      '```',
      '',
    ].join('\n');

    await this.append(record.projectPath, record.ctx, section);
  }

  private async summarize(output: string): Promise<string> {
    try {
      const cliSummary = await this.summarizeWithClaude(output);
      if (cliSummary.trim()) return cliSummary.trim();
    } catch (error) {
      log.warn('MemoryService: Claude CLI summary failed, using local fallback', {
        error: String(error),
      });
    }

    return this.summarizeLocally(output);
  }

  private async summarizeWithClaude(output: string): Promise<string> {
    const prompt = [
      'Summarize this coding agent terminal session for future Koryphaios agents.',
      'Keep durable findings, decisions, files changed, errors, and commands/results.',
      'Omit progress noise, ANSI artifacts, prompts, spinners, and repeated terminal chatter.',
      'Return plain text only. No markdown heading.',
      '',
      'Terminal output:',
      output.slice(-MAX_CAPTURE_CHARS),
    ].join('\n');

    const { stdout, stderr } = await execFileAsync('claude', ['-p', prompt], {
      timeout: CLAUDE_TIMEOUT_MS,
      maxBuffer: MAX_CLI_BUFFER_BYTES,
      windowsHide: true,
      env: {
        ...process.env,
        CI: 'true',
        NO_COLOR: '1',
      },
    });

    const cleaned = this.cleanTerminalOutput(`${stdout}\n${stderr}`).trim();
    return cleaned.length > MAX_SUMMARY_CHARS
      ? `${cleaned.slice(0, MAX_SUMMARY_CHARS)}\n[summary truncated]`
      : cleaned;
  }

  private summarizeLocally(output: string): string {
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const compact = lines.join('\n');
    return compact.length > MAX_SUMMARY_CHARS
      ? `${compact.slice(-MAX_SUMMARY_CHARS)}\n[summary truncated to recent output]`
      : compact;
  }

  private cleanTerminalOutput(output: string): string {
    return stripAnsi(output)
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  private async append(
    projectPath: string,
    ctx: IExecutionContext,
    content: string
  ): Promise<void> {
    if (ctx.supportsLocalSpawn) {
      const filePath = path.join(projectPath, KORYPHAIOS_CONTEXT_FILE);
      await fs.appendFile(filePath, content, 'utf8');
      await this.trimLocalContextFile(filePath);
      return;
    }

    const remoteFilePath = `${projectPath.replace(/\/$/, '')}/${KORYPHAIOS_CONTEXT_FILE}`;
    const remoteDir = remoteFilePath.slice(0, remoteFilePath.lastIndexOf('/')) || '.';
    try {
      await ctx.exec('sh', [
        '-lc',
        `mkdir -p ${quoteShellArg(remoteDir)} && printf %s ${quoteShellArg(content)} >> ${quoteShellArg(remoteFilePath)}`,
      ]);
      await ctx.exec('sh', [
        '-lc',
        `tmp=$(mktemp) && tail -c ${MAX_CONTEXT_FILE_CHARS} ${quoteShellArg(remoteFilePath)} > "$tmp" && mv "$tmp" ${quoteShellArg(remoteFilePath)}`,
      ]);
    } catch (error) {
      log.warn('MemoryService: failed to append shared context', {
        projectPath,
        error: String(error),
      });
    }
  }

  private async trimLocalContextFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf8');
    if (content.length <= MAX_CONTEXT_FILE_CHARS) return;
    await fs.writeFile(filePath, content.slice(-MAX_CONTEXT_FILE_CHARS), 'utf8');
  }
}

function stripAnsi(value: string): string {
  return value.replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    ''
  );
}

export const memoryService = new MemoryService();
