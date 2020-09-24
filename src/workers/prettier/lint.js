'use strict'

const prettier = require('prettier')
const fs = require('fs-extra')
const { lintContents: eslintLintContents } = require('../eslint/lint')
const { lintContents: stylelintLintContents } = require('../stylelint/lint')

const { errors, createIgnorer } = prettier.__internal

// 使用 prettier 的方法获取当前文件的格式化配置
const getOptionsForFile = (filename) => {
  const options = {
    ...prettier.resolveConfig(filename, { editorconfig: false }),
    filepath: filename
  }
  return options
}

let ignorer

const getIgnorer = () => {
  if (!ignorer) {
    ignorer = createIgnorer.sync('.prettierignore')
  }
  return ignorer
}

// prettier cli 的错误处理
const handlePrettierError = (filename, error) => {
  const isParseError = Boolean(error && error.loc)
  const isValidationError = /^Invalid \S+ value\./.test(error && error.message)

  const message = {
    level: 'error',
    text: '',
    filename
  }

  if (isParseError) {
    // `invalid.js: SyntaxError: Unexpected token (1:1)`.
    message.text = String(error)
  } else if (isValidationError || error instanceof errors.ConfigError) {
    // `Invalid printWidth value. Expected an integer, but received 0.5.`
    message.text = error.message
    // If validation fails for one file, it will fail for all of them.
    process.exit(1)
  } else if (error instanceof errors.DebugError) {
    // `invalid.js: Some debug error message`
    message.text = error.message
  } else {
    // `invalid.js: Error: Some unexpected error\n[stack trace]`
    /* istanbul ignore next */
    message.text = error.stack || error
  }

  return message
}

const linters = {
  es: eslintLintContents,
  style: stylelintLintContents
}

const lintFiles = async (files, type, fix = false) => {
  if (!files.length) {
    return {
      linterSuccess: true,
      prettierSuccess: true,
      results: [],
      messages: []
    }
  }

  let linterSuccess = true
  let prettierSuccess = true
  const prettierMessages = []
  const results = []

  const tasks = []

  files.forEach((filename) => {
    tasks.push(
      (async () => {
        let input
        try {
          input = fs.readFileSync(filename, 'utf-8')
        } catch {
          prettierSuccess = false
          prettierMessages.push({
            level: 'error',
            text: '文件读取错误',
            filename
          })
          return
        }

        const lintResult = await lintContents(
          [
            {
              fileName: filename,
              fileContent: input
            }
          ],
          type,
          fix
        )

        linterSuccess = linterSuccess && lintResult.linterSuccess
        prettierSuccess = prettierSuccess && lintResult.prettierSuccess
        prettierMessages.push(...lintResult.messages)
        results.push(...lintResult.results)

        const output = lintResult.outputs[0]

        const isDifferent = output !== input

        if (fix && isDifferent && output !== undefined) {
          try {
            fs.writeFileSync(filename, output, {
              encoding: 'utf-8'
            })
          } catch {
            prettierSuccess = false
            prettierMessages.push({
              level: 'error',
              text: '保存文件出错',
              filename
            })
          }
        }
      })()
    )
  })

  await Promise.all(tasks)

  return {
    linterSuccess,
    prettierSuccess,
    results,
    messages: prettierMessages
  }
}

const lintContents = async (contents, type, fix = false) => {
  if (!contents.length) {
    return {
      linterSuccess: true,
      prettierSuccess: true,
      results: [],
      messages: []
    }
  }

  const ignorer = getIgnorer()

  let linterSuccess = true
  let prettierSuccess = true
  const prettierMessages = []
  const results = []
  const outputs = []

  const tasks = []

  contents.forEach((content, index) => {
    const filename = content.fileName
    const input = content.fileContent
    outputs[index] = input
    tasks.push(
      (async () => {
        const options = getOptionsForFile(filename)
        let formatted = input

        const isIgnore = ignorer.ignores(filename)

        if (!isIgnore) {
          try {
            formatted = prettier.format(input, options)
          } catch (error) {
            prettierSuccess = false
            prettierMessages.push(handlePrettierError(filename, error))
          }
        }

        let output = formatted || input

        if (linters[type]) {
          const result = await linters[type](
            [
              {
                fileContent: formatted,
                fileName: filename
              }
            ],
            // 如果 prettier 忽略了这个文件，那么 lint 将只检测不 fix
            !isIgnore
          )

          linterSuccess = linterSuccess && result.success
          results.push(...result.results)

          if (result.results[0]) {
            switch (type) {
              case 'es':
                output = result.results[0].output
                break
              case 'style':
                output = result.outputs[0]
                break
            }
          }
        }

        const isDifferent = output !== content.fileContent
        outputs[index] = output

        // 如果 prettier 本身 format 出错了，就只显示出错详情
        if (prettierSuccess && !isIgnore && isDifferent && !fix) {
          prettierSuccess = false
          prettierMessages.push({
            level: 'warn',
            text: '未格式化',
            filename
          })
        }
      })()
    )
  })

  await Promise.all(tasks)

  return {
    linterSuccess,
    prettierSuccess,
    results,
    outputs,
    messages: prettierMessages
  }
}

module.exports = {
  lintFiles,
  lintContents
}
