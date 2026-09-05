import { describe, it, expect } from 'vitest';
import { ECONegotiationBus } from '../src/index.js';

describe('ECONegotiationBus', () => {
  it('creates tickets, submits candidates, evaluates and arbitrates', () => {
    const bus = new ECONegotiationBus();
    const ticket = bus.createTicket({
      requester: 'Timing Director',
      problem: 'WNS = -175 ps on execute/alu/result_path',
      affectedPath: 'execute/alu/result_path',
      hardInvariants: ['AXI transaction ordering', 'Clock = 1.05 GHz'],
    });

    expect(ticket.id).toBe('ECO-101');
    expect(ticket.status).toBe('OPEN');

    bus.submitCandidate(ticket.id, {
      id: 'A',
      title: 'Physical buffering',
      description: 'Buffer insertion on route',
      predictedWnsDeltaNs: 0.123,
      areaDeltaPct: 0.1,
      powerDeltaPct: 0.2,
      latencyDeltaCycles: 0,
      confidence: 0.88,
      riskScore: 0.2,
      requiresNegotiationWith: ['Physical Director'],
    });

    bus.submitCandidate(ticket.id, {
      id: 'B',
      title: 'Pipeline insertion',
      description: 'Insert 1 stage pipeline in ALU',
      predictedWnsDeltaNs: 0.316,
      areaDeltaPct: 1.1,
      powerDeltaPct: 0.5,
      latencyDeltaCycles: 1,
      confidence: 0.94,
      riskScore: 0.1,
      requiresNegotiationWith: ['RTL Agent', 'Architecture Agent'],
    });

    const evalResult = bus.evaluateCandidates(ticket.id);
    expect(evalResult.recommendedCandidate).toBeDefined();

    const resolved = bus.arbitrate(ticket.id, {
      selectedCandidateId: 'B',
      approvedBy: 'Chief Silicon Architect',
      reason: 'Pipelining gives largest WNS margin with minimal area impact.',
    });

    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.selectedCandidateId).toBe('B');
  });
});
