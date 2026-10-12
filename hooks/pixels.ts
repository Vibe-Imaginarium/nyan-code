// Pixel scene for a thin band: a frame number, a size in pixels and the scene
// state in, a 0xRRGGBB buffer out. Pure: the hooks fill `Scene`, nothing here
// reads the clock. Two pixels stack in one terminal cell as '▀' (top = fg,
// bottom = bg).
//
// Draw order: sky (time of day or disco), storm, clouds, sparkles, visitor,
// fireworks, rainbow, mini cats, cookie, cat and its mood marks, then the
// crash on top. A crash overrides everything: no celebrations, no moods.

import {
  BINOCULARS,
  BIRD,
  CONFETTI,
  CROWN,
  COIN,
  COOKIE,
  DISCO,
  GOLD,
  GREYS,
  HEAD_X,
  HEADS,
  LEGS,
  MINI,
  MINI_RAINBOW,
  MOON,
  OWL,
  PALETTE,
  PARCHMENT,
  PARTY_HAT,
  QUESTION,
  RAINBOW,
  SAIYAN_HAIR,
  SANTA_HAT,
  SKY_KEYS,
  SPARKS,
  SPRITE_H,
  TAC_COLOURS,
  TAILS,
  TART,
  UFO,
  WIZARD_HAT,
  ZED,
  fatTart,
  type HeadKind,
} from './sprites'

export type Frame = { width: number; height: number; px: Uint32Array }
export type Run = { text: string; fg?: string; bg?: string }

// A pixel left to the terminal's own background, for strips drawn inline.
export const CLEAR = 0x01000000

export type VisitorKind = 'ufo' | 'tacnayn' | 'birds' | 'owl'
export type Holiday = 'newyear' | 'christmas' | 'halloween' | 'birthday'

// How long each timed effect lasts, in frames (20 a second).
export const DURATION = {
  crash: 50,
  fireworks: 50,
  gold: 60,
  rocket: 40,
  cookie: 16,
  wave: 30,
  clear: 40,
  blush: 30,
  visitor: 200,
  owl: 140,
  wizard: 80,
  highfive: 40,
  brake: 50,
  parchment: 80,
  wipe: 24,
  rain: 80,
  saiyan: 100,
}
// Frames a brake takes to bring everything to a stop; the rest it holds.
export const BRAKE_SLIDE = 14
export const CRASH_FRAMES = DURATION.crash

export type Scene = {
  // Where the cat is along its loop, and how far the background has moved.
  catPos: number
  scroll: number
  // Timed effects: the frame each started at.
  crashAt?: number
  fireworksAt?: number
  goldAt?: number
  rocketAt?: number
  cookieAt?: number
  waveAt?: number
  clearAt?: number
  blushAt?: number
  visitor?: { kind: VisitorKind; at: number }
  // A skill in use: a wizard hat.
  wizardAt?: number
  // A subagent back: a mini cat flies in for a high-five.
  highFiveAt?: number
  // An interrupt: skid, and the sky stops.
  brakeAt?: number
  // A long prompt: the cat carries a scroll.
  parchmentAt?: number
  // A /clear: a wiper sweeps the band.
  wipeAt?: number
  // Failing tests: a rain cloud over the cat.
  rainAt?: number
  // "nyan" in a prompt: super saiyan.
  saiyanAt?: number
  // Moods.
  isWorking: boolean
  isTired: boolean
  isWaiting: boolean
  isSearching: boolean
  isCompacting: boolean
  // Counters.
  edits: number
  agents: number
  // Ambient: context fill 0..1, local hour 0..24, disco on.
  context: number
  hour: number
  isDisco: boolean
  // Successful tool calls in a row; the rainbow grows with them.
  streak: number
  // Idle a while: the cat naps on a cloud.
  isAsleep: boolean
  // A good day earns a crown.
  hasCrown: boolean
  holiday?: Holiday
}

export const calmScene = (frame = 0): Scene => ({
  catPos: frame * 0.6,
  scroll: frame,
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
})

const DOOM_TOP = 0x1a0204
const DOOM_BOTTOM = 0x5a0a06
const STORM = 0x2a2a38

