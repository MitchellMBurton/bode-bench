# Power User UX Direction

## Position

Bach Cello Console should behave like an analytical workstation, not a media app with extra graphs.

The target user is fast, technically literate, curious, and willing to learn a dense instrument if the density is structured. The system should reward expertise with speed, not hide capability behind consumer-app simplification.

## Core Rule

Global controls should answer four questions immediately:

1. What workspace am I in?
2. What measurement mode am I in?
3. What can I change safely right now?
4. Where do I go to understand what I am seeing?

If a control does not help with one of those questions, it should not live in the global header.

## Workspace Bar

The current layout header should evolve into a `Workspace Bar`, not a generic settings row.

Recommended structure:

- Left cluster: workspace identity and layout selection
- Center cluster: workspace actions
- Right cluster: global modes and interpretation access

Recommended controls:

- `Workspace` dropdown
  - Default Analysis
  - Spectral Focus
  - Performance Review
  - Harmonic Study
  - User presets
- `Save`
  - Save current workspace
- `Save As`
  - Duplicate current workspace into a named preset
- `Reset`
  - Restore current workspace to its baseline definition
- `Refresh`
  - Repaint panels and recover from stale visual state without resetting transport
- `Inspect`
  - Toggle informatics overlays globally
- `Guide`
  - Open the interpretation page

Recommended non-controls:

- active workspace name
- dirty state marker when layout/settings differ from saved preset
- compact session state such as `NGE`, `MONO`, or future trace modes

## Dropdown Behavior

The workspace selector should not be a generic browser select.

It should be a styled command palette style menu with:

- preset name
- one-line use case
- optional icon or tag
- keyboard focus support
- recent selection memory

Each preset entry should preview intent, for example:

- `Default Analysis`
  - balanced diagnostic layout for general listening
- `Spectral Focus`
  - larger spectrogram and response surfaces
- `Performance Review`
  - stronger transport and phrase-level comparison emphasis
- `Harmonic Study`
  - expanded ladder, pitch, and band emphasis

## Workspace Model

Treat `layout` and `workspace` as related but not identical concepts.

`Layout` is geometry:

- split ratios
- panel visibility
- panel placement

`Workspace` is the full analytical state:

- layout
- enabled overlays
- display mode
- scroll preferences
- panel-specific view options

This distinction matters because power users do not just want resized panes. They want named working contexts.

## Informatics Overlay System

The informatics overlay should be a first-class reading aid, not a help tooltip layer.

Each panel should support three states:

- `Off`
- `Hover`
  - quick hint on demand
- `Pinned`
  - persistent explanatory layer

Each panel overlay should contain the same five blocks:

- `What`
  - what the panel measures
- `How to Read`
  - axes, scales, and update cadence
- `What Matters`
  - the primary cues to watch for
- `Interpretation`
  - what typical patterns imply musically or technically
- `Controls`
  - shortcuts and local interactions

Example for the spectrogram:

- What: spectral energy over time on a log-frequency axis
- How to Read: right edge is newest, brighter means stronger energy
- What Matters: harmonic ladders, bow noise, transient brightness, resonant bloom
- Interpretation: stable horizontal stacks imply harmonic steadiness; diffuse high-band energy implies noise or air
- Controls: mode switch, scroll speed, future freeze/export actions

## Overlay Presentation

The overlay must not destroy the measurement surface beneath it.

Recommended treatment:

- translucent dark plate
- monospace labels
- one accent color per mode
- anchored to the panel chrome
- subtle enter and exit motion
- no blur-heavy glass effects

The panel should remain legible underneath, so the user can learn while observing live data.

## Interpretation Page

The interpretation page should be an `Atlas`, not a marketing help page.

Recommended sections:

- `System Overview`
  - signal path, frame bus, transport, display modes
- `Panel Atlas`
  - one section per panel with annotated screenshot
- `Reading Patterns`
  - common relationships across waveform, pitch, loudness, and spectrum
- `Diagnostic Playbook`
  - examples such as resonance, bow noise, articulation, clipping, drift
- `Shortcuts`
  - global and panel-level commands

The page should use the same visual language as the console so it feels like part of the instrument.

## Interaction Model

Recommended keyboard model:

- `Ctrl+1..4`
  - switch workspace preset
- `Ctrl+S`
  - save workspace
- `Ctrl+Shift+S`
  - save workspace as
- `F1`
  - open guide
- `I`
  - toggle inspect overlays
- `R`
  - refresh current workspace surfaces

Power users should be able to operate the system without leaving the keyboard for common actions.

## Rollout Order

Build this in phases:

1. Workspace bar with styled dropdown and explicit save/reset actions
2. Serializable workspace model
3. Global inspect toggle and one complete panel overlay
4. Overlay support on every panel
5. Atlas page with annotated screenshots and reading guide

This order keeps the product coherent and prevents the header from becoming a random pile of controls.
