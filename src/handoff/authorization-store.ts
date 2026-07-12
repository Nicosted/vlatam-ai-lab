export type AuthorizationConsumeResult =
  | "consumed"
  | "already_consumed"
  | "superseded";
export interface AuthorizationStateStore {
  consume(id: string, superseded: boolean): AuthorizationConsumeResult;
}
export class InMemoryAuthorizationStateStore implements AuthorizationStateStore {
  private readonly consumed = new Set<string>();
  consume(id: string, superseded: boolean): AuthorizationConsumeResult {
    if (superseded) return "superseded";
    if (this.consumed.has(id)) return "already_consumed";
    this.consumed.add(id);
    return "consumed";
  }
}
