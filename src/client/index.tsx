import { useEffect, useState, type CSSProperties } from 'react'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-plan-mode/client'
import evolveModesRemote from '../remote.ts'
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
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button,
  IconCheckOutline14,
  IconCheckOutline16,
  IconChecklistOutline14,
  IconChevronDownOutline14,
  IconCloseOutline16,
  IconEditOutline16,
  IconPlusOutline16,
  IconRefreshOutline14,
  IconThinkOutline14,
  IconTrashOutline16,
  MarkdownText,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { FIRST_PRINCIPLES } from '../prompt.ts'
import type {
  EvolutionCategory,
  EvolutionConfig,
  EvolutionConfigRequest,
  EvolutionDashboard,
  EvolutionMode,
  EvolutionProposalRequest,
  EvolutionRestoreRequest,
  EvolutionSettingRequest,
  QualityGate,
  ReasoningMode,
  EvolveModeReview,
} from '../types.ts'

interface ModeState {
  readonly working: 'execute' | 'plan'
  readonly reasoning: ReasoningMode
  readonly quality: QualityGate
  readonly evolution: EvolutionMode
  readonly learningBatchSize: number
  readonly pendingEvolutionTurns: number
}

interface ControlFace {
  getState(): Promise<ModeState>
  setWorking(value: 'execute' | 'plan'): Promise<ModeState>
  setReasoning(value: ReasoningMode): Promise<ModeState>
  setQuality(value: QualityGate): Promise<ModeState>
  setEvolution(value: EvolutionMode): Promise<ModeState>
  setBatchSize(value: number): Promise<ModeState>
  review(turn: number): Promise<EvolveModeReview | undefined>
}

type ControlProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'evolveModes'> & InjectFace<ControlFace>

/** Required browser services for evolve-mode controls and Trajectory projection. */
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

function evolutionLabel(evolution: EvolutionMode, t: ControlProps['t']): string {
  return evolution === 'off' ? t('evolutionOff') : t('evolutionPropose')
}

function EvolveModeControl({ getState, setWorking, setReasoning, setQuality, setEvolution, useProjection, t }: ControlProps) {
  const [state, setState] = useState<ModeState | undefined>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<'working' | 'reasoning' | 'quality' | 'evolution' | undefined>()
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
  const evolution = state?.evolution ?? 'off'
  const summary = `${working === 'execute' ? t('execute') : t('plan')} · ${reasoning === 'standard' ? t('standard') : t('firstPrinciples')} · ${qualityLabel(quality, t)} · ${t('evolutionSummary')} ${evolutionLabel(evolution, t)}`
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
    { type: 'separator', id: 'evolution-separator' },
    { type: 'label', id: 'evolution-label', text: t('evolutionLabel') },
    { id: 'evolution.off', label: t('evolutionOff'), icon: <IconCheckOutline14 /> },
    { id: 'evolution.propose', label: t('evolutionPropose'), icon: <IconThinkOutline14 /> },
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
        `evolution.${evolution}`,
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
        } else if (id === 'evolution.off' && evolution !== 'off') {
          change('evolution', () => setEvolution('off'))
        } else if (id === 'evolution.propose' && evolution !== 'propose') {
          change('evolution', () => setEvolution('propose'))
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
          <span style={{ display: 'inline-flex', flex: '0 0 auto' }}><IconChevronDownOutline14 /></span>
        </button>
      }
    />
    {error === undefined ? null : <span role="alert" title={error} style={{ color: 'var(--dsw-alias-label-danger)', fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('error')}</span>}
  </span>
}

type ReviewProps = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'evolveModes'> & InjectFace<Pick<ControlFace, 'review'>>
function ReviewTail({ turn, review, t }: ReviewProps) {
  const [item, setItem] = useState<EvolveModeReview | undefined>()
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

function EvolveModeReviewCommandView() { return null }

/**
 * The unified evolve-mode button owns Plan interaction, so it takes the
 * composer's otherwise separate plan-status seat without adding another chip.
 */
function UnifiedPlanSeat(_props: PropsRuntime<'conversation.input.plan'>) { return null }

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
  kind: 'evolve-mode-first-principles-injection',
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
      source: { kind: 'plugin', plugin: 'dsh-evolve-modes:first-principles' },
      provenance: { role: 'inject', label: 'dsh-evolve-modes:first-principles' },
      form: null,
    }
  },
  update: context => context.state,
  buildViewNode: trajectoryContextNode,
}

