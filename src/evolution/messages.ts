import type { Agent } from '@deepseek-ai/dsh-agent'
import type { EvolutionLearningMessage } from './prompt.ts'

const LEARNING_MESSAGE_LIMIT = 100
const LEARNING_ASSISTANT_CHARACTER_LIMIT = 2000
const ASSISTANT_HEAD_CHARACTER_LIMIT = LEARNING_ASSISTANT_CHARACTER_LIMIT / 2
const ASSISTANT_TAIL_CHARACTER_LIMIT = LEARNING_ASSISTANT_CHARACTER_LIMIT - ASSISTANT_HEAD_CHARACTER_LIMIT

function textContent(content: readonly { type: string; text?: string }[]): string {
  return content.flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n')
}

function truncateAssistantMessage(text: string): string {
  if (text.length <= LEARNING_ASSISTANT_CHARACTER_LIMIT) return text
  return `${text.slice(0, ASSISTANT_HEAD_CHARACTER_LIMIT)}...${text.slice(-ASSISTANT_TAIL_CHARACTER_LIMIT)}`
}

/** Keep full user messages and each selected turn's final visible assistant message. */
export function evolutionMessages(agent: Agent, turns: readonly number[]): EvolutionLearningMessage[] {
  const selected = new Set(turns)
  const userMessages: EvolutionLearningMessage[] = []
  const assistantByTurn = new Map<number, EvolutionLearningMessage>()
  let currentTurn: number | undefined
  for (const event of agent.session.events) {
    if (event.type === 'turn/start') {
      currentTurn = event.data.turn
      continue
    }
    if (currentTurn === undefined || !selected.has(currentTurn)) continue
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const text = textContent(event.data.content).trim()
      if (text !== '') {
        userMessages.push({
          sessionId: String(agent.session.id),
          turn: currentTurn,
          eventSeq: event.seq,
          role: 'user',
          text,
        })
      }
      continue
    }
    if (event.type === 'assistant/message') {
      const text = textContent(event.data.message.content).trim()
      if (text !== '') {
        assistantByTurn.set(currentTurn, {
          sessionId: String(agent.session.id),
          turn: currentTurn,
          eventSeq: event.seq,
          role: 'assistant',
          text: truncateAssistantMessage(text),
        })
      }
    }
  }
  const recent = [...userMessages, ...assistantByTurn.values()]
    .sort((left, right) => left.eventSeq - right.eventSeq)
    .slice(-LEARNING_MESSAGE_LIMIT)
  return recent[0]?.role === 'assistant' ? recent.slice(1) : recent
}
