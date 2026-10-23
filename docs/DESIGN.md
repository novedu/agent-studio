# Agent Studio Design Philosophy

Version: 4.0

## Purpose

This document defines the visual and conceptual design philosophy for Agent Studio.

It explains **what the product should feel like** and **what design attitudes are allowed**. It does not define detailed interaction flows or component implementation rules. Those live in `UX.md` and `DESIGN_SYSTEM.md`.

## Design Identity

Agent Studio is an enterprise Agent Runtime Studio.

It should feel:

- Professional
- Engineering-focused
- Runtime-first
- Minimal
- Dense
- Calm

Design references:

- Linear
- Cursor
- Raycast
- Vercel
- OpenAI Platform
- Claude Console
- GitHub

## Design Principles

### Runtime First

The runtime is the product. All visual decisions should support understanding the agent runtime.

### Explainability

Every screen should help answer:

- What happened?
- Why?
- How long did it take?
- What evidence supports it?

### Progressive Disclosure

Show the minimum necessary information first. Reveal deeper details only when the user asks for them or selects a runtime object.

### One Source of Truth

All visual states must derive from the same runtime context. The UI should never feel split across competing interpretations.

### Evidence Before Conclusion

Final answers must always be backed by visible evidence such as knowledge, memory, trace, logs, or evaluation.

## Visual Language

Allowed tone:

- Neutral gray base
- Blue primary runtime accent
- Green success
- Amber knowledge and warning
- Purple memory
- Teal reflection and evaluation
- Red error

Avoid:

- Consumer-style decoration
- Heavy gradients
- Excessive glass effects
- Marketing empty space
- Admin-template visuals

## Typography

Use:

- `Inter` for UI
- `JetBrains Mono` for code and metrics

Type scale:

- H1: 18
- H2: 16
- Body: 14
- Caption: 12
- Code: 12

## Spacing and Shape

Use only the shared spacing and radius scales defined in `DESIGN_SYSTEM.md`.

## Runtime Density

Agent Studio should feel dense because it is an engineering runtime workspace, but density must never reduce explainability.

Density rules:

- Chat remains the largest and calmest surface.
- Runtime Graph is a compact visualization strip, not the primary workspace.
- Timeline is a debug flow, not a dashboard table.
- Inspector owns deep evidence, trace, memory, and evaluation details.
- Metrics are contextual and should not turn the workspace into a KPI dashboard.

Information should be layered:

```text
Primary: Chat and current runtime status
Secondary: Runtime graph and flow timeline
Deep detail: Inspector, drawer, evidence, logs
```

## Workspace Hierarchy

Workspace hierarchy is fixed:

```text
Runtime Banner
↓
Task Workspace
↓
Runtime Visualization Strip
↓
Debug Flow Timeline
↓
Status Bar
```

The right inspector is fixed and always describes the selected runtime object.

Graph, Timeline, Evidence, Memory, Evaluation, and Logs must support the chat-led runtime experience. They must never compete with Chat as the primary workspace.

## Workspace Principle

Agent Workspace is not a dashboard.

Do not compose the core workspace from multiple independent cards with equal weight.

Core runtime regions should feel like IDE surfaces:

- Chat is the editor-like primary surface.
- Runtime Graph is a compact canvas strip.
- Timeline is a docked debug flow.
- Inspector is a continuous right-side object panel.

Cards are only appropriate for empty states, quick start choices, small metric widgets, dialogs, and popovers.

Avoid:

- Card / Card / Card / Card composition
- Large empty graph canvases
- Dashboard KPI strips in the primary workspace
- Equal visual weight across Chat, Graph, Timeline, and Inspector

Prefer:

- One connected workspace background
- Border-first panels
- Docked timeline
- Compact graph strip
- Object-focused inspector

## Related Documents

- `PRODUCT.md` for product positioning and screen blueprint
- `UX.md` for interaction, navigation, and state behavior
- `DESIGN_SYSTEM.md` for component and implementation standards