function learnedInstructionBlock(system: string | undefined): string | undefined {
  if (system === undefined) return undefined
  const start = system.indexOf('<dsh-evolve-modes-learned-instructions>')
  if (start < 0) return undefined
  const endMarker = '</dsh-evolve-modes-learned-instructions>'
  const end = system.indexOf(endMarker, start)
  if (end < 0) return undefined
  return system.slice(start, end + endMarker.length)
}

const learnedInstructionsTrajectoryDefinition: ConversationNodeDefinition<ContextMessageNode> = {
  kind: 'evolve-mode-learned-instructions-injection',
  target: 'trajectory',
  match: event => {
    if (event.type !== 'request/header') return null
    return learnedInstructionBlock(event.data.header.system) === undefined
      ? null
      : { id: String(event.seq), role: 'start' }
  },
  start: (_context, match) => {
    if (match.event.type !== 'request/header') throw new Error('learned-instructions Trajectory projection requires request/header')
    const text = learnedInstructionBlock(match.event.data.header.system)
    if (text === undefined) throw new Error('learned-instructions Trajectory projection matched without its marker block')
    return {
      kind: 'context',
      seq: match.event.seq,
      time: match.event.time,
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: 'dsh-evolve-modes:evolution' },
      provenance: { role: 'inject', label: 'dsh-evolve-modes:evolution' },
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
  evolutionSummary: 'Evolution',
  evolutionLabel: 'Self-evolution',
  evolutionOff: 'Off',
  evolutionPropose: 'Propose',
  settingsNav: 'Self-evolution mode',
  settingsTitle: 'Self-evolution mode',
  settingsIntro: 'Configure global self-evolution learning and review durable changes before they affect future requests.',
  settingsCurrent: 'Global settings',
  settingsBatchSize: 'Learning after completed replies',
  settingsBatchHint: 'A proposal run starts after this many completed parent replies.',
  settingsBatchInvalid: 'Batch size must be an integer from 1 to 100.',
  settingsProposalLimit: 'Pending proposal limit',
  settingsProposalLimitHint: 'New learning runs stop adding proposals when this limit is reached.',
  settingsProposalLimitInvalid: 'Pending proposal limit must be an integer from 1 to 1000.',
  settingsProposals: 'Pending proposals',
  settingsNoProposals: 'No pending proposals.',
  settingsApply: 'Apply',
  settingsDismiss: 'Dismiss',
  settingsRules: 'Approved learned rules',
  settingsAddRule: 'Add rule',
  settingsEditRule: 'Edit rule',
  settingsSaveRule: 'Save rule',
  settingsCancel: 'Cancel',
  settingsDelete: 'Delete',
  settingsDeleteConfirm: 'Delete this approved learned rule?',
  settingsCategory: 'Category',
  settingsContent: 'Instruction',
  settingsIdentity: 'Identity and background',
  settingsPreference: 'Preferences',
  settingsWorkRule: 'Work requirements',
  settingsNoRules: 'No approved learned rules.',
  settingsBackups: 'Backups',
  settingsNoBackups: 'No learned-rule backups.',
  settingsRestore: 'Restore',
  settingsRestoreConfirm: 'Restore this learned-rule backup?',
  settingsRuns: 'Learning runs',
  settingsNoRuns: 'No learning runs.',
  settingsLoading: 'Loading self-evolution settings…',
  settingsSaving: 'Saving…',
  settingsError: 'Self-evolution settings failed',
  settingsEvidence: 'Evidence',
  settingsInference: 'Inference',
  settingsExplicit: 'Explicit',
  settingsImplicit: 'Implicit',
  settingsAdd: 'Add',
  unavailable: 'unavailable',
  error: 'Mode update failed',
}
const zh: typeof en = {
  execute: '正常',
  plan: '计划',
  workingLabel: '工作模式',
  reasoningLabel: '思考策略',
  standard: '标准',
  firstPrinciples: '第一性原理',
  qualityLabel: '审查',
  qualityOff: '关',
  generalReview: '对抗性审查',
  acceptanceReview: '验收审查',
  evolutionSummary: '进化',
  evolutionLabel: '自进化',
  evolutionOff: '关',
  evolutionPropose: '开',
  settingsNav: '自进化模式',
  settingsTitle: '自进化模式',
  settingsIntro: '设置全局自进化学习规则，并在规则影响后续请求前审阅变更。',
  settingsCurrent: '全局设置',
  settingsBatchSize: '完成多少次回复后学习',
  settingsBatchHint: '达到这个数量的父 Agent 回复后，才启动一次提议分析。',
  settingsBatchInvalid: '学习批次必须是 1 到 100 的整数。',
  settingsProposalLimit: '待审阅提议上限',
  settingsProposalLimitHint: '达到上限后，新的学习运行不会继续添加提议。',
  settingsProposalLimitInvalid: '待审阅提议上限必须是 1 到 1000 的整数。',
  settingsProposals: '待审阅提议',
  settingsNoProposals: '没有待审阅提议。',
  settingsApply: '应用',
  settingsDismiss: '忽略',
  settingsRules: '已批准的学习规则',
  settingsAddRule: '添加规则',
  settingsEditRule: '编辑规则',
  settingsSaveRule: '保存规则',
  settingsCancel: '取消',
  settingsDelete: '删除',
  settingsDeleteConfirm: '删除这条已批准的学习规则？',
  settingsCategory: '分类',
  settingsContent: '规则内容',
  settingsIdentity: '身份与背景',
  settingsPreference: '偏好',
  settingsWorkRule: '工作要求',
  settingsNoRules: '没有已批准的学习规则。',
  settingsBackups: '备份',
  settingsNoBackups: '没有学习规则备份。',
  settingsRestore: '恢复',
  settingsRestoreConfirm: '恢复这份学习规则备份？',
  settingsRuns: '学习运行记录',
  settingsNoRuns: '没有学习运行记录。',
  settingsLoading: '正在加载自进化设置…',
  settingsSaving: '保存中…',
  settingsError: '自进化设置失败',
  settingsEvidence: '证据',
  settingsInference: '推断方式',
  settingsExplicit: '明确',
  settingsImplicit: '隐含',
  settingsAdd: '添加',
  unavailable: '不可用',
  error: '模式更新失败',
}
type EvolveModesKey = keyof typeof en
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { evolveModes: EvolveModesKey } }

