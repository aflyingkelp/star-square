# Perfect TAS demonstrations

Open **Watch perfect TAS** on the title screen or **Perfect TAS library** in the dan tree. Every built-in level has its own input tape: 233 regular/Plus trials, 500 generated archive maps, 60 4K LN stages, and 60 7K LN stages. Use the category selector, search, and pagination to find a level. The viewer offers pause, playback speeds from 0.25× to 8×, one-tick stepping, a tick counter, and the held inputs. Escape pauses or resumes playback.

A perfect tape must clear with zero hits and zero bombs. Each tape carries its own optimized weapon and upgrade loadout; demonstration gear is separate from a player's ranked run. Developer mode and noclip are disabled. Watching a demonstration does not award PP or change the player's stored progress.

Every Dan from Alpha through Omega has a four-lane Plus set, for 96 additional trials. Plus unlocks after clearing that base Dan, then progresses in order through Omega+. Plus pressure starts four ranks above the base Dan and rises toward rank 44; Omega+ keeps the 473 exact dash cues. The library contains a separately generated tape for every Plus trial.

## Replay format and timing

The game samples inputs on a deterministic 240 Hz clock. Existing movement and projectile physics advance every fourth tick (60 Hz), preserving their original speed and collision rules. A tape stores run-length encoded `[tickCount, inputMask]` pairs. Bits are left=1, right=2, up=4, down=8, fire=16, focus=32, sprint=64, dash=128. Bomb inputs are forbidden in verified tapes.

Omega checks dash key-down edges on exact simulation ticks. Its first cue is tick 288; subsequent cues are 12 ticks apart. All 473 must be correct. These ticks no longer depend on wall-clock time, display refresh rate, or timer scheduling. Input release is recorded as well, including early dash cancellation.

`tas-library.json` contains seeds, input tapes, earned loadouts, results, clear ticks, and expected end-state checksums. `tas-library.js` contains the same data for offline playback. A rules fingerprint rejects tapes generated for different game mechanics. `tas-verification.json` lists the independently replayed outcomes.

## Regenerate and verify

Requires Node.js 18 or newer, with no extra packages.

```sh
npm run tas:generate
npm run tas:verify
```

The planner uses the actual game code in `index.html`, looks ahead at projectile paths, tries normal movement and legal dashes, and rewinds failed routes. Those planning snapshots are not part of the finished replay. Validation starts in a fresh game instance and applies only the recorded inputs, with no rewinds or state edits.

Generation reuses compatible verified tapes. To re-plan a single trial:

```sh
npm run tas:generate -- jack-20 --force
```

Verification checks all 853 catalog levels, zero hits, zero bombs, equipment eligibility, clear timing, end-state checksums, and save isolation. It also corrupts a required timing input in each Omega and Omega+ tape and confirms that the altered run cannot clear.

For parallel generation, set STAR_SQUARE_TAS_OUTPUT to a separate JSON file for each worker. Workers independently verify their tapes before saving; merge their outputs only when the rulesHash matches the current engine, then run tas:verify on the complete library.
