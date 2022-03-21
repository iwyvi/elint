import _debug from 'debug'
import isGitHooks from '../utils/is-git-hooks'
import { defaultIgnore } from '../config'
import local from './local'
import stage from './stage'
import type { ElintOptions } from '../elint-next'

const debug = _debug('elint:walker')

export type FilePath =
  | string
  | {
      fileName: string
      fileContent: string
    }

export interface WalkerOptions extends ElintOptions {
  /**
   * 是否禁用 ignore 规则
   *
   * @default `false`
   */
  noIgnore?: boolean
}

/**
 * 文件遍历
 *
 * @param patterns 匹配模式
 * @param options 配置
 * @returns file tree
 */
async function walker(
  patterns: string[],
  options: WalkerOptions = {}
): Promise<FilePath[]> {
  debug(`input glob patterns: ${patterns}`)
  debug('input options: %o', options)

  if (!patterns || (Array.isArray(patterns) && !patterns.length)) {
    return Promise.resolve([])
  }

  const isGit = await isGitHooks()

  debug(`run in git hooks: ${isGit}`)

  /**
   * 根据运行环境执行不同的文件遍历策略
   */
  let fileList: FilePath[]
  let ignorePatterns: string[] = []
  const { noIgnore = false } = options

  if (!noIgnore) {
    debug('ignore rules: %j', defaultIgnore)
    ignorePatterns = defaultIgnore
  }

  if (isGit) {
    fileList = await stage(patterns, ignorePatterns)
  } else {
    fileList = await local(patterns, ignorePatterns)
  }

  debug('fileList: %o', fileList)

  return fileList
}

export default walker