type Blob = { dx: number; dy: number; r: number }
const CLOUD_SHAPES: Blob[][] = [
  [{ dx: 2, dy: 2, r: 1.8 }, { dx: 5, dy: 1.5, r: 2.2 }, { dx: 8, dy: 2, r: 1.8 }],
  [{ dx: 1.5, dy: 1.5, r: 1.4 }, { dx: 4, dy: 1.5, r: 1.6 }],
  [{ dx: 2, dy: 3, r: 2 }, { dx: 6, dy: 2, r: 2.6 }, { dx: 10, dy: 3, r: 2 }, { dx: 13, dy: 3, r: 1.5 }],
]
type CloudSpec = { shape: number; y: number; speed: number; offset: number; far: boolean }
// The first three always fly; the rest join as the context fills.
const CLOUDS: CloudSpec[] = [
  { shape: 1, y: 0, speed: 0.3, offset: 10, far: true },
  { shape: 0, y: 0.1, speed: 0.7, offset: 40, far: false },
  { shape: 2, y: 0.9, speed: 0.9, offset: 130, far: false },
  { shape: 2, y: 0.6, speed: 0.35, offset: 90, far: true },
  { shape: 1, y: 0.5, speed: 0.3, offset: 170, far: true },
  { shape: 0, y: 0.3, speed: 0.8, offset: 220, far: false },
  { shape: 1, y: 0.8, speed: 0.5, offset: 60, far: true },
  { shape: 2, y: 0.2, speed: 0.6, offset: 250, far: false },
  { shape: 0, y: 0.7, speed: 0.45, offset: 300, far: true },
]

const mod = (a: number, n: number) => ((a % n) + n) % n

const mix = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, t))
  const ch = (s: number) => {
    const x = (a >> s) & 255
    const y = (b >> s) & 255
    return Math.round(x + (y - x) * k) << s
  }
  return ch(16) | ch(8) | ch(0)
}

// Cheap deterministic noise in [0, 1).
export const hash = (n: number) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 0x100000000
}

// How dark and red the sky is during a crash: up fast, hold, fade out.
export const doomAt = (t: number) => (t < 0 || t >= 1 ? 0 : t < 0.12 ? t / 0.12 : t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35)

// The sky's top and bottom colours at a local hour.
const skyAt = (hour: number): [number, number] => {
  const h = mod(hour, 24)
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const a = SKY_KEYS[i]
    const b = SKY_KEYS[i + 1]
    if (a && b && h >= a[0] && h <= b[0]) {
      const t = b[0] === a[0] ? 0 : (h - a[0]) / (b[0] - a[0])
      return [mix(a[1], b[1], t), mix(a[2], b[2], t)]
    }
  }
  return [SKY_KEYS[0]?.[1] ?? 0, SKY_KEYS[0]?.[2] ?? 0]
}

// 1 deep at night, 0 by day, between at dusk and dawn.
const nightAt = (hour: number) => {
  const h = mod(hour, 24)
  if (h < 5 || h >= 20.5) return 1
  if (h < 6.5) return 1 - (h - 5) / 1.5
  if (h >= 19) return (h - 19) / 1.5
  return 0
}

const ageOf = (frame: number, at: number | undefined, length: number) => {
  if (at === undefined) return undefined
  const age = frame - at
  return age >= 0 && age < length ? age : undefined
}

type SpriteOptions = { depth?: number; colours?: Record<string, number>; flipX?: boolean; flipY?: boolean }
type SetPixel = (x: number, y: number, c: number) => void
type DrawSprite = (rows: readonly string[], x0: number, y0: number, options?: SpriteOptions) => void

