import { ChevronDownIcon, PlayIcon } from '../../components/ui';
import { useEffect, useMemo, useState } from 'react';
import { ChatPanel } from '../../components/chat/ChatPanel';
import {
  DockViewSwitch,
  ExecutionExplorer,
  ExecutionGraphEmptyState,
  ExecutionSteps,
  ExecutionTimeline,
  StepDrawer,
  type DockView,
} from '../../components/execution';
import {
  buildExecutionNodes,
  buildExecutionSteps,
  getCurrentNodeId,
  type FocusedRuntimeObject,
  type ExecutionNodeRecord,
} from '../../components/execution/execution-model';
import type { AgentEvent, CitationRecord, MemoryRecord } from '../../types/agent';
import { RuntimeInspector } from '../../components/inspector';
import { useAgentStream } from '../../hooks/useAgentStream';
import { useAgentStore } from '../../store/agentStore';
import { buildRuntimeOverview, useRuntimeModelLabel, type RuntimeOverview } from './runtime-overview';
import { WorkspaceBar } from './WorkspaceBar';
import {
  buildRuntimeDependencyEdges,
  buildRuntimeObjects,
  type RuntimeObject,
} from './runtime-object-model';

const defaultTask = '分析华东区域销售下降原因，并生成报告';
const failureDemoTask = '演示工具失败：预检华中区域销售数据，失败后用修正参数重试';

export function AgentConsole() {
  const { start, stop, retryStep, taskId } = useAgentStream();
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
  const [dockView, setDockView] = useState<DockView>('steps');
  const [runtimeDockManuallyToggled, setRuntimeDockManuallyToggled] = useState(false);
  const modelLabel = useRuntimeModelLabel();

  function handleNewConversation() {
    useAgentStore.getState().startNewConversation();
  }

  const lastError = useAgentStore((state) => state.lastError);
  const failedTool = useMemo(
    () =>
      status === 'error'
        ? [...tools].reverse().find((tool) => tool.status === 'failed' && tool.stepId)
        : undefined,
    [status, tools],
  );

  const stepRows = useMemo(
    () => buildExecutionSteps({ plan, tools, events, status }),
    [events, plan, status, tools],
  );
  const completedStepCount =
    state?.completedStepIds.length ?? plan?.steps.filter((step) => step.status === 'success').length ?? 0;
  const totalStepCount = plan?.steps.length ?? 0;
  const workspaceProgress = totalStepCount
    ? Math.round((completedStepCount / totalStepCount) * 100)
    : status === 'success'
      ? 100
      : 0;
  const eventTimestamps = events.map((event) => event.timestamp).filter((value) => value > 0);
  const workspaceDuration =
    eventTimestamps.length >= 2 ? Math.max(...eventTimestamps) - Math.min(...eventTimestamps) : undefined;
  const liveRetryCount = events.filter((event) => event.type === 'task_retry').length;

  const focusedObjectType = focusedRuntimeObject?.type;
  const focusedObjectId = focusedRuntimeObject?.id;
  const activeNodeId = focusedNodeId ?? currentNodeId;
  const activeStepId = activeNodeId?.startsWith('tool:')
    ? activeNodeId.slice('tool:'.length)
    : activeNodeId === 'answer'
      ? plan?.steps.find((step) => step.tool === 'llm')?.id
      : undefined;
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
        modelLabel,
      }),
    [
      citations,
      currentNode?.component,
      currentTool,
      evaluation,
      modelLabel,
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

  useEffect(() => {
    if (runtimeDockManuallyToggled) return;
    if (status === 'running' && hasTaskActivity) {
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

  function handleStepSelect(step: { id: string; nodeId?: string; tool: string }) {
    const node =
      displayNodes.find((item) => item.id === step.nodeId) ??
      (step.tool === 'llm' ? displayNodes.find((item) => item.kind === 'answer') : undefined);
    if (node) selectRuntimeNode(node, { openDrawer: true, section: 'trace' });
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
      {hasTaskActivity ? (
        <WorkspaceBar
          goal={latestUserMessage?.content ?? plan?.goal}
          status={status}
          modelLabel={modelLabel}
          progress={workspaceProgress}
          completedSteps={completedStepCount}
          totalSteps={totalStepCount}
          retryCount={liveRetryCount}
          maxRetry={2}
          duration={workspaceDuration}
          failure={
            failedTool
              ? {
                  stepId: failedTool.stepId,
                  tool: failedTool.name,
                  message: lastError,
                }
              : undefined
          }
          taskId={taskId}
          onCancel={handleStop}
        />
      ) : null}

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
              onStartFailureDemo={() => runServerTask(failureDemoTask)}
              failedTool={failedTool}
              onRetryStep={handleRetryStep}
              cancelled={status === 'cancelled'}
              runtimeOverview={runtimeOverview}
              runtimeObjects={runtimeObjects}
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

                {/* All views stay mounted so switching keeps scroll, zoom and selection. */}
                <div
                  className={
                    dockView === 'steps'
                      ? 'min-h-0 flex-1 overflow-hidden'
                      : 'hidden min-h-0 flex-1 overflow-hidden'
                  }
                >
                  <ExecutionSteps
                    steps={stepRows}
                    activeStepId={activeStepId}
                    onSelect={handleStepSelect}
                    onStart={() => runServerTask(defaultTask)}
                  />
                </div>

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
                    <ExecutionGraphEmptyState onStart={() => runServerTask(defaultTask)} onStartFailureDemo={() => runServerTask(failureDemoTask)} />
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
    setRuntimeDockManuallyToggled(false);
    setRuntimeDockExpanded(true);
    setAutoFollowRuntime(true);
    void start(input);
  }

  function handleStop() {
    void stop();
  }

  function handleRetryStep(args: Record<string, unknown>) {
    if (!failedTool?.stepId) return;
    setRuntimeDockManuallyToggled(false);
    setRuntimeDockExpanded(true);
    setAutoFollowRuntime(true);
    void retryStep(failedTool.stepId, args);
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
    { label: 'Eval', kind: 'evaluation' },
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
          <div className="truncate text-sm font-semibold text-ink">Execution</div>
          <div className="mt-0.5 truncate text-[10px] text-muted">Steps · graph · timeline</div>
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

function getInspectorSectionForRuntimeObject(object: RuntimeObject): string {
  if (object.type === 'knowledge') return 'knowledge';
  if (object.type === 'memory') return 'memory';
  if (object.type === 'evaluation') return 'evaluation';
  return 'trace';
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
