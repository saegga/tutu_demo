import { describe, expect, it } from 'vitest'

import { canTransition, transition } from './state-machine'

describe('state machine', () => {
  it('moves idle → understanding on user message', () => {
    expect(transition('idle', 'user_message')).toBe('understanding')
  })

  it('collecting loop: clarification → waiting_for_user → user_message → understanding', () => {
    expect(transition('understanding', 'draft_incomplete')).toBe('collecting')
    expect(transition('collecting', 'clarification_needed')).toBe('waiting_for_user')
    expect(transition('waiting_for_user', 'user_message')).toBe('understanding')
  })

  it('generate flow reaches ready', () => {
    let s = transition('ready', 'generate_clicked')
    expect(s).toBe('generating')
    s = transition(s!, 'plan_built')
    expect(s).toBe('planning')
    s = transition(s!, 'auto_applied')
    expect(s).toBe('applying')
    s = transition(s!, 'apply_done')
    expect(s).toBe('replanning')
    s = transition(s!, 'optimize_done')
    expect(s).toBe('validating')
    s = transition(s!, 'validate_ok')
    expect(s).toBe('ready')
  })

  it('FAIL leads back to replanning', () => {
    let s = transition('validating', 'validate_fail')
    expect(s).toBe('replanning')
    s = transition(s!, 'replan_ask')
    expect(s).toBe('understanding')
  })

  it('proposal waits for user, reject returns to understanding', () => {
    let s = transition('planning', 'proposal_created')
    expect(s).toBe('proposing')
    s = transition(s!, 'proposal_needs_approval')
    expect(s).toBe('waiting_for_user')
    expect(transition(s!, 'user_approved')).toBe('applying')
    expect(transition(s!, 'user_rejected')).toBe('understanding')
  })

  it('invalid transitions return null', () => {
    expect(transition('idle', 'generate_clicked')).toBeNull()
    expect(canTransition('idle', 'user_message')).toBe(true)
    expect(canTransition('idle', 'generate_clicked')).toBe(false)
  })
})