export const draw = (frame: number, width: number, height: number, scene: Scene = calmScene(frame)): Frame => {
  const W = Math.max(32, Math.floor(width))
  const H = Math.max(8, Math.floor(height))
  const crashAge = ageOf(frame, scene.crashAt, DURATION.crash)
  const t = crashAge === undefined ? -1 : crashAge / DURATION.crash
  const doom = doomAt(t)
  const isCrashing = crashAge !== undefined
  // Celebrations wait out a crash.
  const live = (at: number | undefined, length: number) => (isCrashing ? undefined : ageOf(frame, at, length))
  const fireworksAge = live(scene.fireworksAt, DURATION.fireworks)
  const goldAge = live(scene.goldAt, DURATION.gold)
  const rocketAge = live(scene.rocketAt, DURATION.rocket)
  const cookieAge = live(scene.cookieAt, DURATION.cookie)
  const waveAge = scene.isWaiting ? undefined : live(scene.waveAt, DURATION.wave)
  const clearAge = live(scene.clearAt, DURATION.clear)
  const blushAge = live(scene.blushAt, DURATION.blush)
  const wizardAge = live(scene.wizardAt, DURATION.wizard)
  const highFiveAge = live(scene.highFiveAt, DURATION.highfive)
  const brakeAge = live(scene.brakeAt, DURATION.brake)
  const parchmentAge = live(scene.parchmentAt, DURATION.parchment)
  const wipeAge = ageOf(frame, scene.wipeAt, DURATION.wipe)
  const rainAge = live(scene.rainAt, DURATION.rain)
  const saiyanAge = live(scene.saiyanAt, DURATION.saiyan)
  const visitor = scene.visitor && ageOf(frame, scene.visitor.at, DURATION.visitor) !== undefined ? scene.visitor : undefined
  const night = scene.isDisco ? 0 : nightAt(scene.hour)
  const storm = clearAge !== undefined ? 0 : scene.isCompacting ? 1 : scene.context >= 0.85 ? 0.75 : 0

  const layer = new Uint32Array(W * H)
  const set: SetPixel = (x, y, c) => {
    if (x >= 0 && x < W && y >= 0 && y < H) layer[y * W + x] = c
  }
  // `depth` is how much of the crash darkness a colour takes.
  const shade = (c: number, depth = 1) => (doom > 0 ? mix(c, mix(c, 0x300000, 0.85), doom * depth) : c)
  const sprite: DrawSprite = (rows, x0, y0, options = {}) => {
    const { depth = 0.35, colours = PALETTE, flipX = false, flipY = false } = options
    rows.forEach((row, ry) => {
      const dy = flipY ? rows.length - 1 - ry : ry
      for (let rx = 0; rx < row.length; rx++) {
        const key = row[rx] ?? '.'
        if (key === '.') continue
        const c = colours[key] ?? PALETTE[key]
        const dx = flipX ? row.length - 1 - rx : rx
        if (c !== undefined) set(x0 + dx, y0 + dy, shade(c, depth))
      }
    })
  }

  // Sky.
  let [top, bottom] = skyAt(scene.hour)
  if (scene.isDisco) {
    const i = Math.floor(frame / 8)
    top = DISCO[mod(i, DISCO.length)] ?? top
    bottom = DISCO[mod(i + 2, DISCO.length)] ?? bottom
  } else if (scene.holiday === 'halloween') {
    top = mix(top, 0x2a0a3a, 0.7)
    bottom = mix(bottom, 0xff6a00, 0.55)
  }
  const flash = storm > 0 && hash(Math.floor(frame / 3) * 7 + 1) > 0.9
  for (let y = 0; y < H; y++) {
    let c = mix(top, bottom, H <= 1 ? 0 : y / (H - 1))
    c = mix(c, STORM, storm * 0.8)
    if (flash) c = mix(c, 0xffffff, 0.35)
    if (clearAge !== undefined) c = mix(c, 0xfff3b0, 0.6 * (1 - clearAge / DURATION.clear))
    if (rainAge !== undefined) c = mix(c, 0x5a6070, 0.4 * Math.min(1, (DURATION.rain - rainAge) / 10))
    c = mix(c, mix(DOOM_TOP, DOOM_BOTTOM, y / (H - 1)), doom)
    layer.fill(c, y * W, (y + 1) * W)
  }

  // Night: stars and the moon.
  if (night > 0.3 && !isCrashing && storm === 0) {
    for (let i = 0; i < Math.ceil(W / 6); i++) {
      const x = Math.floor(hash(i * 3 + 11) * W)
      const y = Math.floor(hash(i * 5 + 7) * (H - 2))
      if (hash(i + Math.floor(frame / 10) * 97) > 0.25) set(x, y, mix(0x8899cc, 0xffffff, night))
    }
    sprite(MOON, W - 14, 1, { depth: 1, colours: scene.holiday === 'halloween' ? { M: 0xff8800 } : PALETTE })
  }

  // Clouds: more as the context fills, grey in a storm, dim at night.
  const cloudCount = Math.min(CLOUDS.length, 3 + Math.round(scene.context * 6) + (storm > 0 ? 3 : 0))
  for (const spec of CLOUDS.slice(0, cloudCount)) {
    const blobs = CLOUD_SHAPES[spec.shape] ?? []
    const cw = Math.ceil(Math.max(...blobs.map(b => b.dx + b.r))) + 1
    const ch = Math.ceil(Math.max(...blobs.map(b => b.dy + 1)))
    const x0 = W - Math.floor(mod(scene.scroll * spec.speed + spec.offset, W + cw))
    const y0 = Math.floor(spec.y * Math.max(0, H - ch))
    let body = spec.far ? 0xd8e7f8 : 0xffffff
    let under = spec.far ? 0xb0cae9 : 0xdde8f5
    body = mix(mix(body, 0x5a6a8a, night * 0.8), 0x6a6a7a, storm)
    under = mix(mix(under, 0x46546e, night * 0.8), 0x4a4a58, storm)
    for (let dy = 0; dy < ch; dy++) {
      for (let dx = 0; dx < cw; dx++) {
        if (blobs.some(b => (dx - b.dx) ** 2 + (dy - b.dy) ** 2 <= b.r * b.r)) {
          set(x0 + dx, y0 + dy, shade(dy >= ch - 1 ? under : body))
        }
      }
    }
  }

  // Lightning in a storm.
  if (flash && !isCrashing) {
    let x = Math.floor(hash(frame * 13 + 5) * W)
    for (let y = 0; y < H; y++) {
      set(x, y, 0xffffcc)
      if (y % 2) x += hash(frame + y) > 0.5 ? 1 : -1
    }
  }

  if (!isCrashing && storm === 0) {
    for (let i = 0; i < Math.ceil(W / 16); i++) {
      const x = W - Math.floor(mod(scene.scroll * 2 + i * 53, W + 4))
      const y = mod(i * 7 + 1, H - 2)
      sprite(SPARKS[mod(Math.floor(frame / 2) + i, SPARKS.length)] ?? [], x, y, { depth: 1 })
    }
  }

  // The cat's place: it crosses the band left to right, its trail behind.
  const extra = Math.min(6, scene.edits)
  const spriteW = 13 + extra
  const trail = scene.isAsleep ? 0 : Math.min(48, Math.floor(W * 0.35)) + Math.min(30, scene.streak * 2)
  const loop = W + spriteW + trail
  let catX = scene.isAsleep ? Math.floor(W / 2) - 7 : Math.floor(mod(scene.catPos, loop)) - spriteW
  const baseY = Math.floor((H - SPRITE_H) / 2)
  let catY = baseY + (scene.isWaiting || scene.isAsleep ? 0 : mod(Math.floor(frame / 3), 2))
  const isStumbling = isCrashing && t < 0.4
  if (isStumbling) {
    const drop = [0, 1, 2, 1, 2, 2, 1, 0, 1, -1, 0, 1]
    catY = baseY + (drop[Math.floor(t * 50) % drop.length] ?? 0)
    catX -= Math.round(Math.sin(t * Math.PI * 2.5) * 3)
  }
  // The turn-end loop: a hop with the cat upside down at the top.
  let isUpsideDown = false
  if (waveAge !== undefined) {
    const p = waveAge / DURATION.wave
    catY = baseY - Math.round(Math.sin(p * Math.PI))
    isUpsideDown = p > 0.3 && p < 0.7
  }

  // The rainbow: gold after a commit, faded when tired, shimmering at work.
  const stripes = goldAge !== undefined || saiyanAge !== undefined ? GOLD : RAINBOW
  for (let x = Math.max(0, catX - trail); x < (scene.isAsleep ? 0 : catX + 2) && x < W; x++) {
    const wave = scene.isWaiting ? 0 : mod(Math.floor((x - frame) / 6), 2)
    const jitter = isStumbling ? Math.round((hash(x * 31 + frame) - 0.5) * 2) : 0
    stripes.forEach((c0, i) => {
      let c = c0
      if (scene.isTired) c = mix(c, top, 0.45)
      if (rocketAge !== undefined) c = mix(c, 0xffffff, 0.55)
      if (scene.isWorking && !scene.isTired && mod(x + frame, 7) === 0) c = mix(c, 0xffffff, 0.35)
      if ((goldAge !== undefined || saiyanAge !== undefined) && hash(x * 7 + i + frame) > 0.97) c = 0xffffff
      // A long streak glitters.
      if (scene.streak >= 5 && hash(x * 13 + i * 3 + frame) > 1.02 - Math.min(20, scene.streak) * 0.004) c = 0xffffff
      set(x, catY + i + wave + jitter, shade(c, 0.5))
    })
  }

  // Fireworks: rockets climb, then burst in two rings, ahead of the cat
  // where there is sky, anywhere otherwise.
  if (fireworksAge !== undefined) {
    const seed = scene.fireworksAt ?? 0
    const ahead = catX + spriteW + 6
    const span = W - ahead > 20 ? [ahead, W - 4] : [4, W - 4]
    for (let b = 0; b < 6; b++) {
      const age = fireworksAge - b * 6
      if (age < 0 || age > 24) continue
      const cx = Math.floor((span[0] ?? 4) + hash(b * 31 + seed) * ((span[1] ?? W) - (span[0] ?? 4)))
      const cy = 2 + Math.floor(hash(b * 17 + seed + 3) * (H - 4))
      const colour = DISCO[(b + seed) % DISCO.length] ?? 0xffffff
      if (age < 4) {
        set(cx, H - 1 - Math.floor(((H - 1 - cy) * age) / 4), 0xffffcc)
        continue
      }
      const r = Math.min(5, (age - 4) * 0.6)
      const fade = Math.max(0, (age - 14) / 10)
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6
        set(Math.round(cx + Math.cos(a) * r * 2), Math.round(cy + Math.sin(a) * r), mix(colour, top, fade))
        set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.5), mix(0xffffff, colour, 0.3 + fade))
      }
      if (age < 8) set(cx, cy, 0xffffff)
    }
  }

  // Visitors fly over the trail, under the cat.
  if (visitor && visitor.kind !== 'owl' && !isCrashing) drawVisitor(visitor.kind, frame - visitor.at, W, H, set, sprite)

  // Flame behind the cat on a push.
  if (rocketAge !== undefined) {
    // Speed lines across the sky.
    for (let i = 0; i < 6; i++) {
      const y = mod(i * 3 + 1, H)
      const x0 = mod(Math.floor(hash(i * 7) * W) - rocketAge * 6, W)
      for (let k = 0; k < 8; k++) set(x0 + k, y, mix(0xffffff, top, k / 8))
    }
    const length = 4 + Math.min(12, Math.floor(rocketAge / 2))
    for (let k = 1; k <= length; k++) {
      const p = k / length
      const c = p < 0.25 ? 0xffffff : p < 0.5 ? 0xffee55 : p < 0.75 ? 0xff8800 : 0xff2200
      const spread = p < 0.3 ? 1 : 2
      for (let dy = 3 - spread; dy <= 3 + spread; dy++) {
        if (hash(k * 7 + dy * 13 + frame) > 0.2) set(catX - 1 - k, catY + dy, c)
      }
    }
  }

  // Mini cats for running subagents.
  for (let i = 0; i < Math.min(4, scene.agents); i++) {
    // Escorts ahead of the cat, above and below its line.
    const mx = catX + spriteW + 6 + i * 12 + Math.round(Math.sin((frame + i * 20) / 6) * 2)
    const my = i % 2 === 0 ? 0 : H - 4
    for (let k = 1; k <= 8; k++) MINI_RAINBOW.forEach((c, s) => set(mx - k, my + s, shade(c, 0.5)))
    sprite(MINI, mx, my)
  }

  // A cookie flying into the cat's mouth after an edit.
  const headX = catX + extra + HEAD_X
  if (cookieAge !== undefined) {
    const p = cookieAge / DURATION.cookie
    const x = Math.round(W + (headX + 7 - W) * p)
    if (p < 0.9) sprite(COOKIE, x, catY + 2)
  }

  // Brake: skid marks under the paws and smoke behind them.
  if (brakeAge !== undefined) {
    const length = Math.min(BRAKE_SLIDE, brakeAge) + 3
    const fade = Math.max(0, (brakeAge - BRAKE_SLIDE * 2) / (DURATION.brake - BRAKE_SLIDE * 2))
    const y = Math.min(H - 1, catY + 7)
    for (let k = 0; k < length; k++) {
      const c = mix(0x2a2a2a, top, fade + (k / length) * 0.5)
      set(catX + 1 - k, y, c)
      set(catX + 6 - k, y, c)
    }
    if (brakeAge < BRAKE_SLIDE + 10) {
      for (let i = 0; i < 4; i++) {
        const age = brakeAge + i * 3
        set(catX - 2 - i * 2 - Math.floor(age / 6), catY + 6 - Math.floor(age / 8), mix(0xdddddd, top, age / 30))
      }
    }
  }

  // Super saiyan: a flickering golden aura round the cat.
  if (saiyanAge !== undefined) {
    const rx = (spriteW + 6) / 2
    const cx = catX - 4 + rx
    const cy = catY + 3
    for (let y = 0; y < H; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / 4.2) ** 2
        if (d > 0.7 && d < 1.2 && hash(x * 31 + y * 7 + frame) > 0.45) {
          set(x, y - mod(Math.floor((frame + x) / 2), 2), hash(x + y + frame) > 0.8 ? 0xffffff : 0xffee33)
        }
      }
    }
  }

  // The cat.
  const step = isStumbling || rocketAge !== undefined ? mod(frame, 2) : mod(Math.floor(frame / 2), 2)
  const flipY = isUpsideDown
  sprite(TAILS[step] ?? [], catX - 3, catY + 2, { flipY })
  sprite(LEGS[step] ?? [], catX, flipY ? catY - 1 : catY + 6)
  sprite(extra > 0 ? fatTart(extra) : TART, catX, catY, { flipY })
  const isBlinking = !scene.isWorking && !scene.isAsleep && mod(frame, 70) < 3
  const head: HeadKind =
    (isCrashing && t < 0.7) || (brakeAge !== undefined && brakeAge < BRAKE_SLIDE + 6)
      ? 'shocked'
      : rainAge !== undefined
        ? 'sad'
      : blushAge !== undefined
        ? 'blush'
        : scene.isTired || scene.isAsleep
          ? 'sleepy'
          : isBlinking
            ? 'blink'
            : 'normal'
  sprite(HEADS[head], headX, catY + 1, { flipY })
  // Hats sit on the row above the head; the top one is cut where there is none.
  if (!flipY) {
    const hat =
      saiyanAge !== undefined
        ? SAIYAN_HAIR
        : wizardAge !== undefined
          ? WIZARD_HAT
          : scene.holiday === 'christmas'
        ? SANTA_HAT
        : scene.holiday === 'birthday'
          ? PARTY_HAT
          : scene.hasCrown
            ? CROWN
            : undefined
    if (hat) sprite(hat, hat === SAIYAN_HAIR ? headX : headX + 1, catY - 1)
  }
  // Napping: a cloud for a bed, over the paws.
  if (scene.isAsleep) {
    for (let dx = -3; dx < 18; dx++) {
      for (let dy = 6; dy < H - catY; dy++) {
        const edge = dy === 6 && (dx < -1 || dx > 15)
        if (!edge) set(catX + dx, catY + dy, shade(dy === 6 ? 0xffffff : 0xe4eefa))
      }
    }
  }

  // Marks beside the head (the band has no room above it).
  const markX = headX + 8
  if (!isCrashing) {
    if (parchmentAge !== undefined) {
      // Unrolls over its first frames.
      const open = Math.min(PARCHMENT.length, 1 + Math.floor(parchmentAge / 3))
      sprite(PARCHMENT.slice(0, open), headX + 7, catY + 1)
    } else if (scene.isWaiting) {
      if (mod(frame, 20) < 14) sprite(QUESTION, markX, Math.max(0, catY + 1), { depth: 0 })
    } else if (scene.isSearching) {
      sprite(BINOCULARS, headX + 5, catY + 2)
      sprite(QUESTION, markX + 4 + mod(-frame, 24), catY + 1, { colours: { W: 0xffdd33 } })
    } else if (scene.isTired || scene.isAsleep) {
      const rise = mod(Math.floor(frame / 8), 3)
      sprite(ZED, markX + rise * 2, Math.max(0, catY + 2 - rise), { depth: 0 })
    }
    if (waveAge !== undefined) {
      // Sparkles thrown off the loop.
      for (let i = 0; i < 4; i++) {
        const sx = headX + 2 + Math.round(Math.cos(waveAge / 3 + i * 1.6) * (6 + waveAge / 4))
        const sy = 3 + Math.round(Math.sin(waveAge / 3 + i * 1.6) * 3)
        sprite(SPARKS[mod(waveAge + i, SPARKS.length)] ?? [], sx, sy, { depth: 1 })
      }
    }
    if (goldAge !== undefined) sprite(COIN, catX - 6, catY + mod(Math.floor(frame / 4), 2))
    if (rainAge !== undefined) drawRain(rainAge, headX, H, frame, set)
    if (highFiveAge !== undefined) {
      // In from the right, a touch at the cat's head, then off up and away.
      const p = highFiveAge / DURATION.highfive
      const meet = headX + 8
      const mx = p < 0.45 ? Math.round(W - (W - meet) * (p / 0.45)) : p < 0.6 ? meet : Math.round(meet + (p - 0.6) * 60)
      const my = p < 0.6 ? catY + 1 : catY + 1 - Math.round((p - 0.6) * 12)
      for (let k = 1; k <= 6; k++) MINI_RAINBOW.forEach((c, s) => set(mx + 6 + k, my + s, c))
      sprite(MINI, mx, my, { flipX: true })
      if (p >= 0.4 && p < 0.75) {
        sprite(SPARKS[mod(highFiveAge, SPARKS.length)] ?? [], meet - 2, catY, { depth: 0 })
        sprite(SPARKS[mod(highFiveAge + 1, SPARKS.length)] ?? [], meet - 1, catY + 4, { depth: 0 })
      }
    }
    if (visitor?.kind === 'owl') drawOwl(frame - visitor.at, headX, catY, W, frame, sprite)
  }

  // Holidays: confetti for a new year or a birthday, snow at Christmas.
  if (!isCrashing && (scene.holiday === 'newyear' || scene.holiday === 'birthday')) {
    for (let i = 0; i < Math.ceil(W / 5); i++) {
      const x = mod(Math.floor(hash(i * 7 + 1) * W) + Math.round(Math.sin((frame + i * 9) / 7) * 2), W)
      const y = mod(Math.floor(hash(i * 11 + 2) * H) + Math.floor(frame / 3), H)
      set(x, y, CONFETTI[i % CONFETTI.length] ?? 0xffffff)
    }
  } else if (!isCrashing && scene.holiday === 'christmas') {
    for (let i = 0; i < Math.ceil(W / 6); i++) {
      const x = mod(Math.floor(hash(i * 5 + 3) * W) + Math.round(Math.sin((frame + i * 13) / 9)), W)
      const y = mod(Math.floor(hash(i * 3 + 9) * H) + Math.floor(frame / 5), H)
      set(x, y, 0xffffff)
    }
  }

  // Shake: the whole layer moves by a decaying random offset.
  const px = new Uint32Array(W * H)
  const amp = isCrashing ? Math.max(0, 1 - t * 1.4) * 3 : 0
  // The stop at the end of a brake jolts everything a pixel forward.
  const jolt = brakeAge !== undefined && brakeAge >= BRAKE_SLIDE && brakeAge < BRAKE_SLIDE + 3 ? -1 : 0
  const sx = Math.round((hash(frame * 2 + 1) - 0.5) * 2 * amp) + jolt
  const sy = Math.round((hash(frame * 2 + 2) - 0.5) * amp)
  for (let y = 0; y < H; y++) {
    const yy = Math.min(H - 1, Math.max(0, y + sy))
    for (let x = 0; x < W; x++) {
      const xx = Math.min(W - 1, Math.max(0, x + sx))
      px[y * W + x] = layer[yy * W + xx] ?? 0
    }
  }

  if (isCrashing) drawAsteroids(px, W, H, crashAge ?? 0, frame)
  if (wipeAge !== undefined) drawWipe(px, W, H, wipeAge)

  return { width: W, height: H, px }
}

