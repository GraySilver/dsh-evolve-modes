import { useEffect, useState, type CSSProperties } from 'react'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { IconCheckOutline14, IconChevronDownOutline14, IconThinkOutline14, MarkdownText, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { TaskMode } from '../types.ts'

type Mode = TaskMode
interface ControlFace { getMode(): Promise<Mode>; setMode(mode: Mode): Promise<void>; review(turn: number): Promise<string> }
type ControlProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'taskModes'> & InjectFace<ControlFace>
const modes: readonly { id: Mode; key: keyof typeof en }[] = [{ id: 'normal', key: 'normal' }, { id: 'first-principles', key: 'firstPrinciples' }, { id: 'adversarial-review', key: 'review' }]

/** Required browser services for the task-mode controls. */
export const inject = ['slots', 'locale', 'remote', 'remote.commands']

const triggerStyle: CSSProperties = { alignItems: 'center', background: 'transparent', border: 0, borderRadius: 6, color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', display: 'inline-flex', fontSize: 13, gap: 4, height: 28, padding: '0 6px 0 8px' }
const reviewStyle: CSSProperties = { background: 'var(--dsw-alias-bg-module-platform)', borderRadius: 6, boxSizing: 'border-box', color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: '18px', padding: '8px 12px', width: '100%' }
const reviewSummaryStyle: CSSProperties = { alignItems: 'center', cursor: 'pointer', display: 'flex', fontSize: 12, fontWeight: 500, gap: 6 }
const reviewBodyStyle: CSSProperties = { height: 240, overflowY: 'auto', paddingTop: 8 }
const reviewMarkdownStyle: CSSProperties & Record<`--${string}`, string> = {
  '--dsw-font-markdown-base': '12px/18px var(--dsw-font-family)',
  '--dsw-font-markdown-base-strong': '600 12px/18px var(--dsw-font-family)',
  '--dsw-font-markdown-h1': '700 17px/24px var(--dsw-font-family)',
  '--dsw-font-markdown-h2': '700 16px/22px var(--dsw-font-family)',
  '--dsw-font-markdown-h3': '700 14px/20px var(--dsw-font-family)',
  '--dsw-font-markdown-h4': '600 13px/18px var(--dsw-font-family)',
}

function modeIcon(mode: Mode) { return mode === 'normal' ? <IconCheckOutline14 /> : <IconThinkOutline14 /> }

function TaskModeControl({ getMode, setMode, t }: ControlProps) {
  const [mode, setCurrent] = useState<Mode>('normal'); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | undefined>()
  useEffect(() => { void getMode().then(setCurrent).catch(() => {}) }, [getMode])
  const selected = modes.find(item => item.id === mode) ?? modes[0]
  const items: MenuEntry[] = modes.map(item => ({ id: item.id, label: t(item.key), icon: modeIcon(item.id) }))
  return <><Menu open={open} onClose={() => { setOpen(false) }} items={items} selectedId={mode} onSelect={(id) => {
    if (id !== 'normal' && id !== 'first-principles' && id !== 'adversarial-review') return
    setOpen(false); setBusy(true); setError(undefined)
    void setMode(id).then(() => setCurrent(id)).catch(reason => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setBusy(false))
  }} side="top" anchor={<button type="button" style={triggerStyle} disabled={busy} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>{modeIcon(selected.id)}<span>{t(selected.key)}</span><IconChevronDownOutline14 /></button>} />
  {error === undefined ? null : <span role="alert" style={{ color: 'var(--dsw-alias-label-danger)', fontSize: 12 }}>{error}</span>}</>
}

type ReviewProps = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'taskModes'> & InjectFace<Pick<ControlFace, 'review'>>
function ReviewTail({ turn, review, t }: ReviewProps) {
  const [text, setText] = useState<string | undefined>(undefined)
  useEffect(() => { let live = true; void review(turn.turn).then(value => { if (live) setText(value) }).catch(() => { if (live) setText('') }); return () => { live = false } }, [review, turn.turn])
  if (text === undefined || text === '') return null
  return <details style={reviewStyle}><summary style={reviewSummaryStyle}><IconThinkOutline14 /> {t('review')}</summary><div style={reviewBodyStyle}><div style={reviewMarkdownStyle}><MarkdownText text={text} /></div></div></details>
}

function TaskModeReviewCommandView() { return null }

const en = { normal: 'Normal mode', firstPrinciples: 'First principles', review: 'Adversarial review' }
const zh = { normal: '正常模式', firstPrinciples: '第一性原理', review: '对抗式审查' }
type TaskModesKey = keyof typeof en
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { taskModes: TaskModesKey } }

/** Mount the task-mode selector and persisted review history for Web profiles. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('taskModes', { en, zh }), 'dsh-task-modes: locale')
  const execute = async (sessionId: string, line: string): Promise<string> => {
    const response = await ctx.remote.commands.execute(sessionId as never, line)
    if (!response.ok) throw new Error(`${response.error.message} (${response.error.code})`)
    if (response.value === undefined) throw new Error(`unknown command: ${line}`)
    if (response.value.result.kind === 'error') throw new Error(response.value.result.text)
    return response.value.result.text
  }
  const faceFor = (sessionId: string): ControlFace => ({
    getMode: async () => { const text = await execute(sessionId, '/task-mode'); const mode = text.slice('task mode: '.length); return mode === 'first-principles' || mode === 'adversarial-review' ? mode : 'normal' },
    setMode: async mode => { await execute(sessionId, `/task-mode ${mode}`) },
    review: async turn => await execute(sessionId, `/task-mode-review ${turn}`),
  })
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'task-modes', locale: 'taskModes', inject: faceFor }, TaskModeControl))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', select: () => true, locale: 'taskModes', inject: sessionId => ({ review: faceFor(sessionId).review }) }, ReviewTail))
  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({ name: 'conversation.chat.commandview', key: 'task-mode-review' }, TaskModeReviewCommandView))
}