function parseState(text: string): ModeState {
  const values = new Map(text.split('\n').map(line => {
    const [key, value] = line.split(': ', 2)
    return [key, value]
  }))
  const working = values.get('working')
  const reasoning = values.get('reasoning')
  const quality = values.get('quality')
  const evolution = values.get('evolution')
  const learningBatchSize = Number(values.get('learning-batch-size'))
  const pendingEvolutionTurns = Number(values.get('pending-evolution-turns'))
  if ((working !== 'execute' && working !== 'plan')
    || (reasoning !== 'standard' && reasoning !== 'first-principles')
    || (quality !== 'off' && quality !== 'general-review' && quality !== 'acceptance-review')
    || (evolution !== 'off' && evolution !== 'propose')
    || !Number.isSafeInteger(learningBatchSize) || learningBatchSize < 1 || learningBatchSize > 100
    || !Number.isSafeInteger(pendingEvolutionTurns) || pendingEvolutionTurns < 0) {
    throw new Error(`unexpected evolve-mode state: ${text}`)
  }
  return { working, reasoning, quality, evolution, learningBatchSize, pendingEvolutionTurns }
}

function parseReview(text: string): EvolveModeReview | undefined {
  if (text === '') return undefined
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null) throw new Error('evolve-mode review response is not an object')
  const review = value as Partial<EvolveModeReview>
  const { turn, profile, status, text: reviewText, createdAt } = review
  if (typeof turn !== 'number' || !Number.isSafeInteger(turn) || turn < 0
    || (profile !== 'general-review' && profile !== 'acceptance-review')
    || (status !== 'completed' && status !== 'unavailable')
    || typeof reviewText !== 'string' || typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new Error('evolve-mode review response is invalid')
  }
  return { turn, profile, status, text: reviewText, createdAt }
}

