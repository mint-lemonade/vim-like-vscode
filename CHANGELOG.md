# Change Log

## [Unreleased]

### [Fixed]

- Fix single quote `'` not working as surround input due to recently added yank motions `'[` `']`

## [v0.7.1]

### [Added]

- Added missing 'U' key to redo.

## [v0.7.0]

### [Added]

- `'[` and `']` Motion to move to start and end of last yanked range.

### [Fixed]

- Minor vertical motion optimization.
- Fix occasional erratic cursor movement in paragraph motion.

## [v0.6.1]

### [Fixed]

- Fix cursor positon after yank

  - for linewise yank cursor remains unchanged
  - for charwise yank cursor moves to start of yanked range

- Fix cursor sometimes jumping to next line on 'L' (move char right) motion
