import { expect, test } from 'claude-code/testing'

test('/nyan-help explains every effect and one on request', async $ => {
  const all = await $.command.run({ command: 'nyan-help', args: '' })
  for (const fx of ['crash', 'rain', 'fireworks', 'owl', 'wipe', 'birthday']) expect(all.text).toContain(`  ${fx}`)
  expect(all.text).toContain('/nyan-fx <effect>')

  const one = await $.command.run({ command: 'nyan-help', args: 'rocket' })
  expect(one.text).toContain('git push')

  const none = await $.command.run({ command: 'nyan-help', args: 'nope' })
  expect(none.text).toContain('No effect "nope"')
})
