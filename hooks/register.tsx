import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import {
  BRAKE_SLIDE,
  DURATION,
  draw,
  hash,
  toCells,
  toRuns,
  type Holiday,
  type Scene,
  type VisitorKind,
} from './pixels'

const KEY = 'sky'
// Frames are counted at 20 a second whatever the tick, so effects keep time.
const FRAMES_PER_SECOND = 20
// Other surfaces redraw the whole tree; ten a second is their ceiling.
const REDRAW_EVERY = 2
// Asleep, the band draws twice a second.
const ASLEEP_DRAW_EVERY = 10
const USAGE_MS = 5000
// The compaction threshold is re-read every twelfth poll (a minute).
const THRESHOLD_EVERY = 12
const TIRED_MS = 120_000
// A subagent that never reports its stop is let go after 20 minutes.
const AGENT_TTL = 20 * 60 * FRAMES_PER_SECOND
// Every 30 s a visitor may come by.
const VISITOR_EVERY = 30 * FRAMES_PER_SECOND
const VISITOR_CHANCE: Record<string, number> = { rare: 0.1, normal: 0.3, often: 0.6, off: 0 }
// How long a mood shown by /nyan-fx stays.
const FX_HOLD = 6 * FRAMES_PER_SECOND
// Clouds start gathering once the context is a quarter of the way to compaction.
const CLOUDS_FROM = 0.25
// A prompt this long, or with this many lines, comes in as a scroll.
const LONG_PROMPT_CHARS = 800
const LONG_PROMPT_LINES = 12
const SAIYAN_RE = /\bnyan\b/i

const TEST_RE =
  /\b(pytest|jest|vitest|mocha|rspec|phpunit|ctest)\b|\b(cargo|go|bun|deno|mix|dotnet)\s+test\b|\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bplugin\s+test\b|\bmake\s+(test|check)\b/
const COMMIT_RE = /\bgit\s+(?:-\S+\s+)*commit\b/
const PUSH_RE = /\bgit\s+(?:-\S+\s+)*push\b/
const REJECT_RE = /doesn't want to proceed|rejected|declined|denied/i
// Commands whose exit code 1 means "no", not "broken".
const QUIET_COMMANDS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'diff', 'cmp', 'test', '[', '[[', 'false'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const SEARCH_TOOLS = new Set(['WebSearch', 'WebFetch'])
const VISITORS: VisitorKind[] = ['ufo', 'tacnayn', 'birds']
const HOLIDAYS: Holiday[] = ['newyear', 'christmas', 'halloween', 'birthday']

type Hold = 'working' | 'tired' | 'wait' | 'search' | 'storm' | 'agents' | 'sleep' | 'crown' | 'streak' | Holiday
const FX = [
  'crash',
  'fireworks',
  'gold',
  'rocket',
  'cookie',
  'wave',
  'blush',
  'clear',
  'disco',
  'wizard',
  'owl',
  'highfive',
  'brake',
  'scroll',
  'wipe',
  'rain',
  'saiyan',
  ...VISITORS,
  'working',
  'tired',
  'wait',
  'search',
  'storm',
  'agents',
  'sleep',
  'crown',
  'streak',
  ...HOLIDAYS,
] as const

let frame = 0
const scene: Scene = {
  catPos: 0,
  scroll: 0,
  isWorking: false,
  isTired: false,
  isWaiting: false,
  isSearching: false,
  isCompacting: false,
  edits: 0,
  agents: 0,
  context: 0,
  hour: 12,
  isDisco: false,
  streak: 0,
  isAsleep: false,
  hasCrown: false,
}
let isHidden = false
// The Raster the terminal has mounted, so a blit can match its site and size.
let mounted: { requestId: string; columns: number; rows: number } | undefined

// What the hooks have seen.
const turns = new Set<string>()
let turnStartedAt = 0
let lastActivity = Date.now()
let searching = 0
const asked = new Set<string>()
const agents = new Map<string, number>()
let tokens = 0
let threshold = 0
let polls = 0
const holds: Partial<Record<Hold, number>> = {}
let isDiscoForced = false
let timeOverride: { hour: number; day?: number } | undefined

