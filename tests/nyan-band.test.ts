import { expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import { CRASH_FRAMES, calmScene, doomAt, draw, toCells, toRuns, type Scene } from '../hooks/pixels'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
  viewport: { columns: 105, rows: 40 },
} as const

const F = 300
const scene = (over: Partial<Scene> = {}): Scene => ({ ...calmScene(F), catPos: 90, scroll: F, ...over })
const brightness = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255)
const meanBrightness = (px: Uint32Array) => px.reduce((sum, c) => sum + brightness(c), 0) / px.length

test('calm band has the tart, the rainbow and moves', async () => {
  const a = draw(F, 100, 8, scene())
  const b = draw(F + 5, 100, 8, scene({ catPos: 93, scroll: F + 5 }))
  expect(a.px.length).toBe(100 * 8)
  expect(a.px.includes(0xff99ff)).toBe(true)
  expect(a.px.includes(0xff0000)).toBe(true)
  expect(a.px.join()).not.toBe(b.px.join())
})

test('a crash darkens and reddens the sky, then clears', async () => {
  expect(doomAt(-1)).toBe(0)
  expect(doomAt(0.3)).toBe(1)
  expect(doomAt(1)).toBe(0)
  const calm = draw(F, 100, 8, scene())
  const mid = draw(F, 100, 8, scene({ crashAt: F - Math.floor(CRASH_FRAMES * 0.4) }))
  expect(meanBrightness(mid.px)).toBeLessThan(meanBrightness(calm.px) / 2)
  const sky = mid.px[0] ?? 0
  expect((sky >> 16) & 255).toBeGreaterThan(sky & 255)
  expect(Array.from(mid.px).some(c => brightness(c) > 600)).toBe(true)
  const after = draw(F, 100, 8, scene({ crashAt: F - CRASH_FRAMES }))
  expect(after.px.join()).toBe(calm.px.join())
})

const EFFECTS: Record<string, Partial<Scene>> = {
  fireworks: { fireworksAt: F - 14 },
  gold: { goldAt: F - 10 },
  rocket: { rocketAt: F - 20 },
  cookie: { cookieAt: F - 8 },
  fat: { edits: 4 },
  wave: { waveAt: F - 10 },
  blush: { blushAt: F - 5 },
  clear: { clearAt: F - 5 },
  working: { isWorking: true },
  tired: { isTired: true },
  waiting: { isWaiting: true },
  searching: { isSearching: true },
  agents: { agents: 2 },
  storm: { context: 0.95 },
  compacting: { isCompacting: true },
  cloudy: { context: 0.6 },
  night: { hour: 2 },
  sunset: { hour: 19.5 },
  disco: { isDisco: true },
  ufo: { visitor: { kind: 'ufo', at: F - 60 } },
  tacnayn: { visitor: { kind: 'tacnayn', at: F - 60 } },
  birds: { visitor: { kind: 'birds', at: F - 150 } },
  asleep: { isAsleep: true },
  crown: { hasCrown: true },
  streak: { streak: 15 },
  newyear: { holiday: 'newyear' },
  christmas: { holiday: 'christmas' },
  halloween: { holiday: 'halloween' },
  birthday: { holiday: 'birthday' },
  wizard: { wizardAt: F - 10 },
  owl: { visitor: { kind: 'owl', at: F - 60 } },
  highfive: { highFiveAt: F - 18 },
  brake: { brakeAt: F - 20 },
  parchment: { parchmentAt: F - 20 },
  wipe: { wipeAt: F - 10 },
  rain: { rainAt: F - 20 },
  saiyan: { saiyanAt: F - 10 },
}

test('every effect changes the picture and keeps the band 8 px tall', async () => {
  const calm = draw(F, 140, 8, scene()).px.join()
  for (const [name, over] of Object.entries(EFFECTS)) {
    const f = draw(F, 140, 8, scene(over))
    expect({ name, height: f.height, length: f.px.length }).toEqual({ name, height: 8, length: 140 * 8 })
    expect({ name, same: f.px.join() === calm }).toEqual({ name, same: false })
  }
})

test('a crash holds back the celebrations', async () => {
  const crashing = draw(F, 140, 8, scene({ crashAt: F - 10 })).px.join()
  const both = draw(F, 140, 8, scene({ crashAt: F - 10, fireworksAt: F - 14, goldAt: F - 10 })).px.join()
  expect(both).toBe(crashing)
})

test('a wipe sweeps over a crash too', async () => {
  const crashing = draw(F, 140, 8, scene({ crashAt: F - 10 })).px.join()
  expect(draw(F, 140, 8, scene({ crashAt: F - 10, wipeAt: F - 10 })).px.join()).not.toBe(crashing)
})

test('a five-row band is ten pixels tall', async () => {
  const f = draw(F, 100, 10, scene({ hasCrown: true }))
  expect(f.height).toBe(10)
  expect(toCells(f).rows).toBe(5)
})

test('cells encode four rows', async () => {
  const cells = toCells(draw(0, 100, 8))
  expect(cells.rows).toBe(4)
  expect(cells.cells.length).toBe(Math.ceil((100 * 4 * 12) / 3) * 4)
  expect(toRuns(draw(0, 100, 8)).length).toBe(4)
})

test('terminal draws a Raster band, desktop draws text', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  const term = await $.ui.mount({ plugin: 'nyan-pixel', surface: 'terminal', ...BAND })
  expect(await term.find({ type: 'Raster', key: 'sky' })).toBeDefined()
  await term.unmount()
  const desk = await $.ui.mount({ plugin: 'nyan-pixel', surface: 'desktop', ...BAND })
  expect(await desk.find({ type: 'Text', text: /▀/ })).toBeDefined()
  await desk.unmount()
})

test('band steps aside for a survey', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  const ui = await $.ui.mount({
    plugin: 'nyan-pixel',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
  })
  expect(await ui.find({ type: 'Raster', key: 'sky' })).toBeUndefined()
  await ui.unmount()
})
