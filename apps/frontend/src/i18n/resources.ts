import zhcommon from './locales/zh-CN/common.json'
import zhrepository from './locales/zh-CN/repository.json'
import zhhistory from './locales/zh-CN/history.json'
import zhstaging from './locales/zh-CN/staging.json'
import zhdiff from './locales/zh-CN/diff.json'
import zhoperations from './locales/zh-CN/operations.json'
import zhsettings from './locales/zh-CN/settings.json'
import zherrors from './locales/zh-CN/errors.json'
import encommon from './locales/en-US/common.json'
import enrepository from './locales/en-US/repository.json'
import enhistory from './locales/en-US/history.json'
import enstaging from './locales/en-US/staging.json'
import endiff from './locales/en-US/diff.json'
import enoperations from './locales/en-US/operations.json'
import ensettings from './locales/en-US/settings.json'
import enerrors from './locales/en-US/errors.json'
export const resources = {
  'zh-CN': { common: zhcommon, repository: zhrepository, history: zhhistory, staging: zhstaging, diff: zhdiff, operations: zhoperations, settings: zhsettings, errors: zherrors },
  'en-US': { common: encommon, repository: enrepository, history: enhistory, staging: enstaging, diff: endiff, operations: enoperations, settings: ensettings, errors: enerrors },
} as const