const isHeld = (hold: Hold) => (holds[hold] ?? -1) > frame
const isLive = (at: number | undefined, length: number) => at !== undefined && frame - at < length

// The configured options, with the manifest's defaults as fallbacks.
type Config = {
  rows: number
  frameStep: number
  visitorChance: number
  isFridayDisco: boolean
  hasHolidays: boolean
  idleMs: number | undefined
  birthday: string
}
const readConfig = (options: PluginOptions): Config => {
  const text = (key: string, fallback: string) => {
    const value = options[key]
    return typeof value === 'string' ? value : fallback
  }
  const flag = (key: string, fallback: boolean) => {
    const value = options[key]
    return typeof value === 'boolean' ? value : fallback
  }
  const idle = text('idleMinutes', '5')

  return {
    rows: text('height', '4') === '5' ? 5 : 4,
    frameStep: text('fps', '20') === '10' ? 2 : 1,
    visitorChance: VISITOR_CHANCE[text('visitors', 'normal')] ?? 0.3,
    isFridayDisco: flag('fridayDisco', true),
    hasHolidays: flag('holidays', true),
    idleMs: idle === 'off' ? undefined : Number(idle) * 60_000,
    birthday: text('birthday', '').trim(),
  }
}

const holidayOn = (date: Date, config: Config): Holiday | undefined => {
  for (const holiday of HOLIDAYS) if (isHeld(holiday)) return holiday
  if (!config.hasHolidays) return undefined
  const month = date.getMonth() + 1
  const day = date.getDate()
  const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (config.birthday && md === config.birthday) return 'birthday'
  if (month === 1 && day === 1) return 'newyear'
  if (month === 12 && day >= 20 && day <= 26) return 'christmas'
  if (month === 10 && day === 31) return 'halloween'
  return undefined
}

let config: Config = readConfig({})

const crash = () => {
  scene.crashAt = frame
  scene.streak = 0
}
const rain = () => {
  scene.rainAt = frame
  scene.streak = 0
}
// A /clear: the wiper goes over and the cat starts again from the left.
const wipe = () => {
  scene.wipeAt = frame
  scene.catPos = 0
  scene.edits = 0
  scene.streak = 0
  turns.clear()
  asked.clear()
  agents.clear()
  tokens = 0
}
const activity = () => {
  lastActivity = Date.now()
}

