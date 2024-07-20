import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'

import { mergeXliffs, parseXliff2Text } from '../src/xliff/index.js'

test('merge file', () => {
  const sourceText = fs.readFileSync(
    path.join(__dirname, './examples/xliff/merge/source.xliff'),
    'utf-8',
  )
  const targetText = fs.readFileSync(
    path.join(__dirname, './examples/xliff/merge/target.xliff'),
    'utf-8',
  )
  const mergedText = fs.readFileSync(
    path.join(__dirname, './examples/xliff/merge/merged.xliff'),
    'utf-8',
  )
  const source = parseXliff2Text(sourceText)
  const target = parseXliff2Text(targetText)
  const merged = parseXliff2Text(mergedText)
  const result = mergeXliffs(source.elements[0], target.elements[0])
  expect(result).toStrictEqual(merged.elements[0])
})
