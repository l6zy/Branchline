import { normalizeApplicationError, type ApplicationErrorData } from '../repository'
import { resources } from './resources'
import type { AppTranslator } from './useAppTranslation'

type LeafKeys<T> = { [K in keyof T & string]: T[K] extends string ? K : T[K] extends object ? `${K}.${LeafKeys<T[K]>}` : never }[keyof T & string]
type LogicalKey<K extends string> = K extends `${infer Base}_${'zero' | 'one' | 'two' | 'few' | 'many' | 'other'}` ? Base : K
export type TranslationKey = { [N in keyof typeof resources['zh-CN']]: `${N}:${LogicalKey<LeafKeys<typeof resources['zh-CN'][N]>>}` }[keyof typeof resources['zh-CN']]
export type MessageParam = string | number | boolean | UiMessage
export type UiMessage =
  | { kind: 'translated'; key: TranslationKey; params?: Record<string, MessageParam> }
  | { kind: 'raw'; text: string }
  | { kind: 'error'; error: ApplicationErrorData }
export type MessageContent = UiMessage | string
export function message(key: TranslationKey, params?: Record<string, MessageParam>): UiMessage { return { kind: 'translated', key, params } }
export function rawMessage(text: string): UiMessage { return { kind: 'raw', text } }
export function errorMessage(error: unknown): UiMessage { return { kind: 'error', error: normalizeApplicationError(error) } }

function errorText(error: ApplicationErrorData, t: AppTranslator): string {
  const lookup = (code: string) => code.split('.').reduce<unknown>((item, key) => item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined, resources['zh-CN'].errors)
  const value = lookup(error.code) ?? lookup(error.code + '_other')
  // Dynamic error codes cross a validated transport boundary; other UI keys stay typed.
  const translate = t as (key: string, options?: Record<string, unknown>) => string
  const heading = error.code === 'native' && error.details ? '' : typeof value === 'string'
    ? translate('errors:' + error.code, error.params) : t('errors:unknown')
  return [heading, error.details, ...error.causes?.map(cause => errorText(cause, t)) ?? []].filter(Boolean).join('\n')
}
export function renderMessage(value: MessageContent | null | undefined, t: AppTranslator): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (value.kind === 'raw') return value.text
  if (value.kind === 'error') return errorText(value.error, t)
  const params = Object.fromEntries(Object.entries(value.params ?? {}).map(([key, item]) => [key, typeof item === 'object' ? renderMessage(item, t) : item]))
  return (t as (key: string, options?: Record<string, unknown>) => string)(value.key, params)
}