// Moves the clock, the moods and the cat on by one tick.
const step = () => {
  const n = config.frameStep
  frame += n
  const now = Date.now()
  const date = new Date(now)
  const hour = timeOverride?.hour ?? date.getHours() + date.getMinutes() / 60
  const day = timeOverride?.day ?? date.getDay()
  scene.hour = hour
  scene.isDisco = isDiscoForced || (config.isFridayDisco && day === 5 && hour >= 15)
  scene.holiday = holidayOn(date, config)
  scene.isWorking = turns.size > 0 || isHeld('working')
  scene.isTired = (turns.size > 0 && now - turnStartedAt > TIRED_MS) || isHeld('tired')
  scene.isWaiting = asked.size > 0 || isHeld('wait')
  scene.isSearching = searching > 0 || isHeld('search')
  scene.isAsleep =
    isHeld('sleep') ||
    (config.idleMs !== undefined && turns.size === 0 && !scene.isWaiting && now - lastActivity > config.idleMs)
  for (const [id, at] of agents) if (frame - at > AGENT_TTL) agents.delete(id)
  scene.agents = agents.size + (isHeld('agents') ? 3 : 0)
  const fill = threshold > 0 ? tokens / threshold : 0
  scene.context = isHeld('storm') ? 0.95 : Math.max(0, Math.min(1, (fill - CLOUDS_FROM) / (1 - CLOUDS_FROM)))
  scene.hasCrown = isHeld('crown')
  if (isHeld('streak')) scene.streak = Math.max(scene.streak, 15)

  const isVisiting = scene.visitor && isLive(scene.visitor.at, DURATION.visitor)
  const chance = scene.holiday === 'halloween' ? Math.max(0.6, config.visitorChance) : config.visitorChance
  if (!isVisiting && frame % VISITOR_EVERY < n && hash(frame) < chance) {
    const kind = scene.holiday === 'halloween' ? 'birds' : VISITORS[Math.floor(hash(frame + 1) * VISITORS.length)]
    scene.visitor = { kind: kind ?? 'ufo', at: frame }
  }

  const isRocket = isLive(scene.rocketAt, DURATION.rocket) && !isLive(scene.crashAt, DURATION.crash)
  const speed = isRocket
    ? 1 + (frame - (scene.rocketAt ?? frame)) * 0.5
    : scene.isWaiting || scene.isAsleep
      ? 0
      : scene.isTired
        ? 0.3
        : scene.isWorking
          ? 0.9
          : 0.35
  const scroll = scene.isAsleep ? 0.15 : scene.isWaiting ? 0.3 : scene.isWorking ? 1.6 : 0.6
  const boost = isLive(scene.saiyanAt, DURATION.saiyan) ? 1.8 : 1
  // An interrupt: from full speed to a dead stop, held, then on again.
  const brakeAge = scene.brakeAt === undefined ? undefined : frame - scene.brakeAt
  const isBraking = brakeAge !== undefined && brakeAge >= 0 && brakeAge < DURATION.brake
  const brake = !isBraking ? 1 : brakeAge < BRAKE_SLIDE ? (1 - brakeAge / BRAKE_SLIDE) ** 2 : 0
  scene.catPos += (isBraking ? Math.max(speed, 0.9) : speed * boost) * brake * n
  scene.scroll += (isBraking ? Math.max(scroll, 1.6) : scroll * boost) * brake * n
}

const fx = ($: EngineInterface, name: string): string | undefined => {
  switch (name) {
    case 'crash':
      crash()
      return 'Incoming!'
    case 'fireworks':
      scene.fireworksAt = frame
      return 'Tests pass!'
    case 'gold':
      scene.goldAt = frame
      return 'Committed.'
    case 'rocket':
      scene.rocketAt = frame
      return 'Pushed.'
    case 'cookie':
      scene.cookieAt = frame
      scene.edits = Math.min(6, scene.edits + 1)
      return 'Nom.'
    case 'wave':
      scene.waveAt = frame
      return 'Done!'
    case 'blush':
      scene.blushAt = frame
      return 'Oops.'
    case 'clear':
      scene.clearAt = frame
      return 'The sky clears.'
    case 'disco':
      isDiscoForced = !isDiscoForced
      void $.store.set('disco', isDiscoForced).catch(() => undefined)
      return isDiscoForced ? 'Disco on.' : 'Disco off.'
    case 'wizard':
      scene.wizardAt = frame
      return 'Abracadabra.'
    case 'highfive':
      scene.highFiveAt = frame
      return 'High five!'
    case 'brake':
      scene.brakeAt = frame
      return 'Screech!'
    case 'scroll':
      scene.parchmentAt = frame
      return 'A long letter.'
    case 'wipe':
      scene.wipeAt = frame
      scene.catPos = 0
      return 'Squeaky clean.'
    case 'rain':
      scene.rainAt = frame
      return 'Tests fail.'
    case 'saiyan':
      scene.saiyanAt = frame
      return 'Its power level is over 9000!'
    case 'ufo':
    case 'tacnayn':
    case 'birds':
    case 'owl':
      scene.visitor = { kind: name, at: frame }
      return `A visitor: ${name}.`
    case 'working':
    case 'tired':
    case 'wait':
    case 'search':
    case 'storm':
    case 'agents':
    case 'sleep':
    case 'crown':
    case 'streak':
    case 'newyear':
    case 'christmas':
    case 'halloween':
    case 'birthday':
      holds[name] = frame + FX_HOLD
      return `${name} for a few seconds.`
    default:
      return undefined
  }
}

