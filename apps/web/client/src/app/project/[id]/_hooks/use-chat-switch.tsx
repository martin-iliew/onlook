// Switch between the OpenRouter API chat hook and the Claude Code bridge chat hook.
// NEXT_PUBLIC_USE_CLAUDE_CODE is inlined at build time by Next.js (webpack DefinePlugin),
// so this module-scope conditional is stable — it is NOT a conditional hook call.

import { useChat as useClaudeCodeChat } from './use-chat-cc';
import { useChat as useOpenRouterChat } from './use-chat';

const USE_CC = process.env.NEXT_PUBLIC_USE_CLAUDE_CODE === 'true';

export const useChat = USE_CC ? useClaudeCodeChat : useOpenRouterChat;

// Re-export shared types so consumers only need one import path
export type { SendMessage, EditMessage, ProcessMessage } from './use-chat';
