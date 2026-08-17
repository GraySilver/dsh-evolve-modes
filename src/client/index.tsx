import { useEffect, useState, type CSSProperties } from 'react'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-plan-mode/client'
import type {
  ClientContext,
  ContextMessageNode,
  ConversationLocation,
  ConversationNodeContext,
  ConversationNodeDefinition,
  ConversationViewNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconCheckOutline14,
  IconChecklistOutline14,
  IconChevronDownOutline14,
  IconThinkOutline14,
  MarkdownText,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { FIRST_PRINCIPLES } from '../prompt.ts'
import type { QualityGate, ReasoningMode, TaskModeReview } from '../types.ts'

interface ModeState {
  readonly reasoning: ReasoningMode
  readonly quality: QualityGate
}

interface ControlFace {
  getState(): Promise<ModeState>
  setWorking(value: 'execute' | 'plan'): Promise<ModeState>
  setReasoning(value: ReasoningMode): Promise<ModeState>
  setQuality(value: QualityGate): Promise<ModeState>
  review(turn: number): Promise<TaskModeReview | undefined>
}

type ControlProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'taskModes'> & InjectFace<ControlFace>

/** Required browser services for task-mode controls and Trajectory projection. */
export const inject = ['slots', 'locale', 'remote', 'remote.commands', 'conversationEvents']

const triggerStyle: CSSProperties = {
  alignItems: 'center',
  background: 'transparent',
  border: 0,
  borderRadius: 24,
  boxSizing: 'border-box',
  color: 'var(--dsw-alias-label-secondary)',
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 13,
  fontWeight: 500,
  gap: 4,
  lineHeight: '20px',
  maxWidth: 280,
  minHeight: 28,
  minWidth: 0,
  padding: '4px 4px 4px 8px',
  textAlign: 'left',
}
const reviewStyle: CSSProperties = {
  background: 'var(--dsw-alias-bg-module-platform)',
  borderRadius: 6,
  boxSizing: 'border-box',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 11,
  lineHeight: '16px',
  padding: '8px 12px',
  width: '100%',
}
const reviewSummaryStyle: CSSProperties = { alignItems: 'center', cursor: 'pointer', display: 'flex', fontSize: 11, fontWeight: 500, gap: 6 }
const reviewBodyStyle: CSSProperties = { height: 240, overflowY: 'auto', paddingTop: 8 }
const reviewMarkdownStyle: CSSProperties & Record<`--${string}`, string> = {
  '--dsw-font-markdown-base': '11px/16px var(--dsw-font-family)',
  '--dsw-font-markdown-base-strong': '600 11px/16px var(--dsw-font-family)',
  '--dsw-font-markdown-h1': '700 15px/21px var(--dsw-font-family)',
  '--dsw-font-markdown-h2': '700 14px/20px var(--dsw-font-family)',
  '--dsw-font-markdown-h3': '700 13px/18px var(--dsw-font-family)',
  '--dsw-font-markdown-h4': '600 12px/17px var(--dsw-font-family)',
}

function qualityLabel(quality: QualityGate, t: ControlProps['t']): string {
  switch (quality) {
    case 'off': return t('qualityOff')
    case 'general-review': return t('generalReview')
    case 'acceptance-review': return t('acceptanceReview')
  }
}

function TaskModeControl({ getState, setWorking, setReasoning, setQuality, useProjection, t }: ControlProps) {
  const [state, setState] = useState<ModeState | undefined>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<'working' | 'reasoning' | 'quality' | undefined>()
  const [error, setError] = useState<string | undefined>()
  const plan = useProjection('plan')
  const working: 'execute' | 'plan' = plan !== undefined && (plan.pending ? !plan.active : plan.active) ? 'plan' : 'execute'

  useEffect(() => {
    let live = true
    void getState().then(value => {
      if (live) setState(value)
    }).catch(reason => {
      if (live) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { live = false }
  }, [getState])

  const change = (kind: NonNullable<typeof busy>, operation: () => Promise<ModeState>): void => {
    setBusy(kind)
    setError(undefined)
    void operation().then(value => {
      setState(value)
    }).catch(reason => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(undefined) })
  }

  const disabled = state === undefined
  const reasoning = state?.reasoning ?? 'standard'
  const quality = state?.quality ?? 'off'
  const summary = `${working === 'execute' ? t('execute') : t('plan')} · ${reasoning === 'standard' ? t('standard') : t('firstPrinciples')} · ${qualityLabel(quality, t)}`
  const menuItems: MenuEntry[] = [
    { type: 'label', id: 'working-label', text: t('workingLabel') },
    { id: 'working.execute', label: t('execute'), icon: <IconCheckOutline14 /> },
    { id: 'working.plan', label: t('plan'), icon: <IconThinkOutline14 />, disabled: plan === undefined },
    { type: 'separator', id: 'reasoning-separator' },
    { type: 'label', id: 'reasoning-label', text: t('reasoningLabel') },
    { id: 'reasoning.standard', label: t('standard'), icon: <IconCheckOutline14 /> },
    { id: 'reasoning.first-principles', label: t('firstPrinciples'), icon: <IconThinkOutline14 /> },
    { type: 'separator', id: 'quality-separator' },
    { type: 'label', id: 'quality-label', text: t('qualityLabel') },
    { id: 'quality.off', label: qualityLabel('off', t), icon: <IconCheckOutline14 /> },
    { id: 'quality.general-review', label: qualityLabel('general-review', t), icon: <IconChecklistOutline14 /> },
    { id: 'quality.acceptance-review', label: qualityLabel('acceptance-review', t), icon: <IconChecklistOutline14 /> },
  ]

  return <span style={{ alignItems: 'center', display: 'inline-flex', minWidth: 0 }}>
    <Menu
      open={menuOpen}
      onClose={() => { setMenuOpen(false) }}
      items={menuItems}
      selectedIds={[
        `working.${working}`,
        `reasoning.${reasoning}`,
        `quality.${quality}`,
      ]}
      onSelect={(id) => {
        setMenuOpen(false)
        if (id === 'working.execute' && working !== 'execute') {
          change('working', () => setWorking('execute'))
        } else if (id === 'working.plan' && working !== 'plan') {
          change('working', () => setWorking('plan'))
        } else if (id === 'reasoning.standard' && reasoning !== 'standard') {
          change('reasoning', () => setReasoning('standard'))
        } else if (id === 'reasoning.first-principles' && reasoning !== 'first-principles') {
          change('reasoning', () => setReasoning('first-principles'))
        } else if (id === 'quality.off' && quality !== 'off') {
          change('quality', () => setQuality('off'))
        } else if (id === 'quality.general-review' && quality !== 'general-review') {
          change('quality', () => setQuality('general-review'))
        } else if (id === 'quality.acceptance-review' && quality !== 'acceptance-review') {
          change('quality', () => setQuality('acceptance-review'))
        }
      }}
      side="top"
      anchor={
        <button
          type="button"
          style={triggerStyle}
          aria-label={summary}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={disabled || busy !== undefined}
          onClick={() => { setMenuOpen(value => !value) }}
        >
          <IconThinkOutline14 />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{summary}</span>
          <IconChevronDownOutline14 style={{ flex: '0 0 auto' }} />
        </button>
      }
    />
    {error === undefined ? null : <span role="alert" title={error} style={{ color: 'var(--dsw-alias-label-danger)', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('error')}</span>}
  </span>
}

type ReviewProps = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'taskModes'> & InjectFace<Pick<ControlFace, 'review'>>
function ReviewTail({ turn, review, t }: ReviewProps) {
  const [item, setItem] = useState<TaskModeReview | undefined>()
  useEffect(() => {
    let live = true
    void review(turn.turn).then(value => { if (live) setItem(value) }).catch(() => { if (live) setItem(undefined) })
    return () => { live = false }
  }, [review, turn.turn])
  if (item === undefined || item.text === '') return null
  const label = item.profile === 'general-review' ? t('generalReview') : t('acceptanceReview')
  const summary = item.status === 'completed' ? label : `${label} - ${t('unavailable')}`
  return <details style={reviewStyle}><summary style={reviewSummaryStyle}><IconChecklistOutline14 /> {summary}</summary><div style={reviewBodyStyle}><div style={reviewMarkdownStyle}><MarkdownText text={item.text} /></div></div></details>
}

function TaskModeReviewCommandView() { return null }

/**
 * The unified task-mode button owns Plan interaction, so it takes the
 * composer's otherwise separate plan-status seat without adding another chip.
 */
function UnifiedPlanSeat() { return null }

interface TrajectoryContextViewNode extends ConversationViewNode {
  readonly target: 'trajectory'
  readonly anchorSeq: number
  readonly location: ConversationLocation
  readonly data: { readonly kind: 'node'; readonly node: ContextMessageNode }
}

function trajectoryContextNode(
  context: ConversationNodeContext<ContextMessageNode>,
): TrajectoryContextViewNode | null {
  if (context.state === undefined) return null
  return {
    key: context.key,
    kind: context.kind,
    id: context.id,
    target: 'trajectory',
    anchorSeq: context.state.seq,
    location: context.start?.location ?? { kind: 'unresolved' },
    data: { kind: 'node', node: context.state },
  }
}

const firstPrinciplesTrajectoryDefinition: ConversationNodeDefinition<ContextMessageNode> = {
  kind: 'task-mode-first-principles-injection',
  target: 'trajectory',
  match: event => event.type === 'request/header'
    && event.data.header.system?.includes(FIRST_PRINCIPLES) === true
    ? { id: String(event.seq), role: 'start' }
    : null,
  start: (_context, match) => {
    if (match.event.type !== 'request/header') {
      throw new Error('first-principles Trajectory projection requires request/header')
    }
    return {
      kind: 'context',
      seq: match.event.seq,
      time: match.event.time,
      content: [{ type: 'text', text: FIRST_PRINCIPLES }],
      source: { kind: 'plugin', plugin: 'dsh-task-modes:first-principles' },
      provenance: { role: 'inject', label: 'dsh-task-modes:first-principles' },
      form: null,
    }
  },
  update: context => context.state,
  buildViewNode: trajectoryContextNode,
}

const en = {
  execute: 'Execute',
  plan: 'Plan',
  workingLabel: 'Working state',
  reasoningLabel: 'Reasoning strategy',
  standard: 'Standard',
  firstPrinciples: 'First principles',
  qualityLabel: 'Quality gate',
  qualityOff: 'Off',
  generalReview: 'Adversarial review',
  acceptanceReview: 'Acceptance review',
  unavailable: 'unavailable',
  error: 'Task-mode update failed',
}
const zh: typeof en = {
  execute: '执行',
  plan: '计划',
  workingLabel: '工作状态',
  reasoningLabel: '思考策略',
  standard: '标准',
  firstPrinciples: '第一性原理',
  qualityLabel: '质量审查',
  qualityOff: '关闭',
  generalReview: '对抗性审查',
  acceptanceReview: '验收审查',
  unavailable: '不可用',
  error: '任务模式更新失败',
}
type TaskModesKey = keyof typeof en
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { taskModes: TaskModesKey } }

function parseState(text: string): ModeState {
  const values = new Map(text.split('\n').map(line => {
    const [key, value] = line.split(': ', 2)
    return [key, value]
  }))
  const reasoning = values.get('reasoning')
  const quality = values.get('quality')
  if ((reasoning !== 'standard' && reasoning !== 'first-principles')
    || (quality !== 'off' && quality !== 'general-review' && quality !== 'acceptance-review')) {
    throw new Error(`unexpected task-mode state: ${text}`)
  }
  return { reasoning, quality }
}

function parseReview(text: string): TaskModeReview | undefined {
  if (text === '') return undefined
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null) throw new Error('task-mode review response is not an object')
  const review = value as Partial<TaskModeReview>
  const { turn, profile, status, text: reviewText, createdAt } = review
  if (typeof turn !== 'number' || !Number.isSafeInteger(turn) || turn < 0
    || (profile !== 'general-review' && profile !== 'acceptance-review')
    || (status !== 'completed' && status !== 'unavailable')
    || typeof reviewText !== 'string' || typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new Error('task-mode review response is invalid')
  }
  return { turn, profile, status, text: reviewText, createdAt }
}

/** Mount composable task-mode controls, persisted review history, and Trajectory evidence. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('taskModes', { en, zh }), 'dsh-task-modes: locale')
  ctx.conversationEvents.register(firstPrinciplesTrajectoryDefinition)
  const execute = async (sessionId: string, line: string): Promise<string> => {
    const response = await ctx.remote.commands.execute(sessionId as never, line)
    if (!response.ok) throw new Error(`${response.error.message} (${response.error.code})`)
    if (response.value === undefined) throw new Error(`unknown command: ${line}`)
    if (response.value.result.kind === 'error') throw new Error(response.value.result.text)
    return response.value.result.text ?? ''
  }
  const faceFor = (sessionId: string): ControlFace => ({
    getState: async () => parseState(await execute(sessionId, '/task-mode')),
    setWorking: async value => parseState(await execute(sessionId, `/task-mode working ${value}`)),
    setReasoning: async value => parseState(await execute(sessionId, `/task-mode reasoning ${value}`)),
    setQuality: async value => parseState(await execute(sessionId, `/task-mode quality ${value}`)),
    review: async turn => parseReview(await execute(sessionId, `/task-mode-review ${turn}`)),
  })
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'task-modes', locale: 'taskModes', inject: faceFor }, TaskModeControl))
  ctx.slots.inject('conversation.input.plan', () => ctx.slots.register({ name: 'conversation.input.plan', id: 'task-modes-plan-seat', priority: -1 }, UnifiedPlanSeat))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', select: () => true, locale: 'taskModes', inject: sessionId => ({ review: faceFor(sessionId).review }) }, ReviewTail))
  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({ name: 'conversation.chat.commandview', key: 'task-mode-review' }, TaskModeReviewCommandView))
}
