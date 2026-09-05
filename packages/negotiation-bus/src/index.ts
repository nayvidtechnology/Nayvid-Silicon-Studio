import type {
  NegotiationTicket,
  ECOProposalCandidate,
  TicketStatus,
  NegotiationDecision,
} from './types.js';

export class ECONegotiationBus {
  private tickets: Map<string, NegotiationTicket> = new Map();
  private ticketCounter = 100;

  createTicket(
    data: Omit<NegotiationTicket, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'candidates'> & {
      candidates?: ECOProposalCandidate[];
    }
  ): NegotiationTicket {
    const id = `ECO-${++this.ticketCounter}`;
    const now = new Date().toISOString();
    const ticket: NegotiationTicket = {
      ...data,
      id,
      candidates: data.candidates || [],
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    };
    this.tickets.set(id, ticket);
    return ticket;
  }

  getTicket(id: string): NegotiationTicket | undefined {
    return this.tickets.get(id);
  }

  listTickets(status?: TicketStatus): NegotiationTicket[] {
    const list = Array.from(this.tickets.values());
    if (status) {
      return list.filter((t) => t.status === status);
    }
    return list;
  }

  submitCandidate(ticketId: string, candidate: ECOProposalCandidate): NegotiationTicket {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Negotiation ticket '${ticketId}' not found.`);
    if (ticket.status === 'RESOLVED' || ticket.status === 'REJECTED') {
      throw new Error(`Cannot modify closed ticket '${ticketId}'.`);
    }

    const idx = ticket.candidates.findIndex((c) => c.id === candidate.id);
    if (idx >= 0) {
      ticket.candidates[idx] = candidate;
    } else {
      ticket.candidates.push(candidate);
    }

    ticket.status = 'UNDER_NEGOTIATION';
    ticket.updatedAt = new Date().toISOString();
    return ticket;
  }

  evaluateCandidates(ticketId: string): { recommendedCandidate?: ECOProposalCandidate; rationale: string } {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Negotiation ticket '${ticketId}' not found.`);
    if (ticket.candidates.length === 0) {
      return { rationale: 'No candidate proposals submitted.' };
    }

    let best: ECOProposalCandidate | undefined;
    let bestScore = -Infinity;

    for (const c of ticket.candidates) {
      const wnsScore = c.predictedWnsDeltaNs * 100;
      const confidenceBonus = c.confidence * 20;
      const latencyPenalty = c.latencyDeltaCycles * 15;
      const areaPenalty = Math.max(0, c.areaDeltaPct) * 2;
      const riskPenalty = c.riskScore * 25;

      const totalScore = wnsScore + confidenceBonus - latencyPenalty - areaPenalty - riskPenalty;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        best = c;
      }
    }

    if (!best) return { rationale: 'Unable to evaluate candidates.' };

    return {
      recommendedCandidate: best,
      rationale: `Candidate '${best.title}' (ID: ${best.id}) recommended with score ${bestScore.toFixed(2)}. Predicted WNS Delta: +${(best.predictedWnsDeltaNs * 1000).toFixed(0)}ps, Area Delta: ${best.areaDeltaPct}%, Latency: +${best.latencyDeltaCycles} cycle(s).`,
    };
  }

  arbitrate(ticketId: string, decision: NegotiationDecision): NegotiationTicket {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`Negotiation ticket '${ticketId}' not found.`);

    const cand = ticket.candidates.find((c) => c.id === decision.selectedCandidateId);
    if (!cand) throw new Error(`Candidate '${decision.selectedCandidateId}' not found on ticket '${ticketId}'.`);

    ticket.selectedCandidateId = decision.selectedCandidateId;
    ticket.status = 'RESOLVED';
    ticket.resolutionReason = `Approved by ${decision.approvedBy}: ${decision.reason}`;
    ticket.updatedAt = new Date().toISOString();

    return ticket;
  }
}

export * from './types.js';