interface EvolutionRemoteFace {
  dashboard(): Promise<EvolutionDashboard>
  config(request: EvolutionConfigRequest): Promise<EvolutionDashboard>
  proposal(request: EvolutionProposalRequest): Promise<EvolutionDashboard>
  setting(request: EvolutionSettingRequest): Promise<EvolutionDashboard>
  restore(request: EvolutionRestoreRequest): Promise<EvolutionDashboard>
}

interface EvolutionSettingsInjected {
  evolution: EvolutionRemoteFace
}

type SettingsProps = PropsRuntime<'settings.section'> & PropsLocale<'evolveModes'> & InjectFace<EvolutionSettingsInjected>

const settingsSectionStyle: CSSProperties = { boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760, padding: '4px 0 32px' }
const settingsBandStyle: CSSProperties = { borderTop: '1px solid var(--dsw-alias-line-light)', display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16 }
const settingsHeadingStyle: CSSProperties = { color: 'var(--dsw-alias-label-primary)', fontSize: 16, fontWeight: 600, lineHeight: '22px', margin: 0 }
const settingsTextStyle: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px', margin: 0 }
const settingsGridStyle: CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }
const settingsFieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }
const settingsLabelStyle: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, fontWeight: 500, lineHeight: '16px' }
const settingsControlStyle: CSSProperties = { background: 'var(--dsw-alias-bg-module-platform)', border: '1px solid var(--dsw-alias-line-light)', borderRadius: 6, boxSizing: 'border-box', color: 'var(--dsw-alias-label-primary)', fontSize: 12, minHeight: 32, padding: '6px 8px', width: '100%' }
const settingsListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 }
const settingsItemStyle: CSSProperties = { background: 'var(--dsw-alias-bg-module-platform)', border: '1px solid var(--dsw-alias-line-light)', borderRadius: 6, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }
const settingsMetaStyle: CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, lineHeight: '16px' }
const settingsActionsStyle: CSSProperties = { alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }

function categoryLabel(category: EvolutionCategory, t: SettingsProps['t']): string {
  if (category === 'identity') return t('settingsIdentity')
  if (category === 'preference') return t('settingsPreference')
  return t('settingsWorkRule')
}

function unwrapEvolution<T>(result: { ok: true; value: T } | { ok: false; error: { message: string; code: string } }): T {
  if (!result.ok) throw new Error(`${result.error.message} (${result.error.code})`)
  return result.value
}

interface RuleDraft {
  readonly id: string | null
  readonly category: EvolutionCategory
  readonly content: string
}

