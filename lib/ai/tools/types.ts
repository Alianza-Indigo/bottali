export interface ToolExecutionContext {
  userId: string;
  conversationId?: string;
  toolId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}
