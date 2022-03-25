#!/usr/bin/env node

import _debug from 'debug'
import { program } from 'commander'
import { description } from '../../package.json'
import { lintFiles } from '..'
import version from './version'
import log from '../utils/log'
import isGitHooks from '../utils/is-git-hooks'
import type { ElintOptions } from '../elint'
import { report } from '../utils/report'
import { commitlint } from './commitlint'

const debug = _debug('elint:cli')

debug('process.argv: %o', process.argv)

program
  .usage('[command] [options]')
  .description(description)
  .storeOptionsAsProperties(true)

/**
 * 输出 version
 */
program
  .option('-v, --version', 'output the version number')
  .action(async () => {
    await version({
      plugins: []
    })
    process.exit(0)
  })

/**
 * 执行 lint
 * 不指定 type，执行除了 commitlint 之外的全部
 */
program
  .command('lint [type] [files...]')
  .alias('l')
  .description('run lint, type: file, commit')
  .option('-f, --fix', 'Automatically fix problems')
  .option('-s, --style', 'Lint code style')
  .option('--no-ignore', 'Disable elint ignore patterns')
  .action(async (type, files, options) => {
    debug('run lint...')

    if (!files || !type) {
      return
    }

    if (type === 'commit') {
      commitlint()
      return
    }

    const isGit = await isGitHooks()

    const elintOptions: ElintOptions = {
      fix: options.fix,
      style: options.style,
      noIgnore: options.noIgnore,
      git: isGit,
      plugins: []
    }

    const results = await lintFiles([type, ...files], elintOptions)

    console.log(report(results))

    const success = !results.some((result) => !result.success)

    process.exit(success ? 0 : 1)
  })

/**
 * install & uninstall hooks
 */
program
  .command('hooks [action]')
  .alias('h')
  .description('install & uninstall hooks')
  .action((action) => {
    debug(`run ${action} hooks...`)
    // runHooks(action)
  })

/**
 * 未知 command
 */
program.on('command:*', function () {
  const command = program.args.join(' ')
  const message = [
    `Invalid command: ${command}`,
    'See --help for a list of available commands.'
  ]

  log.error(...message)
  process.exit(1)
})

/**
 * 输出 help
 */
program.on('--help', function () {
  console.log('')
  console.log('  Examples:')
  console.log('')
  console.log('    lint all js and css')
  console.log('    $ elint lint "**/*.js" "**/*.css"')
  console.log('')
  console.log('    install git hooks')
  console.log('    $ elint hooks install')
  console.log('')
})

if (!process.argv.slice(2).length) {
  program.outputHelp()
  process.exit(0)
}

program.parse(process.argv)
