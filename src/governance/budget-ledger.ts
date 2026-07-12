import type { BudgetPolicy } from './budget-policy.js';
import { governanceError } from './errors.js';

export type ReservationState = 'estimated'|'reserved'|'blocked'|'consumed'|'released'|'reconciled'|'failed';
export interface Reservation { readonly reservation_id: string; readonly execution_id: string; readonly policy_id: string; readonly scope_id: string; readonly reserved_tokens: number; readonly reserved_cost_minor: bigint; state: ReservationState; actual_tokens?: number; actual_cost_minor?: bigint; released_cost_minor?: bigint; }
interface ScopeTotals { requests: number; tokens: number; cost: bigint; reservedRequests: number; reservedTokens: number; reservedCost: bigint; }
export class InMemoryBudgetLedger {
  private readonly reservations = new Map<string, Reservation>(); private readonly scopes = new Map<string, ScopeTotals>();
  constructor(private readonly id: (executionId: string) => string = executionId => `reservation-${executionId}`) {}
  reserve(executionId: string, policy: BudgetPolicy, tokens: number, cost: bigint): Reservation {
    const totals = this.scopes.get(policy.scope_id) ?? { requests:0,tokens:0,cost:0n,reservedRequests:0,reservedTokens:0,reservedCost:0n };
    if (tokens > policy.max_estimated_tokens_per_request) throw governanceError('REQUEST_TOKEN_LIMIT_EXCEEDED');
    if (cost > BigInt(policy.max_estimated_cost_minor_per_request)) throw governanceError('REQUEST_COST_LIMIT_EXCEEDED');
    if (totals.requests + totals.reservedRequests + 1 > policy.rolling_request_limit) throw governanceError('ROLLING_REQUEST_LIMIT_EXCEEDED');
    if (totals.tokens + totals.reservedTokens + tokens > policy.rolling_token_limit) throw governanceError('ROLLING_TOKEN_LIMIT_EXCEEDED');
    if (totals.cost + totals.reservedCost + cost > BigInt(policy.rolling_cost_minor_limit)) throw governanceError('ROLLING_COST_LIMIT_EXCEEDED');
    totals.reservedRequests++; totals.reservedTokens += tokens; totals.reservedCost += cost; this.scopes.set(policy.scope_id, totals);
    const reservation: Reservation = { reservation_id: this.id(executionId), execution_id: executionId, policy_id: policy.policy_id, scope_id: policy.scope_id, reserved_tokens: tokens, reserved_cost_minor: cost, state: 'reserved' };
    this.reservations.set(reservation.reservation_id, reservation); return reservation;
  }
  reconcile(id: string, executionId: string, actualTokens: number, actualCost: bigint, final: 'consumed'|'failed'): Reservation {
    const reservation = this.reservations.get(id); if (!reservation || reservation.execution_id !== executionId) throw governanceError('BUDGET_RECONCILIATION_FAILED');
    if (reservation.state === 'reconciled' || reservation.state === 'released') return reservation;
    if (reservation.state !== 'reserved') throw governanceError('BUDGET_RECONCILIATION_FAILED');
    const totals = this.scopes.get(reservation.scope_id)!; totals.reservedRequests--; totals.reservedTokens -= reservation.reserved_tokens; totals.reservedCost -= reservation.reserved_cost_minor;
    if (final === 'consumed') { totals.requests++; totals.tokens += actualTokens; totals.cost += actualCost; reservation.actual_tokens = actualTokens; reservation.actual_cost_minor = actualCost; reservation.released_cost_minor = reservation.reserved_cost_minor > actualCost ? reservation.reserved_cost_minor-actualCost : 0n; reservation.state = 'reconciled'; }
    else { reservation.released_cost_minor = reservation.reserved_cost_minor; reservation.state = 'released'; }
    return reservation;
  }
  get(id: string): Reservation | undefined { return this.reservations.get(id); }
  snapshot(scope: string): Readonly<ScopeTotals> | undefined { const value = this.scopes.get(scope); return value && {...value}; }
}
