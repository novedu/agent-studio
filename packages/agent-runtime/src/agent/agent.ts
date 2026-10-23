import type { AgentResumeContext, AgentStateSnapshot, AgentTrace, Plan } from '@shared-types/agent';
import { EventEmitter } from './event';
import { ConversationManager } from './conversation';
import { ToolExecutor } from '@runtime/tool/executor';
import { Planner } from '@runtime/planner/planner';
import { PlanValidator } from '@runtime/planner/plan-validator';
import { AgentState } from '@runtime/workflow/state';
import { WorkflowRunner } from '@runtime/workflow/workflow';
import { ToolRegistry } from '@runtime/tool/registry';
import { MemoryManager } from '@runtime/memory/memory-manager';
import type { LLMProvider } from '@runtime/llm';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export interface AgentRunOptions {
  /** Continue an existing conversation instead of starting a new one. */
  conversationId?: string;
  /** Resume a failed run at one step, reusing the stored plan and conversation. */
  resume?: AgentResumeContext;
  /** Receives every state snapshot as it happens (drives live progress). */
  onStateChange?: (snapshot: AgentStateSnapshot) => void;
}

/** Thrown when a step retry cannot find the conversation it needs to resume. */
export class RetryContextUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryContextUnavailableError';
  }
}

export interface AgentConfig {
  llmProvider: LLMProvider;
  toolRegistry: ToolRegistry;
  executor: ToolExecutor;
  conversationManager: ConversationManager;
  eventEmitter: EventEmitter;
  memoryManager?: MemoryManager;
  planner?: Planner;
  planValidator?: PlanValidator;
  systemPrompt?: string;
  maxSteps?: number;
}

export class Agent {
  private conversationManager: ConversationManager;
  private eventEmitter: EventEmitter;
  private memoryManager?: MemoryManager;
  private planner: Planner;
  private planValidator: PlanValidator;
  private workflow: WorkflowRunner;

  constructor(config: AgentConfig) {
    this.conversationManager = config.conversationManager;
    this.eventEmitter = config.eventEmitter;
    this.memoryManager = config.memoryManager;
    this.planner = config.planner ?? new Planner({
      llmProvider: config.llmProvider,
      toolRegistry: config.toolRegistry,
    });
    this.planValidator = config.planValidator ?? new PlanValidator(config.toolRegistry);
    this.workflow = new WorkflowRunner({
      llmProvider: config.llmProvider,
      executor: config.executor,
      conversationManager: config.conversationManager,
      eventEmitter: config.eventEmitter,
      memoryManager: config.memoryManager,
      systemPrompt: config.systemPrompt,
      maxSteps: config.maxSteps,
    });
  }

  async run(userInput: string, options: AgentRunOptions = {}): Promise<AgentTrace> {
    const taskId = generateId();
    const startTime = Date.now();

    if (options.resume) {
      return this.resume(userInput, options.resume, options.onStateChange, taskId, startTime);
    }

    const requestedConversationId = options.conversationId?.trim();
    const existingConversation = requestedConversationId
      ? this.conversationManager.getConversation(requestedConversationId)
      : undefined;
    // Reusing the conversation is what makes follow-up turns see previous
    // messages; a brand new id falls back to creating one.
    const conversation =
      existingConversation ??
      this.conversationManager.createConversation(userInput.slice(0, 20), requestedConversationId || undefined);

    const userMessage = this.conversationManager.addMessage(conversation.id, {
      role: 'user',
      content: userInput,
      status: 'success',
    });

    this.memoryManager?.recordUserInput(userInput, {
      taskId,
      conversationId: conversation.id,
    });

    let plan: Plan;
    try {
      plan = await this.planner.createPlan(userInput);
      this.planValidator.assertValid(plan);
    } catch (err) {
      const totalDuration = Date.now() - startTime;
      const error = (err as Error).message;

      this.eventEmitter.emit({
        type: 'agent_finish',
        timestamp: Date.now(),
        conversationId: conversation.id,
        taskId,
        totalSteps: 0,
        duration: totalDuration,
        success: false,
      });

      return {
        taskId,
        conversationId: conversation.id,
        steps: [],
        totalDuration,
        success: false,
        error,
      };
    }

    const state = new AgentState(plan);
    state.onChange = options.onStateChange;
    options.onStateChange?.(state.snapshot());

    const workflowResult = await this.workflow.run({
      taskId,
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      userInput,
      state,
    });

    const totalDuration = Date.now() - startTime;

    this.eventEmitter.emit({
      type: 'agent_finish',
      timestamp: Date.now(),
      conversationId: conversation.id,
      taskId,
      totalSteps: workflowResult.traceSteps.length,
      duration: totalDuration,
      success: workflowResult.success,
    });

    return {
      taskId,
      conversationId: conversation.id,
      steps: workflowResult.traceSteps,
      plan,
      stateHistory: state.getHistory(),
      workflowTrace: workflowResult.workflowTrace,
      totalDuration,
      success: workflowResult.success,
      error: workflowResult.error,
      finalAnswer: workflowResult.finalAnswer,
    };
  }

  private async resume(
    userInput: string,
    resume: AgentResumeContext,
    onStateChange: ((snapshot: AgentStateSnapshot) => void) | undefined,
    taskId: string,
    startTime: number,
  ): Promise<AgentTrace> {
    const conversation = this.conversationManager.getConversation(resume.conversationId);
    if (!conversation) {
      throw new RetryContextUnavailableError(
        `Retry context unavailable: conversation ${resume.conversationId} is no longer in memory`,
      );
    }

    const userMessage = [...conversation.messages].reverse().find(message => message.role === 'user');
    if (!userMessage) {
      throw new RetryContextUnavailableError('Retry context unavailable: conversation has no user message');
    }

    const startIndex = resume.plan.steps.findIndex(step => step.id === resume.startStepId);
    if (startIndex < 0) {
      throw new RetryContextUnavailableError(`Retry step ${resume.startStepId} is not in the stored plan`);
    }

    const state = new AgentState(resume.plan);
    state.hydrate(resume.completedStepIds);
    state.onChange = onStateChange;
    onStateChange?.(state.snapshot());

    const workflowResult = await this.workflow.run({
      taskId,
      conversationId: resume.conversationId,
      userMessageId: userMessage.id,
      userInput,
      state,
      startIndex,
      retryStepId: resume.startStepId,
      stepArgs: resume.stepArgs,
      attemptNo: resume.attemptNo,
    });

    const totalDuration = Date.now() - startTime;

    this.eventEmitter.emit({
      type: 'agent_finish',
      timestamp: Date.now(),
      conversationId: resume.conversationId,
      taskId,
      totalSteps: workflowResult.traceSteps.length,
      duration: totalDuration,
      success: workflowResult.success,
    });

    return {
      taskId,
      conversationId: resume.conversationId,
      steps: workflowResult.traceSteps,
      plan: resume.plan,
      stateHistory: state.getHistory(),
      workflowTrace: workflowResult.workflowTrace,
      totalDuration,
      success: workflowResult.success,
      error: workflowResult.error,
      finalAnswer: workflowResult.finalAnswer,
    };
  }
}