// A grey cloud over the cat's head, raining on it.
const drawRain = (age: number, headX: number, H: number, frame: number, set: SetPixel) => {
  const cx = headX + 3
  for (let dx = -6; dx <= 6; dx++) {
    const h = Math.abs(dx) > 4 ? 1 : 2
    for (let y = 0; y < h; y++) set(cx + dx, y, y === h - 1 ? 0x474b5a : 0x5f6476)
  }
  if (age < 6) return
  for (let i = 0; i < 6; i++) {
    const x = cx - 5 + i * 2
    const y = 2 + mod(Math.floor(frame / 2) + i * 3, H - 2)
    set(x, y, 0x7fb2ff)
  }
}

// The owl flies in beside the cat's head, stays to advise, and flies off.
const drawOwl = (age: number, headX: number, catY: number, W: number, frame: number, sprite: DrawSprite) => {
  const p = age / DURATION.owl
  const perch = headX + 16
  const x = p < 0.2 ? Math.round(W - (W - perch) * (p / 0.2)) : p < 0.8 ? perch : perch + Math.round((p - 0.8) * 5 * 20)
  const y = p < 0.8 ? Math.max(0, catY) + (p < 0.2 ? 0 : mod(Math.floor(age / 10), 2)) : Math.max(0, catY) - Math.round((p - 0.8) * 20)
  const isFlying = p < 0.2 || p >= 0.8
  const wings = isFlying ? mod(Math.floor(age / 3), 2) : 1
  const blink = !isFlying && mod(age, 40) < 3
  const rows = (OWL[wings] ?? []).map((row, i) => (blink && i === 2 ? row.replace(/W/g, 'N') : row))
  sprite(rows, x, y, { depth: 0 })
  // A spark of an idea while it perches.
  if (!isFlying && mod(Math.floor(frame / 6), 3) === 0) sprite(SPARKS[1] ?? [], x + 7, y, { depth: 0, colours: { W: 0xffdd33 } })
}

