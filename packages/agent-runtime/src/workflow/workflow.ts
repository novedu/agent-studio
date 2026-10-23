import type {
  ChatMessage,
  LLMResponse,
  Message,
  ToolCall,
  ToolResult,
  TraceStep,
  WorkflowTraceStep,
} from '@shared-types/agent';
import { ConversationManager } from '@runtime/agent/conversation';
import { EventEmitter } from '@runtime/agent/event';
import { ToolExecutor } from '@runtime/tool/executor';
import { AgentState } from './state';
import type { LLMProvider } from '@runtime/llm';
import { MemoryManager } from '@runtime/memory/memory-manager';

/** How many past messages are replayed into a prompt (keeps follow-up turns cheap). */
const MAX_REPLAYED_HISTORY = 24;

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function generateToolCallId(): string {
  return `call_${generateId()}`;
}

export interface WorkflowRunnerConfig {
  llmProvider: LLMProvider;
  executor: ToolExecutor;
  conversationManager: ConversationManager;
  eventEmitter: EventEmitter;
  memoryManager?: MemoryManager;
  systemPrompt?: string;
  maxSteps?: number;
}

export interface WorkflowRunInput {
  taskId: string;
  conversationId: string;
  userMessageId: string;
  userInput: string;
  state: AgentState;
  /** Step index to resume from (0 for a normal run). */
  startIndex?: number;
  /** The step being retried; its args can be overridden. */
  retryStepId?: string;
  stepArgs?: Record<string, unknown>;
  attemptNo?: number;
}

export interface WorkflowRunResult {
  traceSteps: TraceStep[];
  workflowTrace: WorkflowTraceStep[];
  success: boolean;
  error?: string;
  finalAnswer?: string;
}

export class WorkflowRunner {
  private llmProvider: LLMProvider;
  private executor: ToolExecutor;
  private conversationManager: ConversationManager;
  private eventEmitter: EventEmitter;
  private memoryManager?: MemoryManager;
  private systemPrompt?: string;
  private maxSteps: number;

  constructor(config: WorkflowRunnerConfig) {
    this.llmProvider = config.llmProvider;
    this.executor = config.executor;
    this.conversationManager = config.conversationManager;
    this.eventEmitter = config.eventEmitter;
    this.memoryManager = config.memoryManager;
    this.systemPrompt = config.systemPrompt;
    this.maxSteps = config.maxSteps ?? 10;
  }

  async run(input: WorkflowRunInput): Promise<WorkflowRunResult> {
    const traceSteps: TraceStep[] = [];
    const workflowTrace: WorkflowTraceStep[] = [];
    let success = true;
    let error: string | undefined;
    let finalAnswer: string | undefined;

    const planSteps = input.state.getSteps().slice(0, this.maxSteps);
    const startIndex = Math.max(0, Math.min(input.startIndex ?? 0, planSteps.length));
    const attemptNo = input.attemptNo ?? 1;

    for (let index = startIndex; index < planSteps.length; index++) {
      const planStep = planSteps[index];
      const workflowStartedAt = Date.now();
      const workflowStepTrace: WorkflowTraceStep = {
        stepId: planStep.id,
        description: planStep.description,
        status: 'running',
        startedAt: workflowStartedAt,
        duration: 0,
        traceSteps: [],
      };

      input.state.updateStep(planStep.id, 'running');

      // Only the step being retried gets the new attempt number; later steps
      // in the resumed run are still on their first attempt.
      const stepAttemptNo = planStep.id === input.retryStepId ? attemptNo : 1;

      if (planStep.tool === 'llm') {
        const llmTraceStep = await this.runLLMStep(input, planStep.description, index + 1);
        traceSteps.push(llmTraceStep.traceStep);
        workflowStepTrace.traceSteps.push(llmTraceStep.traceStep);

        if (!llmTraceStep.success || !llmTraceStep.response) {
          success = false;
          error = llmTraceStep.traceStep.error || 'LLM step failed';
          input.state.updateStep(planStep.id, 'failed');
          input.state.markFailed(error);
          workflowStepTrace.status = 'failed';
          workflowStepTrace.error = error;
          this.finishWorkflowStep(workflowStepTrace);
          workflowTrace.push(workflowStepTrace);
          break;
        }

        const toolCalls = this.normalizeToolCalls(llmTraceStep.response.toolCalls);

        if (toolCalls.length === 0) {
          this.conversationManager.addMessage(input.conversationId, {
            role: 'assistant',
            content: llmTraceStep.response.content,
            status: 'success',
          });
          finalAnswer = llmTraceStep.response.content;
        } else {
          this.conversationManager.addMessage(input.conversationId, {
            role: 'assistant',
            content: llmTraceStep.response.content,
            status: 'success',
            toolCalls,
          });

          for (const toolCall of toolCalls) {
            // Tools called by the LLM do not belong to a single plan step;
            // do not let them mark the surrounding LLM step as completed.
            const toolTraceStep = await this.runToolStep(input, toolCall, index + 1, undefined, stepAttemptNo);
            traceSteps.push(toolTraceStep);
            workflowStepTrace.traceSteps.push(toolTraceStep);
            input.state.addToolResult(toolCall.name, toolTraceStep.toolResult!);

            if (toolTraceStep.status === 'error') {
              success = false;
              error = toolTraceStep.error || 'Tool step failed';
              input.state.updateStep(planStep.id, 'failed');
              input.state.markFailed(error);
              workflowStepTrace.status = 'failed';
              workflowStepTrace.error = error;
              break;
            }
          }
        }
      } else {
        const toolCall: ToolCall = {
          id: `call_plan_${planStep.id}`,
          name: planStep.tool,
          args: {
            ...(planStep.args ?? {}),
            ...(planStep.id === input.retryStepId ? input.stepArgs ?? {} : {}),
          },
        };

        this.conversationManager.addMessage(input.conversationId, {
          role: 'assistant',
          content: planStep.description,
          status: 'success',
          toolCalls: [toolCall],
        });

        const toolTraceStep = await this.runToolStep(input, toolCall, index + 1, planStep.id, stepAttemptNo);
        traceSteps.push(toolTraceStep);
        workflowStepTrace.traceSteps.push(toolTraceStep);
        input.state.addToolResult(toolCall.name, toolTraceStep.toolResult!);

        if (toolTraceStep.status === 'error') {
          success = false;
          error = toolTraceStep.error || 'Tool step failed';
          input.state.updateStep(planStep.id, 'failed');
          input.state.markFailed(error);
          workflowStepTrace.status = 'failed';
          workflowStepTrace.error = error;
        }
      }

      if (!success) {
        this.finishWorkflowStep(workflowStepTrace);
        workflowTrace.push(workflowStepTrace);
        break;
      }

      input.state.updateStep(planStep.id, 'completed');
      workflowStepTrace.status = 'completed';
      this.finishWorkflowStep(workflowStepTrace);
      workflowTrace.push(workflowStepTrace);
    }

    if (success) {
      if (finalAnswer) {
        this.memoryManager?.recordFinalAnswer(finalAnswer, {
          taskId: input.taskId,
          conversationId: input.conversationId,
        });
      }
      input.state.markCompleted();
    }

    return {
      traceSteps,
      workflowTrace,
      success,
      error,
      finalAnswer,
    };
  }

