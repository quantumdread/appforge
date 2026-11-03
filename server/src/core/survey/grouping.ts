import type { Issue } from '../analyzer.js';
import { canonicalRuleId, causeKey, findingFingerprintV2 } from '../fingerprint.js';
import type { GroupingKey, RuleMetadata, SeverityClass } from '../rule-metadata.js';
import { sha256 } from '../sha256.js';

export type ClassifiedIssue = Readonly<Omit<Issue, 'rule'> & {
  rule: string;
  severity: SeverityClass;
}>;

export type RootCauseGroup = {
  group_id: string;
  grouping_key: GroupingKey;
  key_value: string;
  dominant_severity: SeverityClass;
  member_fingerprints: readonly string[];
  members: readonly ClassifiedIssue[];
};

type MutableGroup = {
  group_id: string;
  grouping_key: GroupingKey;
  key_value: string;
  dominant_severity: SeverityClass;
  member_fingerprints: string[];
  members: ClassifiedIssue[];
};

const SEVERITY_PRECEDENCE: Readonly<Record<SeverityClass, number>> = {
  BLOCK: 5,
  CORRECTNESS_RISK: 4,
  PERFORMANCE_RISK: 3,
  MAINTAINABILITY: 2,
  UNCERTAINTY: 1,
};

export function groupIssues(
  issues: readonly ClassifiedIssue[],
  registry: Readonly<Record<string, RuleMetadata>>,
): RootCauseGroup[] {
  const grouped = new Map<string, MutableGroup>();
  for (const issue of issues) {
    const groupingKey = registry[issue.rule].groupingKey;
    const fingerprint = findingFingerprintV2(issue);
    const keyValue = groupingKey === 'none'
      ? fingerprint
      : groupingKey === 'file'
        ? `${canonicalRuleId(issue.rule)}:${issue.file}`
        : causeKey(issue.evidence);
    const groupId = sha256(JSON.stringify([groupingKey, keyValue])).slice(0, 16);
    const group = grouped.get(groupId) ?? {
      group_id: groupId,
      grouping_key: groupingKey,
      key_value: keyValue,
      dominant_severity: issue.severity,
      member_fingerprints: [],
      members: [],
    };
    group.member_fingerprints.push(fingerprint);
    group.members.push(issue);
    if (SEVERITY_PRECEDENCE[issue.severity] > SEVERITY_PRECEDENCE[group.dominant_severity]) {
      group.dominant_severity = issue.severity;
    }
    grouped.set(groupId, group);
  }
  return [...grouped.values()].sort((left, right) => {
    const severityOrder = SEVERITY_PRECEDENCE[right.dominant_severity]
      - SEVERITY_PRECEDENCE[left.dominant_severity];
    if (severityOrder !== 0) return severityOrder;
    const memberOrder = right.members.length - left.members.length;
    if (memberOrder !== 0) return memberOrder;
    return left.group_id < right.group_id ? -1 : left.group_id > right.group_id ? 1 : 0;
  });
}
