import { useAgentStore } from '../../store/agentStore';
import type {
  AgentEvent,
  AgentStateSnapshot,
  CitationRecord,
  EvaluationResult,
  MemoryRecord,
  Message,
  Plan,
  ToolCallRecord,
} from '../../types/agent';

export interface RuntimeOverview {
  status: string;
  model: string;
  environment: string;
  taskLabel: string;
  currentStep: string;
  currentTool: string;
  progress: number;
  eventCount: number;
  toolCount: number;
  runningToolCount: number;
  citationCount: number;
  memoryCount: number;
  evaluationScore?: number;
  latestEvent?: string;
  availableSignals: RuntimeSignal[];
}

export interface RuntimeSignal {
  label: string;
  value: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export interface BuildRuntimeOverviewInput {
  messages: Message[];
  events: AgentEvent[];
  plan: Plan | null;
  tools: ToolCallRecord[];
  citations: CitationRecord[];
  memory: MemoryRecord[];
  evaluation?: EvaluationResult;
  state?: AgentStateSnapshot;
  status: string;
  currentNodeComponent?: string;
  currentTool?: string;
  modelLabel?: string;
}

export function buildRuntimeOverview(input: BuildRuntimeOverviewInput): RuntimeOverview {
  const currentStep =
    input.currentNodeComponent ??
    input.state?.currentStepId ??
    input.plan?.steps.find((step) => step.status === 'running')?.description ??
    (input.status === 'idle' ? 'Waiting for task' : 'Planning');
  const latestUserMessage = [...input.messages]
    .reverse()
    .find((message) => message.role === 'user');
  const latestEvent = [...input.events].reverse()[0];
  const completedSteps =
    input.plan?.steps.filter((step) => step.status === 'success').length ??
    input.state?.completedStepIds.length ??
    0;
  const progress = input.plan?.steps.length
    ? Math.round((completedSteps / input.plan.steps.length) * 100)
    : input.status === 'success'
      ? 100
      : input.status === 'running'
        ? 12
        : 0;

  return {
    status: input.status,
    model: input.modelLabel ?? getRuntimeModelLabel(),
    environment: getRuntimeEnvironmentLabel(),
    taskLabel: latestUserMessage?.content ?? input.plan?.goal ?? 'No running task',
    currentStep,
    currentTool: input.currentTool ?? getRunningTool(input.tools) ?? 'None',
    progress,
    eventCount: input.events.length,
    toolCount: input.tools.length,
    runningToolCount: input.tools.filter((tool) => tool.status === 'running').length,
    citationCount: input.citations.length,
    memoryCount: input.memory.length,
    evaluationScore: input.evaluation?.score,
    latestEvent: latestEvent ? formatEventType(latestEvent.type) : undefined,
    availableSignals: buildRuntimeSignals(input),
  };
}

export function useRuntimeModelLabel(): string {
  const provider = useAgentStore((state) => state.runtimeProvider);
  const model = useAgentStore((state) => state.runtimeModel);

  if (provider === 'mock') return 'Mock · 模板';
  if (provider && model) {
    const vendor = provider === 'deepseek' ? 'DeepSeek' : provider === 'openai' ? 'OpenAI' : provider;
    return `${vendor} · ${model}`;
  }
  return getRuntimeModelLabel();
}

export function getRuntimeModelLabel(): string {
  return (
    import.meta.env.VITE_AGENT_MODEL ??
    import.meta.env.VITE_AGENT_MODEL_NAME ??
    import.meta.env.VITE_MODEL ??
    'Runtime configured'
  );
}

export function getRuntimeEnvironmentLabel(): string {
  if (import.meta.env.VITE_AGENT_ENVIRONMENT) return import.meta.env.VITE_AGENT_ENVIRONMENT;
  if (import.meta.env.DEV) return 'Local dev';
  return 'Production';
}

function buildRuntimeSignals(input: BuildRuntimeOverviewInput): RuntimeSignal[] {
  const hasPlan = Boolean(input.plan);
  const hasTools = input.tools.length > 0;
  const hasKnowledge = input.citations.length > 0;
  const hasMemory = input.memory.length > 0;
  const hasEvaluation = Boolean(input.evaluation);

  return [
    {
      label: 'Planner',
      value: hasPlan ? `${input.plan?.steps.length ?? 0} steps` : 'ready',
      tone: hasPlan ? 'success' : 'neutral',
    },
    {
      label: 'Tools',
      value: hasTools ? `${input.tools.length} calls` : 'standby',
      tone: input.tools.some((tool) => tool.status === 'failed')
        ? 'danger'
        : hasTools
          ? 'success'
          : 'neutral',
    },
    {
      label: 'Knowledge',
      value: hasKnowledge ? `${input.citations.length} chunks` : 'not retrieved',
      tone: hasKnowledge ? 'warning' : 'neutral',
    },
    {
      label: 'Memory',
      value: hasMemory ? `${input.memory.length} writes` : 'no writes',
      tone: hasMemory ? 'info' : 'neutral',
    },
    {
      label: 'Evaluation',
      value: hasEvaluation ? `${Math.round((input.evaluation?.score ?? 0) * 100)}%` : 'pending',
      tone: hasEvaluation ? 'success' : 'neutral',
    },
  ];
}

function getRunningTool(tools: ToolCallRecord[]): string | undefined {
  return (
    tools.find((tool) => tool.status === 'running')?.name ??
    [...tools].reverse().find((tool) => tool.status === 'success')?.name
  );
}

function formatEventType(type: string): string {
  return type
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
