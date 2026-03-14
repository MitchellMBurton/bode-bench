# Power User UX Direction

## Position

The console should behave like an analytical workstation, not a media app with extra graphs.

The target user is fast, technically literate, curious, and willing to learn a dense instrument if the density is structured. The system should reward expertise with speed, not hide capability behind consumer-app simplification.

## Core Rule

Global controls should answer four questions immediately:

1. What workspace am I in?
2. What measurement mode am I in?
3. What can I change safely right now?
4. Where do I go to understand what I am seeing?

If a control does not help with one of those questions, it should not live in the global header.

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

## Direction

The broader product direction is general-purpose media analysis. Workspace presets should reflect use cases like:

- default analysis
- spectral focus
- review / comparison
- pitch and tuning study
- user-defined specialist layouts

The older Bach-specific framing is now an example workflow, not the UX container for everything else.
