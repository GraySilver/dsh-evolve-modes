import { createElement as h, useEffect, useState } from 'react'
import { IconChevronDownOutline14, IconThinkOutline14, MarkdownText, Menu } from '@deepseek-ai/dsh-client-ui-primitives'

const en = { normal: 'Normal', firstPrinciples: 'First principles', review: 'Adversarial review' }
const zh = { normal: '普通', firstPrinciples: '第一性原理', review: '对抗式审查' }
const modes = [{ id: 'normal', key: 'normal' }, { id: 'first-principles', key: 'firstPrinciples' }, { id: 'adversarial-review', key: 'review' }]
function Control({ getMode, setMode, t }) {
  const [mode, setCurrent] = useState('normal'); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false)
  useEffect(() => { void getMode().then(setCurrent).catch(() => {}) }, [getMode])
  const selected = modes.find(item => item.id === mode) ?? modes[0]
  return h(Menu, { open, onClose: () => setOpen(false), selectedId: mode, side: 'top', items: modes.map(item => ({ id: item.id, label: t(item.key), icon: item.id === 'normal' ? undefined : h(IconThinkOutline14) })), onSelect: id => { if (!modes.some(item => item.id === id)) return; setOpen(false); setBusy(true); void setMode(id).then(() => setCurrent(id)).finally(() => setBusy(false)) }, anchor: h('button', { type: 'button', disabled: busy, style: { height: 28, border: 0, borderRadius: 6, background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }, onClick: () => setOpen(value => !value) }, t(selected.key), h(IconChevronDownOutline14)) })
}
function Reviews({ reviews, t }) {
  const [text, setText] = useState(); useEffect(() => { let live = true; void reviews().then(value => { if (live) setText(value) }).catch(() => { if (live) setText('') }); return () => { live = false } }, [reviews])
  if (!text) return null
  return h('details', { style: { width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 6, background: 'var(--dsw-alias-bg-module-platform)', fontSize: 13, lineHeight: '20px' } }, h('summary', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } }, h(IconThinkOutline14), t('review')), h(MarkdownText, { text }))
}
export const inject = ['slots', 'locale', 'remote', 'remote.commands']
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register('taskModes', { en, zh }), 'dsh-task-modes: locale')
  const execute = async (sessionId, line) => { const response = await ctx.remote.commands.execute(sessionId, line); if (!response.ok) throw new Error(response.error.message); return response.value?.result.text ?? '' }
  const face = sessionId => ({ getMode: async () => { const text = await execute(sessionId, '/task-mode'); const mode = text.slice('task mode: '.length); return modes.some(item => item.id === mode) ? mode : 'normal' }, setMode: mode => execute(sessionId, `/task-mode ${mode}`), reviews: () => execute(sessionId, '/task-mode reviews') })
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'task-modes', locale: 'taskModes', inject: face }, Control))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'task-mode-reviews', order: 25, locale: 'taskModes', inject: sessionId => ({ reviews: face(sessionId).reviews }) }, Reviews))
}