// What each effect is and when it comes on its own, for /nyan-help.
const HELP: Record<string, string> = {
  crash: 'Asteroid hits the cat: a tool call fails or a turn ends with an error. e.g. a build command exits 2',
  rain: 'Rain: a test command fails. e.g. `npm test` exits non-zero',
  fireworks: 'Fireworks: a test command passes. e.g. `pytest`, `bun test`, `make check`',
  gold: 'Golden rainbow: a `git commit` succeeds',
  rocket: 'Rocket: a `git push` succeeds',
  cookie: 'A cookie flies into the cat\'s mouth: a file is edited or written (Edit, Write, NotebookEdit)',
  wave: 'The cat waves: Claude finishes its answer',
  blush: 'The cat blushes: you decline a permission dialog',
  clear: 'The sky clears: compaction is done',
  disco: 'Disco sky: Friday from 15:00 (Friday disco option); /nyan-fx disco toggles it',
  wizard: 'Wizard hat: a skill is used',
  owl: 'An owl flies by: the advisor gave its advice',
  highfive: 'A mini cat flies in for a high five: a subagent finishes',
  brake: 'Screeching stop: you interrupt Claude (Esc)',
  scroll: 'A long letter: your prompt has 800+ characters or 12+ lines',
  wipe: 'A wiper sweeps the sky and the cat starts from the left: /clear',
  saiyan: 'Super Saiyan, golden aura and extra speed: your prompt contains the word "nyan"',
  ufo: 'A UFO: random visitor, maybe every 30 s (Visitors option)',
  tacnayn: 'Tac nayn: random visitor, maybe every 30 s (Visitors option)',
  birds: 'A flock of birds: random visitor, maybe every 30 s (Visitors option)',
  working: 'The cat flies faster: Claude is working on a turn',
  tired: 'The rainbow fades, the cat is tired: one turn has run for over 2 minutes',
  wait: 'The cat stops and waits: a permission dialog is open',
  search: 'Searching: a WebSearch or WebFetch is running',
  storm: 'Clouds, then a storm with lightning: the context fills toward compaction (clouds from a quarter of the way); also during compaction',
  agents: 'Mini cats fly along: subagents are running',
  sleep: 'The cat naps on a cloud: nothing happened for the Nap after minutes',
  crown: 'A crown: only on request, /nyan-fx crown',
  streak: 'A longer, glittering rainbow: successful tool calls in a row; any crash or rain resets it',
  newyear: "Confetti: January 1 (Holidays option)",
  christmas: 'Santa hat and snow: December 20-26 (Holidays option)',
  halloween: 'Halloween colours and bats: October 31 (Holidays option)',
  birthday: 'Party hat and confetti: your birthday, set as MM-DD in the Birthday option',
}

const helpText = (name: string): string => {
  if (name) return HELP[name] ? `${name}: ${HELP[name]}` : `No effect "${name}". Effects: ${FX.join(', ')}`
  return [
    'Nyan cat flies in a band above the prompt and reacts to what happens in the session.',
    '',
    'Commands:',
    '  /nyan                    show or hide the band',
    '  /nyan-fx <effect>        play an effect now; moods and holidays hold for a few seconds',
    '  /nyan-time <HH:MM> [day] pretend it is another hour (and weekday 0-6, 5 = Friday); off for real time',
    '  /nyan-help [effect]      this help, or one effect',
    '',
    'Effects and when they come:',
    ...FX.map(fx => `  ${fx.padEnd(10)} ${HELP[fx] ?? ''}`),
    '',
    'Night sky after dark, dawn and dusk follow the clock. Options (height, fps, visitors, nap, holidays, birthday) are in /plugin.',
  ].join('\n')
}