function EvolveModesSettings({ close, evolution, t }: SettingsProps) {
  const [dashboard, setDashboard] = useState<EvolutionDashboard>()
  const [batchText, setBatchText] = useState('3')
  const [proposalLimitText, setProposalLimitText] = useState('100')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<RuleDraft>()

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(undefined)
    void evolution.dashboard().then(value => {
      if (!live) return
      setDashboard(value)
      setBatchText(String(value.config.learningBatchSize))
      setProposalLimitText(String(value.config.maxPendingProposals))
    }).catch(reason => {
      if (live) setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [evolution])

  const mutate = (operation: () => Promise<EvolutionDashboard>): void => {
    setSaving(true)
    setError(undefined)
    void operation().then(value => { setDashboard(value); setDraft(undefined) }).catch(reason => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setSaving(false) })
  }
  const updateConfig = (config: EvolutionConfig): void => {
    setSaving(true)
    setError(undefined)
    void evolution.config({ config }).then(value => {
      setDashboard(value)
      setBatchText(String(value.config.learningBatchSize))
      setProposalLimitText(String(value.config.maxPendingProposals))
    }).catch(reason => { setError(reason instanceof Error ? reason.message : String(reason)) }).finally(() => { setSaving(false) })
  }

  const proposals = (dashboard?.proposals ?? []).filter(item => item.status === 'pending')
  const settings = dashboard?.settings ?? []
  const backups = dashboard?.backups ?? []

  const saveConfig = (): void => {
    const value = Number(batchText)
    if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
      setError(t('settingsBatchInvalid'))
      return
    }
    const maxPendingProposals = Number(proposalLimitText)
    if (!Number.isSafeInteger(maxPendingProposals) || maxPendingProposals < 1 || maxPendingProposals > 1000) {
      setError(t('settingsProposalLimitInvalid'))
      return
    }
    updateConfig({ learningBatchSize: value, maxPendingProposals })
  }

  return <div style={settingsSectionStyle}>
    <div>
      <h2 style={settingsHeadingStyle}>{t('settingsTitle')}</h2>
      <p style={{ ...settingsTextStyle, marginTop: 6 }}>{t('settingsIntro')}</p>
    </div>
    {error === undefined ? null : <p role="alert" style={{ ...settingsTextStyle, color: 'var(--dsw-alias-label-danger)' }}>{error}</p>}
    <section style={settingsBandStyle}>
      <h3 style={settingsHeadingStyle}>{t('settingsCurrent')}</h3>
      <div style={settingsGridStyle}>
        <label style={settingsFieldStyle}><span style={settingsLabelStyle}>{t('settingsBatchSize')}</span><input style={settingsControlStyle} type="number" min={1} max={100} value={batchText} disabled={saving || loading} onChange={event => setBatchText(event.target.value)} onBlur={saveConfig} /></label>
        <label style={settingsFieldStyle}><span style={settingsLabelStyle}>{t('settingsProposalLimit')}</span><input style={settingsControlStyle} type="number" min={1} max={1000} value={proposalLimitText} disabled={saving || loading} onChange={event => setProposalLimitText(event.target.value)} onBlur={saveConfig} /></label>
      </div>
      <p style={settingsTextStyle}>{t('settingsBatchHint')}</p>
      <p style={settingsTextStyle}>{t('settingsProposalLimitHint')}</p>
    </section>
    {loading ? <p style={settingsTextStyle}>{t('settingsLoading')}</p> : <>
      <section style={settingsBandStyle}><h3 style={settingsHeadingStyle}>{t('settingsProposals')}</h3>{proposals.length === 0 ? <p style={settingsTextStyle}>{t('settingsNoProposals')}</p> : <div style={settingsListStyle}>{proposals.map(proposal => <ProposalRow key={proposal.id} proposal={proposal} t={t} saving={saving} onApply={() => mutate(() => evolution.proposal({ id: proposal.id, action: 'apply' }))} onDismiss={() => mutate(() => evolution.proposal({ id: proposal.id, action: 'dismiss' }))} />)}</div>}</section>
      <section style={settingsBandStyle}><div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}><h3 style={settingsHeadingStyle}>{t('settingsRules')}</h3><Button size="sm" variant="outline" icon={<IconPlusOutline16 size={14} />} disabled={saving} onClick={() => setDraft({ id: null, category: 'work_rule', content: '' })}>{t('settingsAddRule')}</Button></div>{draft === undefined ? null : <RuleEditor draft={draft} t={t} saving={saving} onCancel={() => setDraft(undefined)} onSave={(mutation) => mutate(() => evolution.setting({ mutation }))} />}{settings.length === 0 ? <p style={settingsTextStyle}>{t('settingsNoRules')}</p> : <div style={settingsListStyle}>{settings.map(setting => <RuleRow key={setting.id} setting={setting} t={t} saving={saving} onEdit={() => setDraft({ id: setting.id, category: setting.category, content: setting.content })} onDelete={() => { if (window.confirm(t('settingsDeleteConfirm'))) mutate(() => evolution.setting({ mutation: { action: 'delete', id: setting.id } })) }} />)}</div>}</section>
      <section style={settingsBandStyle}><h3 style={settingsHeadingStyle}>{t('settingsBackups')}</h3>{backups.length === 0 ? <p style={settingsTextStyle}>{t('settingsNoBackups')}</p> : <div style={settingsListStyle}>{backups.map(backup => <div key={backup.id} style={settingsItemStyle}><span style={settingsMetaStyle}>{backup.summary} · {new Date(backup.createdAt).toLocaleString()}</span><div style={settingsActionsStyle}><Button size="sm" variant="outline" icon={<IconRefreshOutline14 />} disabled={saving} onClick={() => { if (window.confirm(t('settingsRestoreConfirm'))) mutate(() => evolution.restore({ id: backup.id })) }}>{t('settingsRestore')}</Button></div></div>)}</div>}</section>
      <section style={settingsBandStyle}><h3 style={settingsHeadingStyle}>{t('settingsRuns')}</h3>{(dashboard?.runs ?? []).length === 0 ? <p style={settingsTextStyle}>{t('settingsNoRuns')}</p> : <div style={settingsListStyle}>{(dashboard?.runs ?? []).map(run => <div key={run.id} style={settingsItemStyle}><span style={settingsMetaStyle}>{run.status} · {run.turns.join(', ')} · {new Date(run.createdAt).toLocaleString()}</span>{run.error === null ? null : <span style={{ ...settingsMetaStyle, color: 'var(--dsw-alias-label-danger)' }}>{run.error}</span>}</div>)}</div>}</section>
    </>}
    <div style={{ ...settingsActionsStyle, justifyContent: 'flex-end' }}><Button size="sm" variant="outline" onClick={close}>{t('settingsCancel')}</Button></div>
  </div>
}

