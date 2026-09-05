import { describe, it, expect } from 'vitest';
import { DeterministicAgentStateMachine, ContextFirewall } from '../src/index.js';

describe('Agent Runtime State Machine', () => {
  it('executes full loop OBJECTIVE -> OBSERVE -> PLAN -> PRE -> EXECUTE -> POST -> VERIFY -> COMMIT -> LEARN', async () => {
    const stateMachine = new DeterministicAgentStateMachine();

    const result = await stateMachine.executeLoop(
      {
        id: 'task_001',
        agentId: 'rtl.coder',
        level: 'executor',
        trustLevel: 'T3',
        objective: 'restructure_pipeline',
        dataClassification: 'INTERNAL',
      },
      async (action, params) => {
        return {
          success: true,
          output: { patch: 'pipeline stage inserted' },
          metrics: { wnsNs: 0.035, areaUm2: 4300 },
        };
      }
    );

    expect(result.preHooksPassed).toBe(true);
    expect(result.postHooksPassed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.committed).toBe(true);
    expect(result.currentState).toBe('LEARN');
  });

  it('sanitizes context through firewall for cloud egress', () => {
    const firewall = new ContextFirewall();
    const res = firewall.sanitizeForCloud(
      'Instance TSMC_N2_FF cell_inst (.A(a), .Y(y));',
      'RTL_SECRET'
    );

    expect(res.isCloudAllowed).toBe(true);
    expect(res.sanitizedPrompt).not.toContain('TSMC_N2_FF');
    expect(res.sanitizedPrompt).toContain('[SANITIZED_CELL]');
  });
});
