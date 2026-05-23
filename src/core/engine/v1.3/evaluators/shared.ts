import type { PolicyMatcher, GovernanceRequest } from '../types';

export function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return pattern === value;

  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = escaped.replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(value);
}

export function matchesPolicy(matcher: PolicyMatcher, request: GovernanceRequest): boolean {
  if (matcher.action_class) {
    const requestActionClass = request.action_class ?? '';
    if (!globMatch(matcher.action_class, requestActionClass)) {
      return false;
    }
  }

  if (matcher.tool) {
    const requestTool = request.tool ?? '';
    if (!globMatch(matcher.tool, requestTool)) {
      return false;
    }
  }

  if (matcher.agent_id) {
    const requestAgentId = request.nhi_identity?.agent_id ?? '';
    if (!globMatch(matcher.agent_id, requestAgentId)) {
      return false;
    }
  }

  if (matcher.environment) {
    const requestEnv =
      (request.action_attributes?.environment as string) ?? '';
    if (!globMatch(matcher.environment, requestEnv)) {
      return false;
    }
  }

  if (matcher.model) {
    const requestModel = request.model ?? '';
    if (!globMatch(matcher.model, requestModel)) {
      return false;
    }
  }

  return true;
}
