export type TicketStatus = 'OPEN' | 'UNDER_NEGOTIATION' | 'RESOLVED' | 'REJECTED' | 'ESCALATED';

export interface ECOProposalCandidate {
  id: string;
  title: string;
  description: string;
  predictedWnsDeltaNs: number;
  areaDeltaPct: number;
  powerDeltaPct: number;
  latencyDeltaCycles: number;
  confidence: number; // 0.0 to 1.0
  riskScore: number; // 0.0 (low) to 1.0 (high)
  requiresNegotiationWith: string[];
}

export interface NegotiationTicket {
  id: string;
  requester: string;
  problem: string;
  affectedPath: string;
  currentPhysicalState?: {
    congestionPct?: number;
    areaUm2?: number;
    powermW?: number;
  };
  hardInvariants: string[];
  candidates: ECOProposalCandidate[];
  status: TicketStatus;
  selectedCandidateId?: string;
  resolutionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NegotiationDecision {
  selectedCandidateId: string;
  approvedBy: string;
  reason: string;
}