function ProposalRow({ proposal, t, saving, onApply, onDismiss }: { proposal: EvolutionDashboard['proposals'][number]; t: SettingsProps['t']; saving: boolean; onApply: () => void; onDismiss: () => void }) {
  return <div style={settingsItemStyle}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><strong style={settingsMetaStyle}>{proposal.action}</strong>{proposal.category === null ? null : <span style={settingsMetaStyle}>{categoryLabel(proposal.category, t)}</span>}</div>{proposal.content === null ? <span style={settingsTextStyle}>{proposal.deleteReason ?? ''}</span> : <span style={settingsTextStyle}>{proposal.content}</span>}<span style={settingsMetaStyle}>{t('settingsInference')}: {proposal.inference === 'explicit' ? t('settingsExplicit') : t('settingsImplicit')}</span><details><summary style={{ cursor: 'pointer', fontSize: 11 }}>{t('settingsEvidence')} ({proposal.evidence.length})</summary><div style={{ ...settingsMetaStyle, whiteSpace: 'pre-wrap' }}>{proposal.evidence.map(item => `${item.sessionId}#${item.turn}: ${item.excerpt}`).join('\n')}</div></details><div style={settingsActionsStyle}><Button size="sm" variant="outline" icon={<IconCheckOutline16 size={14} />} disabled={saving} onClick={onApply}>{t('settingsApply')}</Button><Button size="sm" variant="ghost" icon={<IconCloseOutline16 size={14} />} disabled={saving} onClick={onDismiss}>{t('settingsDismiss')}</Button></div></div>
}

function RuleEditor({ draft, t, saving, onCancel, onSave }: { draft: RuleDraft; t: SettingsProps['t']; saving: boolean; onCancel: () => void; onSave: (mutation: EvolutionSettingRequest['mutation']) => void }) {
  const [category, setCategory] = useState(draft.category)
  const [content, setContent] = useState(draft.content)
  const valid = content.trim() !== ''
  return <div style={settingsItemStyle}><label style={settingsFieldStyle}><span style={settingsLabelStyle}>{t('settingsCategory')}</span><select style={settingsControlStyle} value={category} disabled={saving} onChange={event => setCategory(event.target.value as EvolutionCategory)}><option value="identity">{t('settingsIdentity')}</option><option value="preference">{t('settingsPreference')}</option><option value="work_rule">{t('settingsWorkRule')}</option></select></label><label style={settingsFieldStyle}><span style={settingsLabelStyle}>{t('settingsContent')}</span><textarea style={{ ...settingsControlStyle, minHeight: 84, resize: 'vertical' }} value={content} disabled={saving} onChange={event => setContent(event.target.value)} /></label><div style={settingsActionsStyle}><Button size="sm" variant="outline" icon={<IconCheckOutline16 size={14} />} disabled={!valid || saving} onClick={() => onSave(draft.id === null ? { action: 'add', category, content: content.trim() } : { action: 'update', id: draft.id, category, content: content.trim() })}>{t('settingsSaveRule')}</Button><Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>{t('settingsCancel')}</Button></div></div>
}

