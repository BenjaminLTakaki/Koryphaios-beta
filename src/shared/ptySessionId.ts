/**
 * Deterministic PTY session ID.
 *
 * Format: `<projectId>:<scopeId>:<leafId>` where leafId is either a
 * conversationId (agent sessions) or a terminalId (shell sessions).
 *
 * There is at most one active PTY per leaf entity.  Using a deterministic ID
 * means the renderer can subscribe to ptyDataChannel BEFORE calling
 * rpc.conversations.startSession / rpc.terminals.createTerminal — no extra
 * round-trip is needed to learn the session ID.
 */
export function makePtySessionId(projectId: string, scopeId: string, leafId: string): string {
  if ([projectId, scopeId, leafId].some((part) => part.length === 0 || part.includes(':'))) {
    throw new Error('PTY session ID parts must be non-empty and cannot contain ":".');
  }
  return `${projectId}:${scopeId}:${leafId}`;
}

export function parsePtySessionId(
  sessionId: string
): { projectId: string; scopeId: string; leafId: string } | null {
  const parts = sessionId.split(':');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
  const [projectId, scopeId, leafId] = parts;
  return { projectId, scopeId, leafId };
}
