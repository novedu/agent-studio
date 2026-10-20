import {
  Agent,
  AgentMetrics,
  ContextBuilder,
  ConversationManager,
  EventEmitter,
  KnowledgeBase,
  MemoryManager,
  MockLLMProvider,
  OpenAIProvider,
  Planner,
  Retriever,
  RuleBasedEvaluator,
  ToolExecutor,
  ToolRegistry,
  TraceManager,
  registerTools,
  type Evaluator,
  type LLMProvider,
} from '@runtime/index';
import { defaultUserContext, type ToolSecurityEventType, type UserContext } from '@shared-types/security';
import type { EvaluationContext, TraceRecord } from '@shared-types/trace';
import type { AgentEvent, AgentTrace, LLMResponse, Plan, ToolResult } from '@shared-types/agent';
import type {
  AgentRuntimePort,
  AgentServerEvent,
  FinalAnswerPayload,
  EvaluationCompletePayload,
  MemoryUpdatePayload,
  RagRetrievePayload,
  ReflectionPayload,
  RuntimeTaskContext,
  StateUpdatePayload,
  ToolSecurityPayload,
} from '@shared-types/api';

export interface AgentRuntimeAdapterConfig {
  llmProvider?: LLMProvider;
  evaluator?: Evaluator;
  traceManager?: TraceManager;
  metrics?: AgentMetrics;
}

interface RuntimeBundle {
  agent: Agent;
  eventEmitter: EventEmitter;
  memoryManager: MemoryManager;
}

interface PlannerRuntimeHooks {
  onPlanStarted: (input: string) => void;
  onPlanCreated: (plan: Plan) => void;
  onPlanFailed: (error: Error) => void;
}

export class AgentRuntimeAdapter implements AgentRuntimePort {
  private traceManager: TraceManager;
  private evaluator: Evaluator;
  private metrics: AgentMetrics;

  constructor(private config: AgentRuntimeAdapterConfig = {}) {
    this.traceManager = config.traceManager ?? new TraceManager();
    this.evaluator = config.evaluator ?? new RuleBasedEvaluator();
    this.metrics = config.metrics ?? new AgentMetrics();
  }

