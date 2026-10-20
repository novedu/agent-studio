import assert from 'node:assert/strict';
import type { ChatMessage } from '@shared-types/agent';
import { MockLLMProvider, detectIntent, renderMockAnswer } from './mock-llm-provider';

const SCRIPTED = '# 华东区域销售下降分析报告\n\n## 结论摘要\n\n营收下降 21.60%。';

function user(content: string): ChatMessage {
  return { id: 'u1', role: 'user', content, createdAt: Date.now() };
}

function plannerPrompt(goal: string): ChatMessage {
  return {
    id: 'p1',
    role: 'user',
    content: `你是一个任务规划器。${JSON.stringify({ goal })}`,
    createdAt: Date.now(),
  };
}

function createProvider(): MockLLMProvider {
  return new MockLLMProvider({ responses: [{ content: SCRIPTED, done: true }], delayMs: 0 });
}

async function caseIntentDetection(): Promise<void> {
  assert.equal(detectIntent('分析华东区域销售下降原因，并生成报告'), 'sales_analysis');
  assert.equal(detectIntent('你好'), 'greeting');
  assert.equal(detectIntent('hello there'), 'greeting');
  assert.equal(detectIntent('这个能做什么？'), 'capability');
  assert.equal(detectIntent('帮我写一封邮件'), 'generic');
  assert.equal(detectIntent('   '), 'generic');
}

async function casePlannerStillReturnsSteps(): Promise<void> {
  const provider = createProvider();
  const response = await provider.chat([plannerPrompt('分析华东区域销售下降原因，并生成报告')]);
  const plan = JSON.parse(response.content) as { goal: string; steps: Array<{ id: string; tool: string }> };
  assert.equal(plan.steps.length, 4);
  assert.deepEqual(plan.steps.map(step => step.tool), [
    'querySalesData',
    'calculateMetrics',
    'searchKnowledge',
    'llm',
  ]);

  const fallbackPlan = await provider.chat([plannerPrompt('帮我写一封邮件')]);
  const parsed = JSON.parse(fallbackPlan.content) as { steps: Array<{ tool: string }> };
  assert.equal(parsed.steps.length, 1);
  assert.equal(parsed.steps[0].tool, 'llm');
}

async function caseScriptedAnswerForSalesInput(): Promise<void> {
  const provider = createProvider();
  const response = await provider.chat([user('分析华东区域销售下降原因，并生成报告')]);
  assert.equal(response.content, SCRIPTED);
}

async function caseRetryDoesNotExposeQueueExhaustion(): Promise<void> {
  const provider = createProvider();
  await provider.chat([user('分析华东区域销售下降原因，并生成报告')]);
  const retried = await provider.chat([user('分析华东区域销售下降原因，并生成报告')]);
  assert.equal(retried.content, SCRIPTED);
  assert.ok(!retried.content.includes('No more responses'));
}

async function caseUnsupportedInputGetsHonestReply(): Promise<void> {
  const provider = createProvider();
  const response = await provider.chat([user('帮我写一封邮件给客户')]);
  assert.ok(response.content.includes('Mock 模式'));
  assert.ok(response.content.includes('帮我写一封邮件给客户'));
  assert.ok(!response.content.includes('No more responses'));
  assert.equal(response.done, true);
}

async function caseGreetingAndCapability(): Promise<void> {
  const provider = createProvider();
  const greeting = await provider.chat([user('你好')]);
  assert.ok(greeting.content.includes('你好'));
  assert.ok(greeting.content.includes('Mock 模式'));

  const capability = await provider.chat([user('这个项目能做什么')]);
  assert.ok(capability.content.includes('Planner'));
}

async function casePromptWrappedUserMessage(): Promise<void> {
  // The planner sends the user goal inside a JSON payload; the answer path must
  // still recover the original text.
  const provider = createProvider();
  const wrapped = await provider.chat([user(JSON.stringify({ goal: '分析华东销售下降' }))]);
  assert.equal(wrapped.content, SCRIPTED);
}

async function caseRenderedAnswersAreMarkdown(): Promise<void> {
  const generic = renderMockAnswer('generic', '测试输入');
  assert.ok(generic.includes('**Mock 模式**'));
  assert.ok(generic.split('\n').length > 3);
}

async function runMockProviderCases(): Promise<void> {
  await caseIntentDetection();
  await casePlannerStillReturnsSteps();
  await caseScriptedAnswerForSalesInput();
  await caseRetryDoesNotExposeQueueExhaustion();
  await caseUnsupportedInputGetsHonestReply();
  await caseGreetingAndCapability();
  await casePromptWrappedUserMessage();
  await caseRenderedAnswersAreMarkdown();

  console.log('Mock provider cases passed (intent routing, no queue exhaustion).');
}

void runMockProviderCases();
