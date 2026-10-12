// Sprite art and colours. A sprite is rows of palette letters; '.' is clear.

export const PALETTE: Record<string, number> = {
  K: 0x000000, // outline
  T: 0xffcc99, // crust
  P: 0xff99ff, // frosting
  S: 0xff3399, // sprinkle
  G: 0x999999, // fur
  W: 0xffffff, // white
  R: 0xff9999, // cheek
  B: 0xff2266, // blush
  Y: 0xffdd33, // gold
  O: 0xff9900, // orange
  C: 0x99ffff, // cyan
  M: 0xfff5c0, // moon
  D: 0x333333, // dark grey
  H: 0xdd1111, // hat red
  U: 0x33ccff, // party blue
  V: 0x6a3dc8, // wizard purple
  Z: 0xffff66, // saiyan gold
  N: 0x8b5a2b, // owl brown, scroll rods
  L: 0xf5e6b8, // parchment, owl belly
}

export const RAINBOW = [0xff0000, 0xff9900, 0xffff00, 0x33ff00, 0x0099ff, 0x6633ff]
export const GOLD = [0xfff3a0, 0xffe066, 0xffd11a, 0xffc400, 0xe6a800, 0xb38300]
export const GREYS = [0xdddddd, 0xbbbbbb, 0x999999, 0x777777, 0x555555, 0x333333]

// The cat, seven pixels tall: 9x6 tart, 7x5 head, legs and tail apart.
export const TART = ['KKKKKKKKK', 'KTPSPPPTK', 'KTPPPSPTK', 'KTSPPPPTK', 'KTPPSPPTK', 'KKKKKKKKK']
export const HEADS = {
  normal: ['.K...K.', 'KGKKKGK', 'KGKGKGK', 'KRGKGRK', '.KKKKK.'],
  shocked: ['.K...K.', 'KGKKKGK', 'KWKGKWK', 'KRKKKRK', '.KKKKK.'],
  blink: ['.K...K.', 'KGKKKGK', 'KGGGGGK', 'KRGKGRK', '.KKKKK.'],
  sleepy: ['.K...K.', 'KGKKKGK', 'KKKGKKK', 'KRGGGRK', '.KKKKK.'],
  blush: ['.K...K.', 'KGKKKGK', 'KGKGKGK', 'KBBKBBK', '.KKKKK.'],
  sad: ['.K...K.', 'KGKKKGK', 'KKKGKKK', 'KCGKGRK', '.KKKKK.'],
}
export type HeadKind = keyof typeof HEADS
export const TAILS = [
  ['KGG', '.KK'],
  ['.KK', 'KGG'],
]
export const LEGS = [['K.K..K.K'], ['.K.K..K.K']]
export const SPRITE_H = 7
export const HEAD_X = 6

// The tart widened by `extra` columns of frosting, for a cat that ate.
export const fatTart = (extra: number): string[] =>
  TART.map((row, y) => {
    const fill = y === 0 || y === TART.length - 1 ? 'K' : y % 2 ? 'P' : 'S'
    return row.slice(0, 4) + fill.repeat(extra) + row.slice(4)
  })

export const MINI = ['KKK.K.K', 'KSPKGGG', 'KPSKGKG', 'KKK.KKK']
export const MINI_RAINBOW = [0xff0000, 0xffff00, 0x0099ff]

export const COOKIE = ['TTT', 'TPT', 'TTT']
export const COIN = ['.Y.', 'YOY', '.Y.']
export const BINOCULARS = ['KK', 'DD']
export const QUESTION = ['WWW', '..W', '.WW', '...', '.W.']
export const ZED = ['WWWW', '..W.', '.W..', 'WWWW']
export const MOON = ['.MM.', 'M...', 'M...', '.MM.']

// Worn on the head, drawn from the row above it.
export const CROWN = ['Y.Y.Y', 'YYYYY']
export const SANTA_HAT = ['.HHHW', 'WWWW.']
export const PARTY_HAT = ['..Y..', '.UHU.']
export const WIZARD_HAT = ['..VV.', 'VVYVV']
// Super saiyan: spiky hair over the whole head.
export const SAIYAN_HAIR = ['Z.Z.Z.Z', 'ZZZZZZZ']

// A long prompt: the cat carries it as a scroll.
export const PARCHMENT = ['NLLLLN', 'NLDDLN', 'NLLLLN', 'NLDLLN', 'NLLLLN']
// The advisor: an owl, wings out and in.
export const OWL = [
  ['.N...N.', '.NNNNN.', 'NWKNWKN', 'N.LOL.N', '..LLL..', '..O.O..'],
  ['.N...N.', '.NNNNN.', '.WKNWK.', 'NNLOLNN', '.NLLLN.', '..O.O..'],
]

export const CONFETTI = [0xff3366, 0xffdd33, 0x33ff99, 0x33ccff, 0xcc66ff, 0xffffff]

export const SPARKS = [['...', '.W.', '...'], ['.W.', 'W.W', '.W.'], ['.W.', 'WWW', '.W.']]

export const UFO = ['..KKK..', '.KCCCK.', 'KDDDDDK', '.Y.Y.Y.']
export const BIRD = [
  ['K.K', '.K.'],
  ['...', 'KKK'],
]

// Tac nayn: the cat in greys, flying the other way.
export const TAC_COLOURS: Record<string, number> = {
  K: 0x111111,
  T: 0x555555,
  P: 0x7a7a7a,
  S: 0xbbbbbb,
  G: 0x3a3a3a,
  R: 0x666666,
  W: 0xffffff,
}

// Sky gradients through the day: hour, top, bottom.
export const SKY_KEYS: [number, number, number][] = [
  [0, 0x050a24, 0x1a2a5a],
  [5, 0x050a24, 0x1a2a5a],
  [6.5, 0x3a6fd0, 0xffb36b],
  [9, 0x1a5cc8, 0x7cc4ff],
  [17, 0x1a5cc8, 0x7cc4ff],
  [19, 0x4a2a8a, 0xff7a9a],
  [20.5, 0x050a24, 0x1a2a5a],
  [24, 0x050a24, 0x1a2a5a],
]

export const DISCO = [0xff00aa, 0x00ffcc, 0xffee00, 0x7a00ff, 0x00aaff, 0xff5500]