  async runTask(context: RuntimeTaskContext): Promise<AgentTrace> {
    assertNotAborted(context.signal);
    const observabilityTrace = this.traceManager.startTrace(context.taskId, {
      input: context.input,
    });
    const eventFactory = createServerEventFactory(context.taskId);
    let plannerSpan: ReturnType<TraceManager['startSpan']> | undefined;
    const bundle = this.createRuntimeBundle({
      onPlanStarted: (input) => {
        plannerSpan = this.traceManager.startSpan({
          traceId: observabilityTrace.traceId,
          taskId: context.taskId,
          component: 'Planner',
          metadata: { input },
        });
      },
      onPlanCreated: (plan) => {
        emitIfActive(context, eventFactory('plan_update', {
          plan,
          steps: plan.steps,
        }));
        const span = plannerSpan ?? this.traceManager.startSpan({
          traceId: observabilityTrace.traceId,
          taskId: context.taskId,
          component: 'Planner',
        });
        this.traceManager.recordSpan(span.end('success', { stepCount: plan.steps.length }));
      },
      onPlanFailed: (error) => {
        const span = plannerSpan ?? this.traceManager.startSpan({
          traceId: observabilityTrace.traceId,
          taskId: context.taskId,
          component: 'Planner',
        });
        this.traceManager.recordSpan(span.end('failed', { error: error.message }));
      },
    }, context.userContext);
    let finalAnswerStreamed = false;

    emitIfActive(context, eventFactory('plan_start', {
      input: context.input,
    }));

    this.bindRuntimeEvents(bundle.eventEmitter, context, eventFactory, {
      traceId: observabilityTrace.traceId,
      markFinalAnswerStreamed: () => {
        finalAnswerStreamed = true;
      },
    });

    const workflowSpan = this.traceManager.startSpan({
      traceId: observabilityTrace.traceId,
      taskId: context.taskId,
      component: 'WorkflowRunner',
    });
    const trace = await bundle.agent.run(context.input);
    this.traceManager.recordSpan(workflowSpan.end(trace.success ? 'success' : 'failed', {
      runtimeTaskId: trace.taskId,
      totalSteps: trace.steps.length,
    }));
    assertNotAborted(context.signal);

    trace.stateHistory?.forEach((snapshot) => {
      emitIfActive(context, eventFactory('state_update', {
        status: snapshot.status === 'completed'
          ? 'completed'
          : snapshot.status === 'failed'
            ? 'failed'
            : 'running',
        currentStep: snapshot.currentStepId,
        completedStepIds: snapshot.completedStepIds,
        progress: calculateProgress(snapshot.completedStepIds.length, snapshot.steps.length),
      } satisfies StateUpdatePayload));
    });

    if (trace.finalAnswer && !finalAnswerStreamed) {
      streamFinalAnswer(trace.finalAnswer, (payload) => {
        emitIfActive(context, eventFactory('final_answer', payload));
      });
    }

    emitIfActive(context, eventFactory('final_answer', {
      content: trace.finalAnswer,
      done: true,
    } satisfies FinalAnswerPayload));

    emitIfActive(context, eventFactory('evaluation_start', {
      traceId: observabilityTrace.traceId,
    }));
    const evaluatorSpan = this.traceManager.startSpan({
      traceId: observabilityTrace.traceId,
      taskId: context.taskId,
      component: 'Evaluator',
    });
    const evaluation = this.evaluator.evaluate(
      buildEvaluationContext(context, trace, this.traceManager.getTrace(observabilityTrace.traceId)),
    );
    this.traceManager.recordSpan(evaluatorSpan.end('success', { score: evaluation.score }));
    bundle.memoryManager.remember({
      type: 'episodic',
      content: `Evaluation score=${evaluation.score}: ${evaluation.feedback.join(' ')}`,
      importance: 0.65,
      metadata: {
        source: 'evaluation',
        taskId: context.taskId,
        criteria: evaluation.criteria,
      },
    });
    emitIfActive(context, eventFactory('evaluation_complete', {
      score: evaluation.score,
      criteria: evaluation.criteria,
      feedback: evaluation.feedback,
    } satisfies EvaluationCompletePayload));

    const memoryItems = bundle.memoryManager.list();
    if (memoryItems.length > 0) {
      const memorySpan = this.traceManager.startSpan({
        traceId: observabilityTrace.traceId,
        taskId: context.taskId,
        component: 'Memory',
        metadata: { itemCount: memoryItems.length, includesEvaluation: true },
      });
      emitIfActive(context, eventFactory('memory_update', {
        memoryType: 'episodic',
        items: memoryItems.map((item) => ({
          id: item.id,
          type: item.type,
          content: item.content,
          importance: item.importance,
        })),
      } satisfies MemoryUpdatePayload));
      this.traceManager.recordSpan(memorySpan.end('success'));
    }

    const reflectionSpan = this.traceManager.startSpan({
      traceId: observabilityTrace.traceId,
      taskId: context.taskId,
      component: 'Reflection',
      metadata: { evaluationScore: evaluation.score },
    });
    emitIfActive(context, eventFactory('reflection', {
      status: trace.success && evaluation.score >= 0.7 ? 'passed' : 'needs_replanning',
      message: trace.success
        ? `评估分数 ${evaluation.score}，${evaluation.feedback.join(' ')}`
        : trace.error || '任务执行失败，需要人工检查。',
    } satisfies ReflectionPayload));
    this.traceManager.recordSpan(reflectionSpan.end(trace.success ? 'success' : 'failed'));

    const completedObservabilityTrace = this.traceManager.endTrace(
      observabilityTrace.traceId,
      trace.success ? 'success' : 'failed',
      { evaluationScore: evaluation.score },
    );
    if (completedObservabilityTrace) {
      this.metrics.recordTrace(completedObservabilityTrace);
      this.metrics.recordEvaluation(evaluation);
    }

    return trace;
  }