  private async runLLMStep(input: WorkflowRunInput, stepDescription: string, stepNumber: number) {
    const messages = this.conversationManager.getMessages(input.conversationId);
    const llmMessages = this.buildLLMMessages(messages, stepDescription, input.userInput);
    const toolDefinitions = this.executor.getToolDefinitions();

    this.eventEmitter.emit({
      type: 'llm_start',
      timestamp: Date.now(),
      conversationId: input.conversationId,
      messageId: input.userMessageId,
      input: input.userInput,
      provider: this.llmProvider.name,
      messages: llmMessages,
      tools: toolDefinitions,
    });

    const startedAt = Date.now();
    const traceStep: TraceStep = {
      stepId: generateId(),
      stepNumber,
      type: 'llm',
      status: 'running',
      llmInput: stepDescription,
      llmMessages,
      duration: 0,
    };

    try {
      const response = await this.llmProvider.chat(llmMessages, toolDefinitions);
      traceStep.llmResponse = response.content;
      traceStep.status = 'success';
      traceStep.duration = Date.now() - startedAt;

      this.eventEmitter.emit({
        type: 'llm_response',
        timestamp: Date.now(),
        conversationId: input.conversationId,
        messageId: input.userMessageId,
        response: {
          content: response.content,
          toolCalls: response.toolCalls,
          done: !(response.toolCalls && response.toolCalls.length > 0),
        },
      });

      return { success: true, traceStep, response };
    } catch (err) {
      const message = (err as Error).message;
      traceStep.status = 'error';
      traceStep.error = message;
      traceStep.duration = Date.now() - startedAt;

      this.eventEmitter.emit({
        type: 'llm_error',
        timestamp: Date.now(),
        conversationId: input.conversationId,
        messageId: input.userMessageId,
        provider: this.llmProvider.name,
        error: { message },
      });

      return { success: false, traceStep, response: undefined as LLMResponse | undefined };
    }
  }