// A wiper sweeps left to right: clean behind it, misted ahead.
const drawWipe = (px: Uint32Array, W: number, H: number, age: number) => {
  const bar = Math.round((age / DURATION.wipe) * (W + 6)) - 3
  for (let y = 0; y < H; y++) {
    for (let x = Math.max(0, bar + 2); x < W; x++) px[y * W + x] = mix(px[y * W + x] ?? 0, 0x9aa6b8, 0.55)
    for (let x = bar; x < bar + 2; x++) if (x >= 0 && x < W) px[y * W + x] = 0x1c1c22
    if (bar - 1 >= 0 && bar - 1 < W) px[y * W + bar - 1] = 0xffffff
  }
}

const drawVisitor = (kind: VisitorKind, age: number, W: number, H: number, set: SetPixel, sprite: DrawSprite) => {
  const p = age / DURATION.visitor
  if (kind === 'ufo') {
    // Drifts right to left along the top, beaming now and then.
    const x = Math.round(W + 8 - (W + 16) * p)
    const lights = mod(Math.floor(age / 3), 2) ? 0xffdd33 : 0xff3366
    sprite(UFO, x, 0, { colours: { ...PALETTE, Y: lights } })
    if (mod(Math.floor(age / 20), 3) === 0) for (let y = 4; y < H; y++) set(x + 3, y, 0x66ff99)
  } else if (kind === 'tacnayn') {
    // Flies the other way, its grey rainbow behind it on the right.
    const x = Math.round(W + 4 - (W + 60) * p)
    const y = Math.floor((H - SPRITE_H) / 2)
    for (let k = 13; k < 40; k++) {
      const wave = mod(Math.floor((x + k + age) / 6), 2)
      GREYS.forEach((c, i) => set(x + k, y + i + wave, c))
    }
    const colours = { ...PALETTE, ...TAC_COLOURS }
    sprite(TART, x + 4, y, { colours })
    sprite(HEADS.normal, x, y + 1, { colours, flipX: true })
  } else if (kind === 'birds') {
    const x0 = Math.round(W + 4 - (W + 30) * p)
    const flap = mod(Math.floor(age / 4), 2)
    const flock = [
      [0, 2],
      [4, 1],
      [8, 0],
      [4, 3],
      [8, 4],
    ]
    for (const [dx = 0, dy = 0] of flock) sprite(BIRD[flap] ?? [], x0 + dx, dy, { depth: 1 })
  }
}

