import type { ChatMessage, LLMResponse, ToolDefinition } from '@shared-types/agent';
import type { LLMProvider } from './provider';

export interface MockLLMProviderConfig {
  responses: LLMResponse[];
  delayMs?: number;
}

export type MockIntent = 'sales_analysis' | 'greeting' | 'capability' | 'generic';

const PLANNER_MARKER = '你是一个任务规划器';
const SALES_PATTERN = /销售|下降|华东|报告|复盘|分析/;
const GREETING_PATTERN = /^(你好|您好|hi\b|hello|嗨|在吗|hey)/i;
const CAPABILITY_PATTERN = /能做什么|做什么|你是谁|这是什么|介绍一下|怎么用|help|功能/i;
const FAILURE_DEMO_PATTERN = /工具失败|失败重试|异常演示|预检.*重试|tool[-_ ]?error/i;
const MAX_ECHO_LENGTH = 80;

/**
 * Offline provider used when no model API key is configured.
 *
 * It must never look broken: instead of draining a fixed queue and then
 * answering "No more responses.", unsupported input gets a short, honest,
 * locally rendered reply that says it is running in mock mode.
 */
export class MockLLMProvider implements LLMProvider {
  name = 'mock';
  private queue: LLMResponse[];
  private index = 0;
  private delayMs: number;

  constructor(config: MockLLMProviderConfig) {
    this.queue = config.responses;
    this.delayMs = config.delayMs ?? 200;
  }

  async chat(messages: ChatMessage[], _tools?: ToolDefinition[]): Promise<LLMResponse> {
    await new Promise(resolve => setTimeout(resolve, this.delayMs));

    if (messages.some(message => message.content.includes(PLANNER_MARKER))) {
      return this.createPlannerResponse(messages);
    }

    return this.createAnswer(messages);
  }

  private createAnswer(messages: ChatMessage[]): LLMResponse {
    const input = readLatestUserText(messages);
    const intent = detectIntent(input);

    if (intent === 'sales_analysis') {
      if (this.index < this.queue.length) {
        return this.queue[this.index++];
      }
      // A retry of the same task should still show the scripted walkthrough
      // instead of an empty answer.
      if (this.queue.length > 0) {
        return this.queue[this.queue.length - 1];
      }
    }

    return { content: renderMockAnswer(intent, input), done: true };
  }

  private createPlannerResponse(messages: ChatMessage[]): LLMResponse {
    const userMessage = messages.find(message => message.role === 'user');
    const userPayload = this.parseUserPayload(userMessage?.content ?? '');
    const goal = userPayload.goal || '未命名任务';

    // Deterministic failure path for the real (non-fake) failure demo:
    // region 华中 is intentionally unsupported, so querySalesData fails for real.
    if (FAILURE_DEMO_PATTERN.test(goal)) {
      return {
        content: JSON.stringify({
          goal,
          steps: [
            {
              id: '1',
              tool: 'querySalesData',
              description: '预检华中区域销售数据源',
              args: { region: '华中', month: '2024-02' },
            },
            {
              id: '2',
              tool: 'calculateMetrics',
              description: '计算华东区域销售增长率',
              args: { current: 980000, previous: 1250000, metric: 'growth' },
            },
            {
              id: '3',
              tool: 'searchKnowledge',
              description: '检索销售下降原因和渠道证据',
              args: { query: '华东 销售下降 渠道 原因', limit: 3 },
            },
            {
              id: '4',
              tool: 'llm',
              description: '生成失败恢复后的分析报告',
            },
          ],
        }),
        done: true,
      };
    }

    if (SALES_PATTERN.test(goal)) {
      return {
        content: JSON.stringify({
          goal,
          steps: [
            {
              id: '1',
              tool: 'querySalesData',
              description: '查询华东区域销售数据',
              args: { region: '华东', month: '2024-02' },
            },
            {
              id: '2',
              tool: 'calculateMetrics',
              description: '计算华东区域销售增长率',
              args: { current: 980000, previous: 1250000, metric: 'growth' },
            },
            {
              id: '3',
              tool: 'searchKnowledge',
              description: '检索华东销售下降的可能原因',
              args: { query: '华东 销售下降 渠道 原因', limit: 3 },
            },
            {
              id: '4',
              tool: 'llm',
              description: '根据销售数据、增长率和知识库结果生成分析报告',
            },
          ],
        }),
        done: true,
      };
    }

    return {
      content: JSON.stringify({
        goal,
        steps: [
          {
            id: '1',
            tool: 'llm',
            description: '理解用户目标并生成回答',
          },
        ],
      }),
      done: true,
    };
  }

  private parseUserPayload(content: string): { goal: string } {
    try {
      const payload = JSON.parse(content) as { goal?: unknown };
      return {
        goal: typeof payload.goal === 'string' ? payload.goal : content,
      };
    } catch {
      return { goal: content };
    }
  }
}

export function detectIntent(input: string): MockIntent {
  const text = input.trim();
  if (!text) return 'generic';
  if (SALES_PATTERN.test(text)) return 'sales_analysis';
  if (GREETING_PATTERN.test(text)) return 'greeting';
  if (CAPABILITY_PATTERN.test(text)) return 'capability';
  return 'generic';
}

export function readLatestUserText(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    try {
      const payload = JSON.parse(message.content) as { goal?: unknown };
      if (typeof payload.goal === 'string' && payload.goal.trim()) return payload.goal.trim();
    } catch {
      // Plain text message, fall through.
    }
    return message.content.trim();
  }
  return '';
}

export function renderMockAnswer(intent: MockIntent, input: string): string {
  const echo = truncate(input);

  if (intent === 'greeting') {
    return [
      '你好，我是 Agent Studio 的运行时演示助手。',
      '',
      '**当前是 Mock 模式**（未配置 `OPENAI_API_KEY`），回答由本地模板生成，不会真的调用模型。',
      '',
      '想看完整链路可以试这句：',
      '',
      '> 分析华东区域销售下降原因，并生成报告',
      '',
      '它会走完 Planning → Tool → RAG → Reflection → Evaluation → Answer，左侧和右侧都能看到每一步。',
    ].join('\n');
  }

  if (intent === 'capability') {
    return [
      '这是一个 **Agent 运行时控制台**，重点不在聊天本身，而在「执行过程可见」。',
      '',
      '- 每次提问都会生成一条可观察链路：Planner → Workflow → Tool → RAG → Memory → Reflection → Evaluation → Answer。',
      '- 左侧 Runtime Graph 看依赖拓扑，Debug Timeline 看时序与耗时。',
      '- 右侧 Inspector 可以查看任意一步的输入、输出、trace 与证据。',
      '',
      'Mock 模式下只有销售分析那条链路是完整脚本化的，其他问题我只会这样简单回应。配置 `OPENAI_API_KEY` 后会走真实模型。',
    ].join('\n');
  }

  return [
    `**Mock 模式** · 收到你的问题：「${echo}」`,
    '',
    '当前没有配置模型 API，我不会真的推理，所以这里只能给一个占位回答——不是模型回复，也不代表运行失败。',
    '',
    '你可以先看这次请求的执行链路：右侧 Inspector 里的每一步都是真实产生的运行时事件，只是内容来自本地脚本。',
    '',
    '想看到完整演示，可以问：「分析华东区域销售下降原因，并生成报告」。',
  ].join('\n');
}

function truncate(input: string): string {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return '（空消息）';
  return text.length > MAX_ECHO_LENGTH ? `${text.slice(0, MAX_ECHO_LENGTH)}…` : text;
}