  private async runToolStep(
    input: WorkflowRunInput,
    toolCall: ToolCall,
    stepNumber: number,
    stepId: string | undefined,
    attemptNo: number,
  ): Promise<TraceStep> {
    const { id: toolCallId, name: toolName, args } = toolCall;

    this.eventEmitter.emit({
      type: 'tool_start',
      timestamp: Date.now(),
      conversationId: input.conversationId,
      messageId: input.userMessageId,
      toolName,
      args,
      stepId,
      attemptNo,
    });

    const traceStep: TraceStep = {
      stepId: generateId(),
      stepNumber,
      type: 'tool',
      status: 'running',
      toolName,
      toolArgs: args,
      duration: 0,
    };

    const toolResult = await this.executor.run(toolName, args);
    traceStep.toolResult = toolResult;
    traceStep.duration = toolResult.duration;
    traceStep.rag = this.extractRagTrace(toolResult);
    this.emitSecurityEventIfNeeded(input, toolName, toolResult);
    this.memoryManager?.recordToolResult(toolName, toolResult, {
      taskId: input.taskId,
      conversationId: input.conversationId,
      stepNumber,
    });

    if (toolResult.success) {
      traceStep.status = 'success';
      this.eventEmitter.emit({
        type: 'tool_success',
        timestamp: Date.now(),
        conversationId: input.conversationId,
        messageId: input.userMessageId,
        toolName,
        result: toolResult,
        stepId,
        attemptNo,
      });
    } else {
      traceStep.status = 'error';
      traceStep.error = toolResult.error;
      this.eventEmitter.emit({
        type: 'tool_error',
        timestamp: Date.now(),
        conversationId: input.conversationId,
        messageId: input.userMessageId,
        toolName,
        error: {
          type: this.getErrorType(toolResult.error!),
          message: toolResult.error!,
        },
        stepId,
        attemptNo,
      });
    }

    this.conversationManager.addMessage(input.conversationId, {
      role: 'tool',
      content: toolResult.success
        ? this.stringifyToolData(toolResult.data)
        : toolResult.error!,
      status: toolResult.success ? 'success' : 'error',
      toolCallId,
      toolResult,
    });

    return traceStep;
  }

  private buildLLMMessages(messages: Message[], stepDescription: string, userInput: string): ChatMessage[] {
    const now = Date.now();
    const systemMessages: ChatMessage[] = [];

    if (this.systemPrompt) {
      systemMessages.push({
        id: 'system',
        role: 'system',
        content: this.systemPrompt,
        createdAt: now,
      });
    }

    systemMessages.push({
      id: `workflow_step_${generateId()}`,
      role: 'system',
      content: `当前工作流步骤：${stepDescription}`,
      createdAt: now,
    });

    const memoryContext = this.memoryManager?.buildContext(`${userInput} ${stepDescription}`);
    if (memoryContext) {
      systemMessages.push({
        id: `memory_context_${generateId()}`,
        role: 'system',
        content: memoryContext,
        createdAt: now,
      });
    }

    // Replay a bounded window: long conversations must not grow the prompt
    // without limit. System messages are always kept above.
    const recentMessages = messages.slice(-MAX_REPLAYED_HISTORY);

    return [
      ...systemMessages,
      ...recentMessages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        toolCalls: message.toolCalls,
        toolCallId: message.toolCallId,
        createdAt: message.createdAt,
      })),
    ];
  }

  private normalizeToolCalls(toolCalls?: ToolCall[]): ToolCall[] {
    return (toolCalls ?? []).map(toolCall => ({
      ...toolCall,
      id: toolCall.id || generateToolCallId(),
    }));
  }

  private stringifyToolData(data: unknown): string {
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  private finishWorkflowStep(step: WorkflowTraceStep): void {
    step.endedAt = Date.now();
    step.duration = step.endedAt - step.startedAt;
  }

  private getErrorType(errorMessage: string): 'not_found' | 'timeout' | 'argument' | 'execution' {
    if (errorMessage.includes('Not Found')) return 'not_found';
    if (errorMessage.includes('Timeout')) return 'timeout';
    if (
      errorMessage.includes('Argument') ||
      errorMessage.includes('不支持') ||
      errorMessage.includes('暂无') ||
      errorMessage.includes('不能为')
    ) {
      return 'argument';
    }
    return 'execution';
  }

  private emitSecurityEventIfNeeded(input: WorkflowRunInput, toolName: string, toolResult: ToolResult): void {
    if (!toolResult.security) return;

    this.eventEmitter.emit({
      type: toolResult.security.eventType,
      timestamp: Date.now(),
      conversationId: input.conversationId,
      messageId: input.userMessageId,
      toolName,
      userContext: toolResult.security.userContext,
      risk: toolResult.security.risk,
      reason: toolResult.security.reason,
      approvalStatus: toolResult.approvalStatus,
    });
  }

  private extractRagTrace(toolResult: ToolResult) {
    if (toolResult.toolName !== 'searchKnowledge') return undefined;
    if (!toolResult.data || typeof toolResult.data !== 'object') return undefined;

    const data = toolResult.data as {
      query?: unknown;
      retrievalDuration?: unknown;
      documentCount?: unknown;
    };

    if (typeof data.query !== 'string') return undefined;

    return {
      query: data.query,
      retrievalDuration: typeof data.retrievalDuration === 'number' ? data.retrievalDuration : 0,
      documentCount: typeof data.documentCount === 'number' ? data.documentCount : 0,
    };
  }
}