// Asteroids streak down-left, each with a fiery tail, flashing, and burst on
// the ground. Drawn last and never darkened.
const drawAsteroids = (px: Uint32Array, W: number, H: number, age: number, frame: number) => {
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c
  }
  const count = Math.max(6, Math.ceil(W / 14))
  const flash = [0xffffff, 0xffff66, 0xffaa00, 0xffffcc]
  for (let i = 0; i < count; i++) {
    const born = Math.floor(hash(i * 7 + 3) * DURATION.crash * 0.6)
    const life = age - born
    const fall = 8 + Math.floor(hash(i * 11 + 5) * 6)
    if (life < 0) continue
    const startX = Math.floor(hash(i * 13 + 1) * (W + H)) + 4
    const dx = 1 + hash(i * 17 + 9) * 1.5
    const progress = life / fall
    if (progress <= 1) {
      const hy = Math.round(progress * (H - 1))
      const hx = Math.round(startX - hy * dx)
      for (let k = 1; k <= 7; k++) {
        const c = k <= 2 ? 0xffcc33 : k <= 4 ? 0xff6600 : 0xaa1100
        set(Math.round(hx + k * dx), hy - k, c)
      }
      const head = flash[(frame + i) % flash.length] ?? 0xffffff
      set(hx, hy, head)
      set(hx + 1, hy, head)
      set(hx, hy - 1, head)
    } else if (life - fall < 5) {
      const hx = Math.round(startX - (H - 1) * dx)
      const r = life - fall
      const c = mix(0xffff99, 0xff3300, r / 5)
      for (let k = -r - 1; k <= r + 1; k++) set(hx + k, H - 1, c)
      for (let k = -r; k <= r; k++) set(hx + k, H - 2, c)
      set(hx, H - 3 - Math.floor(r / 2), 0xffffff)
    }
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const base64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]
    out += B64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? B64[n & 63] : '='
  }

  return out
}

