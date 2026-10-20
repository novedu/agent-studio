import { ChevronDownIcon, PlayIcon } from '../../components/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatPanel } from '../../components/chat/ChatPanel';
import {
  DockViewSwitch,
  ExecutionExplorer,
  ExecutionGraphEmptyState,
  ExecutionTimeline,
  StepDrawer,
  type DockView,
} from '../../components/execution';
import {
  buildExecutionNodes,
  getCurrentNodeId,
  type FocusedRuntimeObject,
  type ExecutionNodeRecord,
} from '../../components/execution/execution-model';
import type { AgentEvent, CitationRecord, MemoryRecord } from '../../types/agent';
import { RuntimeInspector } from '../../components/inspector';
import { useAgentStream } from '../../hooks/useAgentStream';
import { checkAgentServerHealth } from '../../services/agent';
import { useAgentStore } from '../../store/agentStore';
import { buildRuntimeOverview, type RuntimeOverview } from './runtime-overview';
import {
  buildRuntimeDependencyEdges,
  buildRuntimeObjects,
  type RuntimeObject,
} from './runtime-object-model';

const defaultTask = '分析华东区域销售下降原因，并生成报告';
const retryDemoTask = '演示销售分析 Agent 的 Tool Error、Retry、Reflection 和 Success 链路';

