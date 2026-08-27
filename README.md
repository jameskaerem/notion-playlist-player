# Deep Focus Tracker

An embeddable Notion focus timer with deterministic focus/break cycles, task-owned global soundtrack playback, task-aware checklists, exact active-time logging, statistics, and cross-device synchronization.

## V21: reliable confirmation transitions

Confirmation now uses a guarded single transition:

- One click reliably starts Break after Focus.
- One click reliably starts Focus after a Short or Long Break.
- Rapid repeated clicks cannot create duplicate DFB rows, increment the cycle multiple times, or start overlapping timer intervals.
- A pending overtime DFB is saved once before Break starts.
- The Play button is temporarily locked only while the confirmation transition is being committed.

## Checklists

A new top-level **Checklists** view contains two phase-aware lists:

- **Focus checklist** belongs only to the selected parent task and synchronizes with that task across devices.
- **Break checklist** is global across all tasks and devices.
- Items can be added, completed, uncompleted, and removed.
- Checklists support up to 50 items with 120 characters per item.
- When the timer changes to Focus, the Focus checklist is selected automatically.
- When the timer changes to a Short or Long Break, the Break checklist is selected automatically.
- Break checkmarks reset at the start of every new break while the reusable item list remains saved.

## Per-phase playlist playback

Focus and Break now have independent global playback modes:

- **Loop playlist** continuously repeats the full playlist.
- **Play playlist once** plays every item once and then stops.

A play-once playlist automatically becomes ready again when the next matching Focus or Break phase starts. This works with Sequential and Shuffle ordering and synchronizes across tasks and devices.

## Completion dialog

The planned-completion dialog is marked as shown as soon as it opens. After choosing **Continue**, it cannot reappear during later above-plan blocks or after a Long Break.

## Timer actions

**Reset** and **Finish task** now share the same dimensions, border, radius, and spacing. Their different colors still communicate safe versus destructive actions.

## V20: confirmation overtime

With **Require confirmation**, the DFB **Focus block** date range ends at the confirmation-click time and includes negative overtime. Pending completion survives refresh and cross-device synchronization.

## Deployment

Deploy the complete ZIP to Vercel and keep the variables from `.env.example`. Every release archive is a complete cumulative snapshot. No Notion template or environment-variable change is required.
