import type { AgentStatus } from '~shared'

export type AgentEventName =
  | 'user_message'
  | 'draft_incomplete'
  | 'draft_ready'
  | 'clarification_needed'
  | 'no_questions'
  | 'generate_clicked'
  | 'plan_built'
  | 'intent_question'
  | 'intent_change'
  | 'intent_search'
  | 'proposal_created'
  | 'proposal_needs_approval'
  | 'auto_applied'
  | 'found_variants'
  | 'user_approved'
  | 'user_rejected'
  | 'apply_done'
  | 'optimize_done'
  | 'validate_ok'
  | 'validate_fail'
  | 'replan_ok'
  | 'replan_ask'

const TRANSITIONS: Record<string, AgentStatus> = {
  'idle:user_message': 'understanding',
  'understanding:draft_incomplete': 'collecting',
  'understanding:plan_built': 'ready',
  'understanding:intent_question': 'ready',
  'understanding:intent_change': 'planning',
  'understanding:intent_search': 'searching',
  'collecting:clarification_needed': 'waiting_for_user',
  'collecting:no_questions': 'ready',
  'waiting_for_user:user_message': 'understanding',
  'ready:user_message': 'understanding',
  'ready:generate_clicked': 'generating',
  'generating:plan_built': 'planning',
  'planning:proposal_created': 'proposing',
  'planning:auto_applied': 'applying',
  'searching:found_variants': 'ready',
  'proposing:proposal_needs_approval': 'waiting_for_user',
  'proposing:auto_applied': 'applying',
  'waiting_for_user:user_approved': 'applying',
  'waiting_for_user:user_rejected': 'understanding',
  'applying:apply_done': 'replanning',
  'replanning:optimize_done': 'validating',
  'validating:validate_ok': 'ready',
  'validating:validate_fail': 'replanning',
  'replanning:replan_ok': 'ready',
  'replanning:replan_ask': 'understanding',
}

export function transition(from: AgentStatus, event: AgentEventName): AgentStatus | null {
  return TRANSITIONS[`${from}:${event}`] ?? null
}

export function canTransition(from: AgentStatus, event: AgentEventName): boolean {
  return TRANSITIONS[`${from}:${event}`] !== undefined
}