export function AgentConsole() {
  const { start, stop } = useAgentStream();
  const retryDemoTimersRef = useRef<number[]>([]);
  const {
    messages,
    plan,
    events,
    workflow,
    tools,
    citations,
    memory,
    evaluation,
    state,
    status,
    isStreaming,
    beginTask,
    updateFromEvent,
  } = useAgentStore();

  const nodes = useMemo(
    () =>
      buildExecutionNodes({
        plan,
        tools,
        events,
        workflow,
        citations,
        evaluation,
        messages,
        status,
      }),
    [citations, evaluation, events, messages, plan, status, tools, workflow],
  );
  const latestUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'user'),
    [messages],
  );
  const hasTaskActivity = status !== 'idle' || events.length > 0 || Boolean(latestUserMessage);
  // The dock only makes sense when this session actually produced runtime events.
  // After a reload the transcript is restored but events are not, so building the
  // node skeleton would show seven "waiting" boxes with zero trace behind them.
  const hasRuntimeActivity = events.length > 0 || tools.length > 0;
  const displayNodes = useMemo(
    () => (hasRuntimeActivity ? nodes : []),
    [hasRuntimeActivity, nodes],
  );
  const runtimeObjects = useMemo(() => buildRuntimeObjects(displayNodes), [displayNodes]);
  const dependencyEdges = useMemo(
    () => buildRuntimeDependencyEdges(runtimeObjects),
    [runtimeObjects],
  );
  const currentNodeId = hasRuntimeActivity ? getCurrentNodeId(displayNodes) : undefined;
  const [selectedRuntimeObject, setSelectedRuntimeObject] = useState<RuntimeObject | undefined>();
  const [focusedRuntimeObject, setFocusedRuntimeObject] = useState<FocusedRuntimeObject>();
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>(currentNodeId);
  const [focusedInspectorSection, setFocusedInspectorSection] = useState<string>();
  const [autoFollowRuntime, setAutoFollowRuntime] = useState(true);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string>();
  const [highlightedCitationId, setHighlightedCitationId] = useState<string>();
  const [highlightedMemoryId, setHighlightedMemoryId] = useState<string>();
  const [highlightedTraceId, setHighlightedTraceId] = useState<string>();
  const [runtimeDockExpanded, setRuntimeDockExpanded] = useState(false);
  const [dockView, setDockView] = useState<DockView>('graph');
  const [runtimeProvider, setRuntimeProvider] = useState<string | undefined>(undefined);
  const [runtimeDockManuallyToggled, setRuntimeDockManuallyToggled] = useState(false);
  useEffect(() => {
    let active = true;
    checkAgentServerHealth()
      .then((health) => {
        if (active) setRuntimeProvider(health.provider);
      })
      .catch(() => {
        if (active) setRuntimeProvider(undefined);
      });
    return () => {
      active = false;
    };
  }, []);

  function handleNewConversation() {
    useAgentStore.getState().startNewConversation();
  }

  const lastError = useAgentStore((state) => state.lastError);

  const focusedObjectType = focusedRuntimeObject?.type;
  const focusedObjectId = focusedRuntimeObject?.id;
  const activeNodeId = focusedNodeId ?? currentNodeId;
  const currentNode = displayNodes.find((node) => node.id === currentNodeId);
  const activeNode = displayNodes.find((node) => node.id === activeNodeId) ?? currentNode;
  const currentTool =
    currentNode?.kind === 'tool'
      ? currentNode.component
      : activeNode?.kind === 'tool'
        ? activeNode.component
        : undefined;
  const isLoading = status === 'running';
  const runtimeOverview = useMemo(
    () =>
      buildRuntimeOverview({
        messages,
        events,
        plan,
        tools,
        citations,
        memory,
        evaluation,
        state,
        status,
        currentNodeComponent: currentNode?.component,
        currentTool,
      }),
    [
      citations,
      currentNode?.component,
      currentTool,
      evaluation,
      events,
      memory,
      messages,
      plan,
      state,
      status,
      tools,
    ],
  );

  useEffect(() => {
    if (!hasTaskActivity) {
      setFocusedRuntimeObject(undefined);
      setFocusedNodeId(undefined);
      setSelectedRuntimeObject(undefined);
      setAutoFollowRuntime(true);
      return;
    }

    if (!currentNode || (!autoFollowRuntime && focusedRuntimeObject)) {
      return;
    }

    if (focusedObjectType === 'node' && focusedObjectId === currentNode.id && focusedNodeId === currentNode.id) {
      return;
    }

    if (autoFollowRuntime || !focusedRuntimeObject) {
      setFocusedRuntimeObject({ type: 'node', id: currentNode.id, node: currentNode });
      setFocusedNodeId((previous) => (previous === currentNode.id ? previous : currentNode.id));
    }
  }, [
    autoFollowRuntime,
    currentNode,
    focusedNodeId,
    focusedObjectId,
    focusedObjectType,
    focusedRuntimeObject,
    hasTaskActivity,
  ]);

  useEffect(
    () => () => {
      clearRetryDemoTimers(retryDemoTimersRef.current);
    },
    [],
  );

  useEffect(() => {
    if (status === 'running' && hasTaskActivity && !runtimeDockManuallyToggled) {
      setRuntimeDockExpanded(true);
    }
  }, [hasTaskActivity, runtimeDockManuallyToggled, status]);

  function handleRuntimeDockToggle() {
    setRuntimeDockManuallyToggled(true);
    setRuntimeDockExpanded((value) => !value);
  }

  function selectRuntimeNode(node: ExecutionNodeRecord, options: { openDrawer?: boolean; section?: string } = {}) {
    setAutoFollowRuntime(false);
    setFocusedNodeId(node.id);
    setFocusedRuntimeObject({ type: 'node', id: node.id, node });
    setSelectedRuntimeObject(options.openDrawer ? runtimeObjects.find((object) => object.id === node.id) : undefined);
    setFocusedInspectorSection(options.section ?? 'trace');
  }

  function handleTimelineSelect(node: ExecutionNodeRecord) {
    selectRuntimeNode(node, { openDrawer: true, section: 'trace' });
  }

  function handleGraphSelect(node: ExecutionNodeRecord) {
    selectRuntimeNode(node, { openDrawer: true, section: 'trace' });
  }

  function handleRuntimeObjectSelect(object: RuntimeObject) {
    setAutoFollowRuntime(false);
    setFocusedNodeId(object.id);
    setFocusedRuntimeObject({ type: 'node', id: object.id, node: object.sourceNode });
    setSelectedRuntimeObject(object);
    setFocusedInspectorSection(getInspectorSectionForRuntimeObject(object));
  }

  function handleCitationFocus(citationId?: string) {
    setAutoFollowRuntime(false);
    const citation = findCitation(citations, citationId);
    setFocusedInspectorSection('knowledge');
    if (!citation) return;
    setFocusedRuntimeObject({ type: 'citation', id: citation.id });
    setTimedHighlight(setHighlightedCitationId, citation.id);
  }

  function handleCitationSelect(citation: CitationRecord) {
    setAutoFollowRuntime(false);
    setFocusedRuntimeObject({ type: 'citation', id: citation.id });
    setFocusedInspectorSection('knowledge');
    setTimedHighlight(setHighlightedCitationId, citation.id);
  }

  function handleMemorySelect(memoryItem?: MemoryRecord) {
    setAutoFollowRuntime(false);
    if (memoryItem) {
      setFocusedRuntimeObject({ type: 'memory', id: memoryItem.id });
      setTimedHighlight(setHighlightedMemoryId, memoryItem.id);
    }
    setFocusedInspectorSection('memory');
    setHighlightedMessageId(latestUserMessage?.id);
    window.setTimeout(() => setHighlightedMessageId(undefined), 2000);
  }

  function handleEvaluationTrace() {
    setAutoFollowRuntime(false);
    setFocusedRuntimeObject({ type: 'evaluation', id: 'evaluation' });
    setFocusedInspectorSection('trace');
    const event = [...events].reverse().find((item) => item.type === 'evaluation_complete');
    if (event) handleTraceSelect(event);
  }

  function handleTraceSelect(event: AgentEvent) {
    setAutoFollowRuntime(false);
    const relatedNode = findNodeForEvent(displayNodes, event);
    setFocusedRuntimeObject({ type: 'trace', id: event.id, eventType: event.type });
    setFocusedInspectorSection('trace');
    setTimedHighlight(setHighlightedTraceId, event.id);

    if (relatedNode) {
      setFocusedNodeId(relatedNode.id);
      setFocusedRuntimeObject({ type: 'node', id: relatedNode.id, node: relatedNode });
      setSelectedRuntimeObject(runtimeObjects.find((object) => object.id === relatedNode.id));
    }
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-white text-ink">
      <section className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div
          className="grid min-h-0 min-w-0 overflow-hidden transition-[grid-template-rows] duration-200 ease-out"
          style={{
            gridTemplateRows: runtimeDockExpanded
              ? 'minmax(280px, 1fr) clamp(360px, 50vh, 460px)'
              : 'minmax(280px, 1fr) 72px',
          }}
        >
          <div className="min-h-0 min-w-0 overflow-hidden bg-white">
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              currentStep={currentNode?.component}
              currentTool={currentTool}
              onSubmit={runServerTask}
              onStop={handleStop}
              onRegenerate={latestUserMessage ? () => runServerTask(latestUserMessage.content) : undefined}
              onCitationFocus={handleCitationFocus}
              onRuntimeObjectSelect={handleRuntimeObjectSelect}
              highlightedMessageId={highlightedMessageId}
              hasTaskActivity={hasTaskActivity}
              onStartTask={(input = defaultTask) => {
                runServerTask(input);
              }}
              onStartRetryDemo={runRetryDemo}
              runtimeOverview={runtimeOverview}
              runtimeObjects={runtimeObjects}
              runtimeProvider={runtimeProvider}
              onNewConversation={handleNewConversation}
              errorMessage={lastError}
              onRetry={latestUserMessage ? () => runServerTask(latestUserMessage.content) : undefined}
              onDismissError={() => useAgentStore.getState().setLastError(undefined)}
              onRetryMessage={(question) => runServerTask(question)}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-line bg-white">
            {runtimeDockExpanded ? (
              <>
                <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-line bg-white px-2">
                  <DockViewSwitch value={dockView} onChange={setDockView} />
                  <button
                    type="button"
                    onClick={handleRuntimeDockToggle}
                    className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-line bg-white px-2 text-[10px] font-semibold text-muted transition-colors duration-200 hover:bg-panel hover:text-ink"
                  >
                    <ChevronDownIcon className="h-3 w-3" />
                    Collapse
                  </button>
                </div>

                {/* Both views stay mounted so switching keeps zoom, filters and selection. */}
                <div
                  className={
                    dockView === 'graph'
                      ? 'min-h-0 flex-1 overflow-hidden'
                      : 'hidden min-h-0 flex-1 overflow-hidden'
                  }
                >
                  {hasRuntimeActivity ? (
                    <ExecutionExplorer
                      nodes={displayNodes}
                      runtimeObjects={runtimeObjects}
                      dependencyEdges={dependencyEdges}
                      activeNodeId={activeNodeId}
                      onSelectNode={handleGraphSelect}
                    />
                  ) : (
                    <ExecutionGraphEmptyState onStart={() => runServerTask(defaultTask)} onStartRetryDemo={runRetryDemo} />
                  )}
                </div>

                <div
                  className={
                    dockView === 'timeline'
                      ? 'min-h-0 flex-1 overflow-hidden'
                      : 'hidden min-h-0 flex-1 overflow-hidden'
                  }
                >
                  <ExecutionTimeline
                    nodes={displayNodes}
                    runtimeObjects={runtimeObjects}
                    activeNodeId={activeNodeId}
                    onSelectNode={handleTimelineSelect}
                    onStart={() => runServerTask(defaultTask)}
                  />
                </div>
              </>
            ) : (
              <RuntimeDockCollapsed
                overview={runtimeOverview}
                nodes={displayNodes}
                activeNodeId={activeNodeId}
                onExpand={handleRuntimeDockToggle}
                onStart={() => runServerTask(defaultTask)}
              />
            )}
          </div>
        </div>

        <div className="min-h-0 min-w-0 overflow-hidden border-l border-line">
          <RuntimeInspector
            currentNode={activeNode}
            nodes={displayNodes}
            events={events}
            plan={plan}
            state={state}
            memory={memory}
            citations={citations}
            evaluation={evaluation}
            tools={tools}
            status={status}
            isLoading={isLoading}
            runtimeOverview={runtimeOverview}
            runtimeObjects={runtimeObjects}
            focusedObject={focusedRuntimeObject}
            focusSection={focusedInspectorSection}
            highlightedCitationId={highlightedCitationId}
            highlightedMemoryId={highlightedMemoryId}
            highlightedTraceId={highlightedTraceId}
            onMemorySelect={handleMemorySelect}
            onEvaluationTrace={handleEvaluationTrace}
            onCitationSelect={handleCitationSelect}
            onTraceSelect={handleTraceSelect}
          />
        </div>
      </section>

      <StepDrawer
        object={selectedRuntimeObject}
        onClose={() => setSelectedRuntimeObject(undefined)}
      />
    </main>
  );

  function runServerTask(input: string) {
    clearRetryDemoTimers(retryDemoTimersRef.current);
    setRuntimeDockManuallyToggled(false);
    setRuntimeDockExpanded(true);
    setAutoFollowRuntime(true);
    void start(input);
  }

  function handleStop() {
    clearRetryDemoTimers(retryDemoTimersRef.current);
    stop();
  }

  function runRetryDemo() {
    clearRetryDemoTimers(retryDemoTimersRef.current);
    setRuntimeDockManuallyToggled(false);
    setRuntimeDockExpanded(true);
    setAutoFollowRuntime(true);
    beginTask(retryDemoTask);
    buildRetryDemoEvents().forEach((event, index) => {
      const timer = window.setTimeout(() => {
        updateFromEvent({
          ...event,
          timestamp: Date.now(),
        });
      }, index * 180);
      retryDemoTimersRef.current.push(timer);
    });
  }
}