export const register: Register = (on, options) => {
  config = readConfig(options)

  on('session.start', async ($, e, next) => {
    isHidden = (await $.store.get('hidden').catch(() => false)) === true
    isDiscoForced = (await $.store.get('disco').catch(() => false)) === true

    await $.command.register({ name: 'nyan', description: 'Show or hide the nyan cat band' })
    await $.command.register({
      name: 'nyan-help',
      description: 'How the nyan cat works and when each effect comes',
      argumentHint: '[effect]',
    })
    await $.command.register({
      name: 'nyan-fx',
      description: 'Play a nyan cat effect',
      argumentHint: FX.join('|'),
    })
    await $.command.register({
      name: 'nyan-time',
      description: 'Pretend it is another hour (and weekday 0-6), or off',
      argumentHint: '<hour or HH:MM> [day] | off',
    })

    $.clock.every((1000 / FRAMES_PER_SECOND) * config.frameStep, () => {
      step()
      if (isHidden) return
      if (scene.isAsleep && frame % ASLEEP_DRAW_EVERY >= config.frameStep) return
      const site = mounted
      if (!site) {
        if (frame % REDRAW_EVERY < config.frameStep) $.ui.invalidate('ui.render')
        return
      }
      const cells = toCells(draw(frame, site.columns, site.rows * 2, scene))
      void $.ui.blit({ requestId: site.requestId, key: KEY, ...cells }).then(result => {
        if (result.deny && mounted === site) mounted = undefined
      })
    })
    // How far the context is toward compaction sets how cloudy it is.
    $.clock.every(USAGE_MS, () => {
      const withThreshold = polls++ % THRESHOLD_EVERY === 0
      void $.session
        .usage(withThreshold ? { breakdown: 'summary' } : undefined)
        .then(usage => {
          tokens = usage.context.tokens ?? ((usage.context.percent ?? 0) / 100) * usage.context.window
          if (withThreshold) {
            threshold = usage.context.breakdown?.autoCompactThreshold ?? usage.context.window
          } else if (threshold === 0) {
            threshold = usage.context.window
          }
        })
        .catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: 'nyan' }, async $ => {
    activity()
    isHidden = !isHidden
    void $.store.set('hidden', isHidden).catch(() => undefined)
    $.ui.invalidate('ui.render')

    return { text: isHidden ? 'Nyan cat landed.' : 'Nyan cat is flying.' }
  })

  on('command.run', { command: 'nyan-help' }, async (_$, e) => {
    activity()
    return { text: helpText(e.args.trim()) }
  })

  on('command.run', { command: 'nyan-fx' }, async ($, e) => {
    activity()
    const text = fx($, e.args.trim())

    return { text: text ?? `Effects: ${FX.join(', ')}` }
  })

  on('command.run', { command: 'nyan-time' }, async (_$, e) => {
    activity()
    const [first, second] = e.args.trim().split(/\s+/)
    if (!first || first === 'off') {
      timeOverride = undefined
      return { text: 'Real time again.' }
    }
    const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(first) ?? /^(\d{1,2}(?:\.\d+)?)$/.exec(first)
    const hour = match ? Number(match[1]) + (match[2] ? Number(match[2]) / 60 : 0) : NaN
    const day = second === undefined ? undefined : Number(second)
    if (!Number.isFinite(hour) || hour < 0 || hour >= 24 || (day !== undefined && !(day >= 0 && day <= 6))) {
      return { text: 'Usage: /nyan-time <hour or HH:MM> [day 0-6, 5 = Friday] | off' }
    }
    timeOverride = { hour, day }

    return { text: `It is ${first}${day === undefined ? '' : `, day ${day}`} now.` }
  })

  on('prompt.submit', ($, e, next) => {
    activity()
    const text = e.text.trim()
    if (!text.startsWith('/')) {
      if (SAIYAN_RE.test(text)) scene.saiyanAt = frame
      if (text.length >= LONG_PROMPT_CHARS || text.split('\n').length >= LONG_PROMPT_LINES) scene.parchmentAt = frame
    }

    return next(e)
  })

  // A permission dialog: the cat stops and waits for the person.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.tool_use_id) asked.add(e.tool_use_id)

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    activity()
    const isSearch = SEARCH_TOOLS.has(e.tool)
    if (isSearch) searching++
    let ran
    try {
      ran = await next(e)
    } finally {
      if (isSearch) searching--
    }
    activity()
    const wasAsked = asked.delete(e.tool_use_id)

    if (ran.deny !== undefined || ran.isError) {
      const text = ran.deny ?? ran.text ?? ''
      // Declined at the dialog: a blush.
      if (wasAsked && (ran.deny !== undefined || REJECT_RE.test(text))) {
        scene.blushAt = frame
        return ran
      }
      // A grep that found nothing, a diff that found something: no alarm.
      if (e.tool === 'Bash') {
        // Failing tests are rain, not a crash.
        if (TEST_RE.test(e.command)) {
          rain()
          return ran
        }
        const last = e.command.split(/\|\|?|&&|;/).pop()?.trim() ?? ''
        const word = last.split(/\s+/)[0] ?? ''
        const isExit1 = /^Exit code 1\b/.test(text)
        const isSilent = text.replace(/^Exit code 1\s*/, '').trim() === ''
        if (isExit1 && (isSilent || QUIET_COMMANDS.has(word))) return ran
      }
      crash()
      return ran
    }

    scene.streak++
    if (e.tool === 'Bash') {
      const command = e.command
      if (PUSH_RE.test(command)) {
        scene.rocketAt = frame
      } else if (COMMIT_RE.test(command)) {
        scene.goldAt = frame
      } else if (TEST_RE.test(command)) {
        scene.fireworksAt = frame
      }
    } else if (e.tool === 'Skill') {
      scene.wizardAt = frame
    } else if (EDIT_TOOLS.has(e.tool)) {
      scene.cookieAt = frame
      scene.edits = Math.min(6, scene.edits + 1)
    }

    return ran
  })

  on('classic.SubagentStart', ($, e, next) => {
    agents.set(e.agent_id, frame)
    return next(e)
  })

  on('classic.SubagentStop', ($, e, next) => {
    if (agents.delete(e.agent_id)) scene.highFiveAt = frame
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    activity()
    if (turns.size === 0) turnStartedAt = Date.now()
    turns.add(e.turnId)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    activity()
    turns.delete(e.turnId)
    if (e.reason === 'error') crash()
    else if (e.reason === 'aborted' && e.agentId === undefined) scene.brakeAt = frame
    else if (turns.size === 0 && e.reason === 'answer') scene.waveAt = frame
    if (turns.size === 0) scene.edits = 0

    return next(e)
  })

  // The advisor runs inside the request: an owl comes once its advice is in.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (result.serverToolUses?.some(use => use.name === 'advisor')) scene.visitor = { kind: 'owl', at: frame }

    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') wipe()
    return next(e)
  })

  // Compaction: a storm while it runs, then the sky clears.
  on('session.compact', async ($, e, next) => {
    scene.isCompacting = true
    try {
      return await next(e)
    } finally {
      scene.isCompacting = false
      scene.clearAt = frame
      tokens = 0
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (isHidden || e.props.hasSurvey) {
      mounted = undefined
      return next(e)
    }
    const columns = Math.max(32, e.props.bodyColumns)
    const f = draw(frame, columns, config.rows * 2, scene)
    const rest = await next(e)

    if (e.surface === 'terminal') {
      const { Box, Raster } = $.ui.resolve(e)
      mounted = { requestId: e.requestId, columns, rows: config.rows }

      return (
        <Box flexDirection="column">
          <Raster key={KEY} {...toCells(f)} />
          {rest}
        </Box>
      )
    }

    mounted = undefined
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {toRuns(f).map(runs => (
          <Text wrap="truncate">
            {runs.map(run => (
              <Text color={run.fg} backgroundColor={run.bg}>
                {run.text}
              </Text>
            ))}
          </Text>
        ))}
        {rest}
      </Box>
    )
  })
}