  private bindRuntimeEvents(
    eventEmitter: EventEmitter,
    context: RuntimeTaskContext,
    eventFactory: ReturnType<typeof createServerEventFactory>,
    options: { traceId: string; markFinalAnswerStreamed: () => void },
  ): void {
    const activeSpans = new Map<string, ReturnType<TraceManager['startSpan']>>();

    eventEmitter.on('llm_start', (event) => {
      const runtimeEvent = event as Extract<AgentEvent, { type: 'llm_start' }>;
      const llmSpan = this.traceManager.startSpan({
        traceId: options.traceId,
        taskId: context.taskId,
        component: 'LLMProvider',
        stepId: runtimeEvent.messageId,
        metadata: {
          provider: runtimeEvent.provider,
          messageCount: runtimeEvent.messages.length,
          toolCount: runtimeEvent.tools.length,
        },
      });
      activeSpans.set(`llm:${runtimeEvent.messageId}`, llmSpan);
    });

    eventEmitter.on('tool_start', (event) => {
      const runtimeEvent = event as Extract<AgentEvent, { type: 'tool_start' }>;
      const toolSpan = this.traceManager.startSpan({
        traceId: options.traceId,
        taskId: context.taskId,
        component: 'ToolExecutor',
        stepId: runtimeEvent.toolName,
        metadata: { args: runtimeEvent.args },
      });
      activeSpans.set(`tool:${runtimeEvent.toolName}`, toolSpan);
      emitIfActive(context, eventFactory('tool_start', {
        toolName: runtimeEvent.toolName,
        args: runtimeEvent.args,
      }));
    });

    eventEmitter.on('tool_success', (event) => {
      const runtimeEvent = event as Extract<AgentEvent, { type: 'tool_success' }>;
      const toolSpan = activeSpans.get(`tool:${runtimeEvent.toolName}`);
      if (toolSpan) {
        this.traceManager.recordSpan(toolSpan.end('success', {
          duration: runtimeEvent.result.duration,
          success: runtimeEvent.result.success,
        }));
        activeSpans.delete(`tool:${runtimeEvent.toolName}`);
      }
      emitIfActive(context, eventFactory('tool_success', {
        toolName: runtimeEvent.toolName,
        result: runtimeEvent.result,
      }));

      const ragPayload = toRagRetrievePayload(runtimeEvent.result);
      if (ragPayload) {
        const ragSpan = this.traceManager.startSpan({
          traceId: options.traceId,
          taskId: context.taskId,
          component: 'RAG',
          stepId: runtimeEvent.toolName,
          metadata: {
            query: ragPayload.query,
            documentCount: ragPayload.documents.length,
          },
        });
        this.traceManager.recordSpan(ragSpan.end('success', {
          duration: ragPayload.duration,
        }));
        emitIfActive(context, eventFactory('rag_retrieve', ragPayload));
      }
    });

    eventEmitter.on('tool_error', (event) => {
      const runtimeEvent = event as Extract<AgentEvent, { type: 'tool_error' }>;
      const toolSpan = activeSpans.get(`tool:${runtimeEvent.toolName}`);
      if (toolSpan) {
        this.traceManager.recordSpan(toolSpan.end('failed', {
          error: runtimeEvent.error.message,
        }));
        activeSpans.delete(`tool:${runtimeEvent.toolName}`);
      }
      emitIfActive(context, eventFactory('tool_error', {
        toolName: runtimeEvent.toolName,
        error: runtimeEvent.error,
      }));
    });

    const emitSecurityEvent = (event: AgentEvent): void => {
      const runtimeEvent = event as Extract<AgentEvent, { type: ToolSecurityEventType }>;
      emitIfActive(context, eventFactory(runtimeEvent.type, {
        toolName: runtimeEvent.toolName,
        userContext: runtimeEvent.userContext,
        risk: runtimeEvent.risk,
        reason: runtimeEvent.reason,
        approvalStatus: runtimeEvent.approvalStatus,
      } satisfies ToolSecurityPayload));
    };

    eventEmitter.on('permission_denied', emitSecurityEvent);
    eventEmitter.on('tool_blocked', emitSecurityEvent);
    eventEmitter.on('approval_required', emitSecurityEvent);

    eventEmitter.on('llm_response', (event) => {
      const runtimeEvent = event as Extract<AgentEvent, { type: 'llm_response' }>;
      const llmSpan = activeSpans.get(`llm:${runtimeEvent.messageId}`);
      if (llmSpan) {
        this.traceManager.recordSpan(llmSpan.end('success', {
          done: runtimeEvent.response.done,
          hasToolCalls: Boolean(runtimeEvent.response.toolCalls?.length),
        }));
        activeSpans.delete(`llm:${runtimeEvent.messageId}`);
      }
      if (!runtimeEvent.response.done || !runtimeEvent.response.content) return;

      options.markFinalAnswerStreamed();
      streamFinalAnswer(runtimeEvent.response.content, (payload) => {
        emitIfActive(context, eventFactory('final_answer', payload));
      });
    });

    eventEmitter.on('llm_error', (event) => {
      const runtimeEvent = event as Extract<AgentEvent, { type: 'llm_error' }>;
      const llmSpan = activeSpans.get(`llm:${runtimeEvent.messageId}`);
      if (llmSpan) {
        this.traceManager.recordSpan(llmSpan.end('failed', {
          provider: runtimeEvent.provider,
          error: runtimeEvent.error.message,
        }));
        activeSpans.delete(`llm:${runtimeEvent.messageId}`);
      }
    });
  }