function RuleRow({ setting, t, saving, onEdit, onDelete }: { setting: EvolutionDashboard['settings'][number]; t: SettingsProps['t']; saving: boolean; onEdit: () => void; onDelete: () => void }) {
  return <div style={settingsItemStyle}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><span style={settingsMetaStyle}>{categoryLabel(setting.category, t)}</span></div><span style={settingsTextStyle}>{setting.content}</span><div style={settingsActionsStyle}><Button size="sm" variant="ghost" icon={<IconEditOutline16 size={14} />} disabled={saving} onClick={onEdit}>{t('settingsEditRule')}</Button><Button size="sm" variant="ghost" icon={<IconTrashOutline16 size={14} />} disabled={saving} onClick={onDelete}>{t('settingsDelete')}</Button></div></div>
}

/** Mount composable evolve-mode controls, persisted review history, and Trajectory evidence. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('evolveModes', { en, zh }), 'dsh-evolve-modes: locale')
  ctx.effect(() => ctx.remote.$mount(evolveModesRemote), 'dsh-evolve-modes: evolution Remote')
  ctx.conversationEvents.register(firstPrinciplesTrajectoryDefinition)
  ctx.conversationEvents.register(learnedInstructionsTrajectoryDefinition)
  const execute = async (sessionId: string, line: string): Promise<string> => {
    const response = await ctx.remote.commands.execute(sessionId as never, line)
    if (!response.ok) throw new Error(`${response.error.message} (${response.error.code})`)
    if (response.value === undefined) throw new Error(`unknown command: ${line}`)
    if (response.value.result.kind === 'error') throw new Error(response.value.result.text)
    return response.value.result.text ?? ''
  }
  const faceFor = (sessionId: string): ControlFace => ({
    getState: async () => parseState(await execute(sessionId, '/evolve-mode')),
    setWorking: async value => parseState(await execute(sessionId, `/evolve-mode working ${value}`)),
    setReasoning: async value => parseState(await execute(sessionId, `/evolve-mode reasoning ${value}`)),
    setQuality: async value => parseState(await execute(sessionId, `/evolve-mode quality ${value}`)),
    setEvolution: async value => parseState(await execute(sessionId, `/evolve-mode evolution ${value}`)),
    setBatchSize: async value => parseState(await execute(sessionId, `/evolve-mode evolution batch-size ${value}`)),
    review: async turn => parseReview(await execute(sessionId, `/evolve-mode-review ${turn}`)),
  })
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'evolve-modes', locale: 'evolveModes', inject: faceFor }, EvolveModeControl))
  ctx.slots.inject('conversation.input.plan', () => ctx.slots.register({ name: 'conversation.input.plan', priority: -1 }, UnifiedPlanSeat))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', select: () => true, locale: 'evolveModes', inject: sessionId => ({ review: faceFor(sessionId).review }) }, ReviewTail))
  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({ name: 'conversation.chat.commandview', key: 'evolve-mode-review' }, EvolveModeReviewCommandView))
  ctx.inject(['remote.evolveModes'], scope => {
    const evolution: EvolutionRemoteFace = {
      dashboard: async () => unwrapEvolution(await scope.remote.evolveModes.dashboard({})),
      config: async request => unwrapEvolution(await scope.remote.evolveModes.config(request)),
      proposal: async request => unwrapEvolution(await scope.remote.evolveModes.proposal(request)),
      setting: async request => unwrapEvolution(await scope.remote.evolveModes.setting(request)),
      restore: async request => unwrapEvolution(await scope.remote.evolveModes.restore(request)),
    }
    scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section',
      id: 'evolve-modes',
      order: 12,
      label: () => scope.locale.bind('evolveModes')('settingsNav'),
      locale: 'evolveModes',
      inject: (): EvolutionSettingsInjected => ({ evolution }),
    }, EvolveModesSettings))
  })
}
