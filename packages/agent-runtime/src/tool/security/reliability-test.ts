import assert from 'node:assert/strict';
import { ToolExecutor } from '@runtime/tool/executor';
import { ToolRegistry } from '@runtime/tool/registry';
import { registerTools } from '@runtime/tool/tools';

async function runReliabilityCases(): Promise<void> {
  await caseViewerCannotQuerySalesData();
  await caseAnalystCanQuerySalesData();
  await caseHighRiskToolRequiresApproval();

  console.log('Day9-1 reliability guardrail cases passed.');
}

async function caseViewerCannotQuerySalesData(): Promise<void> {
  const executor = createExecutor('viewer');
  const result = await executor.run('querySalesData', {
    region: '华东',
    month: '2024-02',
  });

  assert.equal(result.success, false);
  assert.equal(result.security?.eventType, 'permission_denied');
  assert.match(result.error ?? '', /viewer/);
}

async function caseAnalystCanQuerySalesData(): Promise<void> {
  const executor = createExecutor('analyst');
  const result = await executor.run('querySalesData', {
    region: '华东',
    month: '2024-02',
  });

  assert.equal(result.success, true);
  assert.equal(result.security, undefined);
  assert.match(String(result.data), /华东 2024-02 销售数据/);
}

async function caseHighRiskToolRequiresApproval(): Promise<void> {
  const executor = createExecutor('admin');
  const result = await executor.run('slow_query', {});

  assert.equal(result.success, false);
  assert.equal(result.security?.eventType, 'approval_required');
  assert.equal(result.approvalStatus, 'pending_approval');
  assert.match(result.error ?? '', /approval/i);
}

function createExecutor(role: string): ToolExecutor {
  const registry = new ToolRegistry();
  registerTools(registry);
  // Test-only high-risk tool: production registration intentionally ships none.
  registry.register({
    name: 'slow_query',
    description: 'Test-only high-risk tool',
    risk: 'high',
    async execute() {
      return { success: true, toolName: 'slow_query', data: 'slow result', duration: 1 };
    },
  });

  return new ToolExecutor(registry, {
    userContext: {
      userId: `${role}_user`,
      role,
    },
  });
}

void runReliabilityCases().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
