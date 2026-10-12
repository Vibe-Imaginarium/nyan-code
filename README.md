# nyan-code

A pixel nyan cat for [Claude Code](https://claude.com/claude-code). The cat flies in a thin band above the prompt and reacts to what happens in your session: failed commands, passing tests, commits, pushes, edits, skills, subagents, interrupts, `/clear`, permission dialogs, how full the context is, and the time of day.

## Install

Inside Claude Code, add this repo as a plugin marketplace and install the plugin:

```
/plugin marketplace add Vibe-Imaginarium/nyan-code
/plugin install nyan-pixel@nyan-code
```

Restart Claude Code (or start a new session). The cat appears above the prompt.

### Install from a local clone

```sh
git clone git@github.com:Vibe-Imaginarium/nyan-code.git
```

Then, in Claude Code:

```
/plugin marketplace add /path/to/nyan-code
/plugin install nyan-pixel@nyan-code
```

### Update

```
/plugin marketplace update nyan-code
```

## Commands

| Command | What it does |
|---|---|
| `/nyan` | Show or hide the band. The choice is remembered. |
| `/nyan-fx <effect>` | Play an effect now. Moods and holidays stay for about 6 seconds. `/nyan-fx disco` toggles disco on and off. |
| `/nyan-time <HH:MM> [day]` | Pretend it is another hour, and optionally another weekday (`0`–`6`, `5` = Friday). `/nyan-time off` goes back to real time. |
| `/nyan-help [effect]` | Show the help, or describe one effect. |

Examples:

```
/nyan-fx rocket
/nyan-fx christmas
/nyan-time 22:30
/nyan-time 16 5     # Friday 16:00, disco time
/nyan-help storm
```

## Triggers and effects

Each effect below fires on its own when its trigger happens. Any of them can also be played by hand with `/nyan-fx <name>`.

### Events

| Effect | What you see | Trigger |
|---|---|---|
| `crash` | An asteroid hits the cat | A tool call fails, or a turn ends with an error (e.g. a build exits with code 2). Exit code 1 from `grep`, `rg`, `diff`, `test` and similar, or exit code 1 with no output, is ignored. |
| `rain` | Rain | A test command fails |
| `fireworks` | Fireworks | A test command passes: `pytest`, `jest`, `vitest`, `mocha`, `rspec`, `phpunit`, `ctest`, `cargo/go/bun/deno/mix/dotnet test`, `npm/pnpm/yarn test`, `make test`/`make check`, `plugin test` |
| `gold` | Golden rainbow | `git commit` succeeds |
| `rocket` | Rocket boost | `git push` succeeds |
| `cookie` | A cookie flies into the cat's mouth | A file is edited or written (`Edit`, `Write`, `NotebookEdit`) |
| `wave` | The cat waves | Claude finishes its answer |
| `blush` | The cat blushes | You decline a permission dialog |
| `clear` | The sky clears | Compaction finishes |
| `wizard` | Wizard hat | A skill is used |
| `owl` | An owl flies by | The advisor gives its advice |
| `highfive` | A mini cat flies in for a high five | A subagent finishes |
| `brake` | Screeching stop | You interrupt Claude (Esc) |
| `scroll` | A long letter (parchment) | Your prompt has 800+ characters or 12+ lines |
| `wipe` | A wiper sweeps the sky; the cat starts from the left | `/clear` |
| `saiyan` | Super Saiyan: golden aura and extra speed | Your prompt contains the word "nyan" |
| `disco` | Disco sky | Friday from 15:00 (*Friday disco* option). `/nyan-fx disco` toggles it. |

### Visitors

| Effect | What you see | Trigger |
|---|---|---|
| `ufo` | A UFO | Random: every 30 s there is a chance a visitor comes by (*Visitors* option) |
| `tacnayn` | Tac nayn | Same as above |
| `birds` | A flock of birds | Same as above; on Halloween visitors are bats and come more often |

### Moods (last as long as the state does)

| Effect | What you see | Trigger |
|---|---|---|
| `working` | The cat flies faster | Claude is working on a turn |
| `tired` | The rainbow fades, the cat is tired | A single turn has run for over 2 minutes |
| `wait` | The cat stops and waits | A permission dialog is open |
| `search` | Searching | A `WebSearch` or `WebFetch` is running |
| `storm` | Clouds, then a storm with lightning | The context fills toward compaction (clouds start at a quarter of the way); also while compacting |
| `agents` | Mini cats fly along | Subagents are running |
| `sleep` | The cat naps on a cloud, the band slows to 2 fps | Nothing happened for the *Nap after* minutes |
| `streak` | A longer, glittering rainbow | Successful tool calls in a row; any `crash` or `rain` resets it |
| `crown` | A crown | Only by hand: `/nyan-fx crown` |

### Holidays (*Holidays* option)

| Effect | What you see | When |
|---|---|---|
| `newyear` | Confetti | January 1 |
| `christmas` | Santa hat and snow | December 20–26 |
| `halloween` | Halloween colours and bats | October 31 |
| `birthday` | Party hat and confetti | Your birthday, set as `MM-DD` in the *Birthday* option |

The sky also follows the clock: night after dark, with dawn and dusk in between.

## Options

Set them in `/plugin` → `nyan-pixel` → configure.

| Option | Values | Default | What it does |
|---|---|---|---|
| Band height | `4`, `5` | `4` | Terminal rows the band takes |
| Frames per second | `20`, `10` | `20` | `10` halves the animation work |
| Visitors | `normal`, `rare`, `often`, `off` | `normal` | How often a UFO, tac nayn or birds fly by |
| Friday disco | on / off | on | Disco sky on Friday from 15:00 |
| Holidays | on / off | on | New Year, Christmas, Halloween and birthday effects |
| Nap after | `3`, `5`, `10`, `off` | `5` | Idle minutes before the cat naps |
| Birthday | `MM-DD` or empty | empty | Your birthday for a party hat and confetti |

## Development

```
nyan-code/
├── .claude-plugin/
│   ├── marketplace.json   # marketplace "nyan-code" with one plugin
│   └── plugin.json        # manifest and options
├── hooks/
│   ├── hooks.json         # loads register.tsx
│   ├── register.tsx       # hooks, commands, scene state
│   ├── pixels.ts          # drawing the band
│   └── sprites.ts         # pixel sprites
└── tests/
```

Run the tests from the repo root:

```sh
claude plugin test
```

After changing the code, bump `version` in `.claude-plugin/plugin.json` and run `/plugin marketplace update nyan-code` so Claude Code picks up the new version.
