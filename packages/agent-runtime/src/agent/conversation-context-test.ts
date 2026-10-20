import assert from 'node:assert/strict';
import { Agent } from './agent';
import { ConversationManager } from './conversation';
import { EventEmitter } from './event';
import { ToolRegistry } from '@runtime/tool/registry';
import { ToolExecutor } from '@runtime/tool/executor';
import type { LLMProvider } from '@runtime/llm';
import type { Planner } from '@runtime/planner/planner';
import type { PlanValidator } from '@runtime/planner/plan-validator';
import type { ChatMessage, Plan } from '@shared-types/agent';

const answeredCalls: ChatMessage[][] = [];

const provider: LLMProvider = {
  name: 'recording',
  async chat(messages: ChatMessage[]) {
    answeredCalls.push(messages);
    return { content: '收到。', done: true };
  },
};

const plan: Plan = {
  goal: 'answer the question',
  steps: [{ id: '1', tool: 'llm', description: '回答用户问题' }],
} as Plan;

function createAgent(): Agent {
  const conversationManager = new ConversationManager();
  const registry = new ToolRegistry();

  return new Agent({
    llmProvider: provider,
    toolRegistry: registry,
    executor: new ToolExecutor(registry),
    conversationManager,
    eventEmitter: new EventEmitter(),
    planner: { createPlan: async () => plan } as unknown as Planner,
    planValidator: { assertValid: () => undefined } as unknown as PlanValidator,
    systemPrompt: '你是测试助手。',
    maxSteps: 4,
  });
}

function promptText(messages: ChatMessage[]): string {
  return messages.map(message => customerContent(message)).join('\n---\n');
}

function customerContent(message: ChatMessage): string {
  return message.content;
}

async function caseFollowUpSeesPreviousTurn(): Promise<void> {
  answeredCalls.length = 0;
  const agent = createAgent();

  const first = await agent.run('我的项目用的是 Vue3', { conversationId: 'conv-test-1' });
  const second = await agent.run('那它适合做 AI 应用吗', { conversationId: 'conv-test-1' });

  assert.equal(first.conversationId, 'conv-test-1');
  assert.equal(second.conversationId, 'conv-test-1', 'follow-up must stay in the same conversation');

  const secondPrompt = promptText(answeredCalls[answeredCalls.length - 1]);
  assert.match(secondPrompt, /我的项目用的是 Vue3/, 'previous user turn must be replayed');
  assert.match(secondPrompt, /那它适合做 AI 应用吗/, 'current turn must be present');
}

async function caseSeparateConversationsStayIsolated(): Promise<void> {
  answeredCalls.length = 0;
  const agent = createAgent();

  await agent.run('第一个会话里的问题', { conversationId: 'conv-a' });
  await agent.run('另一个会话里的问题', { conversationId: 'conv-b' });

  const prompt = promptText(answeredCalls[answeredCalls.length - 1]);
  assert.match(prompt, /另一个会话里的问题/);
  assert.ok(!prompt.includes('第一个会话里的问题'), 'conversations must not leak into each other');
}

async function caseMissingConversationIsRecreated(): Promise<void> {
  answeredCalls.length = 0;
  const agent = createAgent();

  // No conversationId at all: the runtime should mint a fresh one and still answer.
  const trace = await agent.run('没有会话 id 的问题');
  assert.ok(trace.conversationId.length > 0);
  assert.match(promptText(answeredCalls[answeredCalls.length - 1]), /没有会话 id 的问题/);
}

async function caseHistoryIsBounded(): Promise<void> {
  answeredCalls.length = 0;
  const agent = createAgent();

  for (let index = 0; index < 16; index += 1) {
    await agent.run(`第 ${index} 轮问题`, { conversationId: 'conv-long' });
  }

  const prompt = promptText(answeredCalls[answeredCalls.length - 1]);
  assert.ok(!prompt.includes('第 0 轮问题'), 'oldest turns must fall out of the replayed window');
  assert.match(prompt, /第 15 轮问题/);
}

async function runConversationContextCases(): Promise<void> {
  await caseFollowUpSeesPreviousTurn();
  await caseSeparateConversationsStayIsolated();
  await caseMissingConversationIsRecreated();
  await caseHistoryIsBounded();

  console.log('Conversation context cases passed (reuse, isolation, bounded history).');
}

void runConversationContextCases();