  private createRuntimeBundle(plannerHooks: PlannerRuntimeHooks, userContext?: UserContext): RuntimeBundle {
    const knowledgeBase = createKnowledgeBase();
    const retriever = new Retriever(knowledgeBase);
    const contextBuilder = new ContextBuilder();

    const registry = new ToolRegistry();
    registerTools(registry, { retriever, contextBuilder });

    const executor = new ToolExecutor(registry, {
      userContext: userContext ?? defaultUserContext,
    });
    const conversationManager = new ConversationManager();
    const eventEmitter = new EventEmitter();
    const memoryManager = new MemoryManager();

    memoryManager.remember({
      type: 'semantic',
      content: '历史经验：华东区域销售分析通常需要同时关注营收、订单量、客单价、渠道补货和重点客户预算变化。',
      importance: 0.85,
      metadata: { source: 'server_seed', domain: 'sales' },
    });

    const llmProvider = this.config.llmProvider ?? createDefaultLLMProvider();
    const planner = new ServerEventPlanner({ llmProvider, toolRegistry: registry }, plannerHooks);

    const agent = new Agent({
      llmProvider,
      toolRegistry: registry,
      executor,
      conversationManager,
      eventEmitter,
      memoryManager,
      planner,
      systemPrompt: '你是一个企业 AI 助手。需要使用工具时先调用工具，拿到结果后再给用户清晰回答。',
      maxSteps: 20,
    });

    return {
      agent,
      eventEmitter,
      memoryManager,
    };
  }
}

class ServerEventPlanner extends Planner {
  constructor(
    config: ConstructorParameters<typeof Planner>[0],
    private hooks: PlannerRuntimeHooks,
  ) {
    super(config);
  }

