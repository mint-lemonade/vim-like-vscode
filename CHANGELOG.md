# Change Log

## [Unreleased]

### [Added]

- `\'\[` and `\'\]` Motion to move to start and end of last yanked range.

### [Fixed]

- Minor vertical motion optimization.
- Fix occasional erratic cursor movement in paragraph motion.

## [v0.6.1]

### [Fixed]

- Fix cursor positon after yank

  - for linewise yank cursor remains unchanged
  - for charwise yank cursor moves to start of yanked range

- Fix cursor sometimes jumping to next line on 'L' (move char right) motion