function RuntimeDockCollapsed({
  overview,
  nodes,
  activeNodeId,
  onExpand,
  onStart,
}: {
  overview: RuntimeOverview;
  nodes: ExecutionNodeRecord[];
  activeNodeId?: string;
  onExpand: () => void;
  onStart: () => void;
}) {
  const activeKind = nodes.find((node) => node.id === activeNodeId)?.kind;
  const path = [
    { label: 'Planner', kind: 'planner' },
    { label: 'Tool', kind: 'tool' },
    { label: 'RAG', kind: 'rag' },
    { label: 'Memory', kind: 'memory' },
    { label: 'Answer', kind: 'answer' },
  ];
  const statusLabel =
    overview.status === 'running'
      ? 'Running'
      : overview.status === 'success'
        ? 'Completed'
        : overview.status === 'error'
          ? 'Failed'
          : 'Ready';

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(176px,0.8fr)_minmax(0,1fr)_minmax(220px,0.95fr)] bg-white">
      <div className="flex min-w-0 items-center justify-between gap-3 border-r border-line px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">Runtime Graph</div>
          <div className="mt-0.5 truncate text-[10px] text-muted">Compact dependency strip</div>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-accent bg-accent px-2.5 text-[10px] font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
        >
          <PlayIcon className="h-3 w-3" />
          Run
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-4">
        {path.map((item, index) => {
          const active = item.kind === activeKind;
          return (
            <div key={item.label} className="flex shrink-0 items-center gap-1">
              <span
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors duration-200 ${
                  active
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-line bg-panel text-muted'
                }`}
              >
                {item.label}
              </span>
              {index < path.length - 1 && <span className="text-[10px] text-lineStrong">→</span>}
            </div>
          );
        })}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 pl-4 pr-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">Debug Timeline</div>
          <div className="mt-0.5 flex items-center gap-2 truncate text-[10px] text-muted">
            <span>Flow trace</span>
            <span className="text-lineStrong">·</span>
            <span className="font-mono">
              {overview.eventCount} event{overview.eventCount === 1 ? '' : 's'}
            </span>
            <span className="text-lineStrong">·</span>
            <span>{statusLabel}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onExpand}
          aria-label="Expand runtime graph and timeline"
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-line bg-white px-2.5 text-[10px] font-semibold text-muted transition-colors duration-200 hover:bg-panel hover:text-ink"
        >
          <ChevronDownIcon className="h-3 w-3" />
          Expand
        </button>
      </div>
    </div>
  );
}

function clearRetryDemoTimers(timers: number[]) {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers.length = 0;
}

function getInspectorSectionForRuntimeObject(object: RuntimeObject): string {
  if (object.type === 'knowledge') return 'knowledge';
  if (object.type === 'memory') return 'memory';
  if (object.type === 'evaluation') return 'evaluation';
  return 'trace';
}

function buildRetryDemoEvents(): AgentEvent[] {
  const taskId = 'demo_retry_task';
  let index = 0;
  const event = (type: AgentEvent['type'], payload: unknown): AgentEvent => {
    index += 1;
    return {
      id: `${taskId}_event_${String(index).padStart(4, '0')}`,
      taskId,
      type,
      timestamp: Date.now(),
      payload,
    };
  };
  const plan = {
    goal: retryDemoTask,
    steps: [
      {
        id: '1',
        tool: 'validateSalesRegion',
        description: '预检销售数据源和区域参数',
        args: { region: '华中' },
        status: 'pending',
      },
      {
        id: '2',
        tool: 'querySalesData',
        description: '切换到华东区域重新查询销售数据',
        args: { region: '华东', month: '2024-02' },
        status: 'pending',
      },
      {
        id: '3',
        tool: 'calculateMetrics',
        description: '计算华东区域销售下降幅度',
        args: { current: 980000, previous: 1250000, metric: 'growth' },
        status: 'pending',
      },
      {
        id: '4',
        tool: 'searchKnowledge',
        description: '检索销售下降原因和渠道证据',
        args: { query: '华东 销售下降 渠道 原因', limit: 3 },
        status: 'pending',
      },
      {
        id: '5',
        tool: 'llm',
        description: '反思失败恢复过程并生成最终报告',
        status: 'pending',
      },
    ],
  };
  const documents = [
    {
      id: 'KB002',
      content:
        '华东区域销售下降常见原因：春节后需求回落、渠道补货节奏放缓、重点客户预算延后，以及竞品在低线城市加大折扣。',
      metadata: { title: '华东销售下降原因分析', category: 'Sales', updatedAt: '2024-05-08' },
      score: 0.92,
    },
    {
      id: 'KB003',
      content: '企业软件行业 Q2 采购审批周期延长，预算释放更偏向刚需项目，非核心系统采购容易被延后。',
      metadata: { title: '行业趋势报告-2024Q2', category: 'Industry', updatedAt: '2024-06-12' },
      score: 0.78,
    },
  ];
  const finalAnswer = [
    '# Tool Error → Retry → Success 演示报告',
    '',
    '## Runtime 结论',
    '',
    'Agent 首次预检区域参数时发现 **华中** 不在当前销售数据源支持范围内，因此触发 Tool Error。随后 Runtime 进入 Retry，切换到可用的 **华东** 数据源继续执行。',
    '',
    '## 恢复后的分析结果',
    '',
    '- 华东 2024-02 营收为 **¥980000**，较 2024-01 的 **¥1250000** 下降 **21.60%**。',
    '- RAG 证据显示，下降原因可能包括春节后需求回落、渠道补货放缓、重点客户预算延后和竞品折扣加剧。',
    '- Memory 已保存本次失败恢复摘要，Reflection 判定链路完整。',
    '',
    '## 建议',
    '',
    '1. 对区域参数增加预校验，减少无效 Tool Call。',
    '2. 保留 Tool Error 和 Retry Trace，方便复盘失败恢复路径。',
    '3. 对华东渠道补货和重点客户预算延后进行专项跟进。',
  ].join('\n');

  return [
    event('task_created', { input: retryDemoTask, status: 'running' }),
    event('plan_start', { input: retryDemoTask }),
    event('plan_update', { plan, steps: plan.steps }),
    event('state_update', { status: 'running', currentStep: 'validateSalesRegion', completedStepIds: [], progress: 12 }),
    event('tool_start', { toolName: 'validateSalesRegion', args: { region: '华中' } }),
    event('tool_error', {
      toolName: 'validateSalesRegion',
      error: { message: '不支持的区域 "华中"，当前销售数据源仅支持：华东、华北、华南。' },
    }),
    event('task_retry', {
      reason: '切换到已支持区域 "华东" 重新执行销售分析链路。',
      retryCount: 1,
      maxRetry: 2,
    }),
    event('state_update', { status: 'running', currentStep: 'querySalesData', completedStepIds: ['retry'], progress: 26 }),
    event('tool_start', { toolName: 'querySalesData', args: { region: '华东', month: '2024-02' } }),
    event('tool_success', {
      toolName: 'querySalesData',
      result: {
        success: true,
        toolName: 'querySalesData',
        data: '华东 2024-02 销售数据：营收 ¥980000，订单 980 单，客单价 ¥1000',
        duration: 150,
      },
    }),
    event('state_update', { status: 'running', currentStep: 'calculateMetrics', completedStepIds: ['retry', '2'], progress: 42 }),
    event('tool_start', { toolName: 'calculateMetrics', args: { current: 980000, previous: 1250000, metric: 'growth' } }),
    event('tool_success', {
      toolName: 'calculateMetrics',
      result: {
        success: true,
        toolName: 'calculateMetrics',
        data: '增长率：980000 vs 1250000 = -21.60%',
        duration: 80,
      },
    }),
    event('state_update', { status: 'running', currentStep: 'searchKnowledge', completedStepIds: ['retry', '2', '3'], progress: 58 }),
    event('tool_start', { toolName: 'searchKnowledge', args: { query: '华东 销售下降 渠道 原因', limit: 3 } }),
    event('tool_success', {
      toolName: 'searchKnowledge',
      result: {
        success: true,
        toolName: 'searchKnowledge',
        data: {
          query: '华东 销售下降 渠道 原因',
          documents,
          documentCount: documents.length,
          retrievalDuration: 34,
          logs: [
            'searchKnowledge received query: 华东 销售下降 渠道 原因',
            'Retriever topK: 3',
            'Retriever returned 2 documents in 34ms',
          ],
        },
        duration: 40,
      },
    }),
    event('rag_retrieve', { query: '华东 销售下降 渠道 原因', documents, duration: 34 }),
    event('memory_update', {
      memoryType: 'episodic',
      items: [
        {
          id: 'mem_retry_sales_1',
          type: 'episodic',
          content: '本次销售分析首次区域参数失败，Retry 后切换到华东并完成 Tool/RAG/Reflection/Evaluation 链路。',
          importance: 0.82,
        },
        {
          id: 'mem_retry_sales_2',
          type: 'working',
          content: '华东 2024-02 营收 ¥980000，环比下降 21.60%。',
          importance: 0.76,
        },
      ],
    }),
    event('reflection', {
      status: 'passed',
      message: '已检查 Tool Error、Retry、RAG 证据和最终报告，失败恢复链路完整。',
    }),
    event('evaluation_start', { traceId: taskId }),
    event('evaluation_complete', {
      score: 0.88,
      criteria: {
        completeness: 0.9,
        accuracy: 0.85,
        groundedness: 0.9,
        taskCompletion: 0.88,
      },
      feedback: ['评估通过：失败恢复过程可追踪，最终答案包含数据、证据和行动建议。'],
    }),
    event('state_update', {
      status: 'completed',
      currentStep: 'final_answer',
      completedStepIds: ['retry', '2', '3', '4', '5'],
      progress: 100,
    }),
    ...splitText(finalAnswer).map((delta) => event('final_answer', { delta })),
    event('final_answer', { content: finalAnswer, done: true }),
    event('task_complete', { status: 'completed', duration: 1680 }),
  ];
}

function splitText(value: string): string[] {
  const chunks: string[] = [];
  let buffer = '';
  for (const char of value) {
    buffer += char;
    if (buffer.length >= 12 || char === '\n' || char === '。' || char === '，') {
      chunks.push(buffer);
      buffer = '';
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function findCitation(citations: CitationRecord[], citationId?: string): CitationRecord | undefined {
  if (!citationId) return citations[0];
  return (
    citations.find((citation) => citation.id === citationId) ??
    citations.find((citation) => `citation-${citation.chunk}` === citationId) ??
    citations[0]
  );
}

function findNodeForEvent(
  nodes: ExecutionNodeRecord[],
  event: AgentEvent,
): ExecutionNodeRecord | undefined {
  if (event.type.startsWith('plan')) return nodes.find((node) => node.kind === 'planner');
  if (event.type.startsWith('tool')) {
    const toolName = readString(event.payload, 'toolName');
    return (
      nodes.find((node) => node.kind === 'tool' && node.component === toolName) ??
      nodes.find((node) => node.kind === 'tool')
    );
  }
  if (event.type === 'rag_retrieve') return nodes.find((node) => node.kind === 'rag');
  if (event.type === 'memory_update') return nodes.find((node) => node.kind === 'memory');
  if (event.type === 'reflection') return nodes.find((node) => node.kind === 'reflection');
  if (event.type.startsWith('evaluation')) return nodes.find((node) => node.kind === 'evaluation');
  if (event.type === 'final_answer' || event.type === 'task_complete') {
    return nodes.find((node) => node.kind === 'answer');
  }
  return nodes.find((node) => node.trace === event || node.id === event.id);
}

function readString(payload: unknown, key: string): string | undefined {
  if (!isRecord(payload)) return undefined;
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function setTimedHighlight(
  setter: (value: string | undefined) => void,
  id: string,
  duration = 2000,
) {
  setter(id);
  window.setTimeout(() => setter(undefined), duration);
}