const HALF = 0x2580 // '▀'
const LOWER = 0x2584 // '▄'
const SPACE = 0x20

// A cell's glyph and colours, leaving a clear pixel to the terminal.
const cellOf = (top: number, bottom: number): [number, number, number] =>
  top === CLEAR ? (bottom === CLEAR ? [SPACE, CLEAR, CLEAR] : [LOWER, bottom, CLEAR]) : [HALF, top, bottom]

// The frame as Raster cells: one cell per two stacked pixels.
export const toCells = (f: Frame): { columns: number; rows: number; cells: string } => {
  const rows = Math.floor(f.height / 2)
  const words = new Uint32Array(f.width * rows * 3)
  let i = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < f.width; x++) {
      const [glyph, fg, bg] = cellOf(f.px[2 * y * f.width + x] ?? 0, f.px[(2 * y + 1) * f.width + x] ?? 0)
      words[i++] = glyph
      words[i++] = fg
      words[i++] = bg
    }
  }

  return { columns: f.width, rows, cells: base64(new Uint8Array(words.buffer)) }
}

const hex = (c: number) => (c === CLEAR ? undefined : `#${c.toString(16).padStart(6, '0')}`)

// The frame as Text runs per cell row, for surfaces with no Raster.
export const toRuns = (f: Frame): Run[][] => {
  const out: Run[][] = []
  for (let y = 0; y < Math.floor(f.height / 2); y++) {
    const runs: Run[] = []
    for (let x = 0; x < f.width; x++) {
      const [glyph, top, bottom] = cellOf(f.px[2 * y * f.width + x] ?? 0, f.px[(2 * y + 1) * f.width + x] ?? 0)
      const text = String.fromCharCode(glyph)
      const fg = hex(top)
      const bg = hex(bottom)
      const last = runs[runs.length - 1]
      if (last && last.fg === fg && last.bg === bg) last.text += text
      else runs.push({ text, fg, bg })
    }
    out.push(runs)
  }

  return out
}
