import { useTranslation } from 'react-i18next'
export const namespaces = ['common', 'repository', 'history', 'staging', 'diff', 'operations', 'settings', 'errors'] as const
export function useAppTranslation() { return useTranslation(namespaces) }
export type AppTranslator = ReturnType<typeof useAppTranslation>['t']