  override async createPlan(userInput: string): Promise<Plan> {
    this.hooks.onPlanStarted(userInput);
    try {
      const plan = await super.createPlan(userInput);
      this.hooks.onPlanCreated(plan);
      return plan;
    } catch (error) {
      this.hooks.onPlanFailed(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}

function createKnowledgeBase(): KnowledgeBase {
  const knowledgeBase = new KnowledgeBase();

  knowledgeBase.addDocument({
    id: 'KB001',
    content: '华东地区 Q1 通过组合营销实现营收增长 25%，渠道合伙人计划贡献明显。',
    metadata: { title: 'Q1 销售策略复盘', category: 'Sales', updatedAt: '2024-04-20' },
  });
  knowledgeBase.addDocument({
    id: 'KB002',
    content: '华东区域销售下降常见原因：春节后需求回落、渠道补货节奏放缓、重点客户预算延后，以及竞品在低线城市加大折扣。建议结合订单量、客单价和渠道反馈共同判断。',
    metadata: { title: '华东销售下降原因分析', category: 'Sales', updatedAt: '2024-05-08' },
  });
  knowledgeBase.addDocument({
    id: 'KB003',
    content: '企业软件行业 Q2 采购审批周期延长，预算释放更偏向刚需项目，非核心系统采购容易被延后。',
    metadata: { title: '行业趋势报告-2024Q2', category: 'Industry', updatedAt: '2024-06-12' },
  });

  return knowledgeBase;
}

export function hasRealLLMProvider(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function createDefaultLLMProvider(): LLMProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    return new OpenAIProvider({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    });
  }

  const mockResponses: LLMResponse[] = [
    {
      content: [
        '# 华东区域销售下降分析报告',
        '',
        '## 结论摘要',
        '',
        '华东区域 2024-02 营收为 **¥980000**，较 2024-01 的 **¥1250000** 下降 **21.60%**。',
        '',
        '## 关键原因',
        '',
        '- 春节后需求回落，订单量从 1250 单下降到 980 单。',
        '- 渠道补货节奏放缓，重点客户预算延后。',
        '- 竞品在低线城市加大折扣，影响部分客户转化。',
        '',
        '## 建议动作',
        '',
        '1. 拆分订单量、客单价和渠道来源，定位主要下滑来源。',
        '2. 优先回访重点客户，确认预算延期和竞品替换风险。',
        '3. 对低线城市渠道制定短周期促销和补货计划。',
      ].join('\n'),
      done: true,
    },
  ];

  return new MockLLMProvider({ responses: mockResponses, delayMs: 200 });
}

function createServerEventFactory(taskId: string) {
  let index = 0;

  return <TPayload>(type: AgentServerEvent<TPayload>['type'], payload: TPayload): AgentServerEvent<TPayload> => {
    index += 1;
    return {
      id: `${taskId}_event_${String(index).padStart(4, '0')}`,
      taskId,
      type,
      timestamp: Date.now(),
      payload,
    };
  };
}

function streamFinalAnswer(answer: string, emit: (payload: FinalAnswerPayload) => void): void {
  splitAnswer(answer).forEach((delta) => emit({ delta }));
}

function splitAnswer(answer: string): string[] {
  const chunks: string[] = [];
  let buffer = '';

  for (const char of answer) {
    buffer += char;
    if (buffer.length >= 8 || char === '\n' || char === '。' || char === '，') {
      chunks.push(buffer);
      buffer = '';
    }
  }

  if (buffer) chunks.push(buffer);
  return chunks;
}

function toRagRetrievePayload(result: ToolResult): RagRetrievePayload | undefined {
  if (result.toolName !== 'searchKnowledge' || !result.data || typeof result.data !== 'object') {
    return undefined;
  }

  const data = result.data as {
    query?: unknown;
    documents?: unknown;
    retrievalDuration?: unknown;
  };

  if (typeof data.query !== 'string' || !Array.isArray(data.documents)) {
    return undefined;
  }

  return {
    query: data.query,
    documents: data.documents.map((document) => {
      const item = document as {
        id?: unknown;
        content?: unknown;
        metadata?: unknown;
        score?: unknown;
      };

      return {
        id: typeof item.id === 'string' ? item.id : 'unknown',
        content: typeof item.content === 'string' ? item.content : '',
        metadata: item.metadata && typeof item.metadata === 'object'
          ? item.metadata as Record<string, unknown>
          : undefined,
        score: typeof item.score === 'number' ? item.score : undefined,
      };
    }),
    duration: typeof data.retrievalDuration === 'number' ? data.retrievalDuration : result.duration,
  };
}

function buildEvaluationContext(
  context: RuntimeTaskContext,
  trace: AgentTrace,
  observabilityTrace?: TraceRecord,
): EvaluationContext {
  return {
    taskId: context.taskId,
    input: context.input,
    finalAnswer: trace.finalAnswer,
    toolResults: trace.steps
      .filter((step) => step.type === 'tool')
      .map((step) => ({
        toolName: step.toolName,
        success: step.toolResult?.success,
        data: step.toolResult?.data,
        error: step.toolResult?.error,
      })),
    ragDocuments: trace.steps.flatMap((step) => {
      const data = step.toolResult?.data;
      if (!data || typeof data !== 'object') return [];

      const documents = (data as { documents?: unknown }).documents;
      if (!Array.isArray(documents)) return [];

      return documents.map((document, index) => {
        const item = document as {
          id?: unknown;
          content?: unknown;
          score?: unknown;
        };

        return {
          id: typeof item.id === 'string' ? item.id : `doc_${index + 1}`,
          content: typeof item.content === 'string' ? item.content : '',
          score: typeof item.score === 'number' ? item.score : undefined,
        };
      });
    }),
    trace: observabilityTrace,
  };
}

function calculateProgress(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

function emitIfActive(context: RuntimeTaskContext, event: AgentServerEvent): void {
  if (context.signal?.aborted) return;
  context.emit(event);
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Agent task aborted');
  }
}
