import { AgentVerificationHarness } from '@nayvid/agent-harness';
import { SiliconKnowledgeGraph } from '@nayvid/silicon-graph';
import { ECONegotiationBus } from '@nayvid/negotiation-bus';
import { ContextFirewall } from './firewall.js';
import type {
  AgentExecutionTask,
  AgentExecutionStateRecord,
} from './types.js';

export type ToolExecutionCallback = (
  action: string,
  params: Record<string, any>
) => Promise<{ success: boolean; output: any; metrics?: Record<string, any> }>;

export class DeterministicAgentStateMachine {
  private harness = new AgentVerificationHarness();
  private firewall = new ContextFirewall();

  constructor(
    private graph: SiliconKnowledgeGraph = new SiliconKnowledgeGraph(),
    private ecoBus: ECONegotiationBus = new ECONegotiationBus()
  ) {}

  async executeLoop(
    task: AgentExecutionTask,
    executor: ToolExecutionCallback
  ): Promise<AgentExecutionStateRecord> {
    const record: AgentExecutionStateRecord = {
      taskId: task.id,
      currentState: 'OBJECTIVE',
    };

    record.currentState = 'OBSERVE';
    record.observations = {
      graphNodesCount: this.graph.dump().nodes.length,
      taskObjective: task.objective,
    };

    record.currentState = 'PLAN';
    record.plan = `Formulated execution plan for task ${task.id} (Objective: ${task.objective})`;

    record.currentState = 'PRE_HOOK_CHAIN';
    const preResults = await this.harness.runPreHooks({
      agentId: task.agentId,
      action: task.objective,
      inputs: task.contextData || {},
      dataClassification: task.dataClassification || 'INTERNAL',
    });

    const prePassed = preResults.every((r) => r.passed);
    record.preHooksPassed = prePassed;

    if (!prePassed) {
      record.currentState = 'ESCALATE';
      record.escalated = true;
      return record;
    }

    record.currentState = 'EXECUTE';
    const firewallRes = this.firewall.sanitizeForCloud(
      task.objective,
      task.dataClassification || 'INTERNAL'
    );

    const execRes = await executor(firewallRes.sanitizedPrompt, task.contextData || {});
    record.executionOutput = execRes.output;

    record.currentState = 'POST_HOOK_CHAIN';
    const postResults = await this.harness.runPostHooks({
      agentId: task.agentId,
      action: task.objective,
      inputs: task.contextData || {},
      executionOutput: execRes.output,
      executionMetrics: execRes.metrics,
    });

    const postPassed = postResults.every((r) => r.passed);
    record.postHooksPassed = postPassed;

    record.currentState = 'VERIFY';
    const evalRes = this.harness.evaluateExecutionSuccess(
      preResults,
      postResults,
      execRes.metrics
    );

    record.verified = evalRes.verified;
    record.verifiedReason = evalRes.failureReason;

    if (evalRes.verified) {
      record.currentState = 'COMMIT';
      record.committed = true;

      record.currentState = 'LEARN';
      this.graph.addNode({
        id: `run_${task.id}`,
        kind: 'Run',
        name: `Task Run ${task.id}`,
        attributes: { objective: task.objective, agentId: task.agentId },
      });
    } else {
      record.currentState = 'ROLLBACK';
      record.rolledBack = true;

      record.currentState = 'ESCALATE';
      record.escalated = true;
    }

    return record;
  }
}
