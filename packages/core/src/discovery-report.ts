import type { DiscoveryIssue, DiscoveryReport } from './types.js';

export function createDiscoveryReport(): DiscoveryReport {
  const issues: DiscoveryIssue[] = [];
  return {
    get issues() {
      return issues;
    },
    add(issue) {
      issues.push(issue);
    },
    hasErrors() {
      return issues.some((i) => i.severity === 'error');
    },
  };
}
