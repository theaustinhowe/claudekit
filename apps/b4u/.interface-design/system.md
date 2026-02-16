# Interface Design System
## Project: B4U
Generated design system — every value is a design decision, not a default.

## Direction

### Cozy & Warm
- **Foundation:** Warm (purple/lavender tones)
- **Depth strategy:** Soft borders with generous radius
- **Base spacing:** 4px (all spacing as multiples of this)
- **UI patterns:** Rounded corners, friendly empty states, soft color palette, approachable sans-serif typography.

### Precision & Density
- **Foundation:** Warm purple
- **Depth strategy:** Borders with soft radius
- **Base spacing:** 4px (all spacing as multiples of this)
- **UI patterns:** Data tables, status indicators, compact cards, split panels, keyboard shortcuts.

## Tokens

### Spacing
- Base unit: 4px
- Scale: 4px / 8px / 12px / 16px / 24px / 32px
- Micro: 4px (icon gaps, tight pairs)
- Component: 8px–12px (inside buttons, cards)
- Section: 16px–24px (between groups)
- Major: 32px+ (between distinct areas)

### Border Radius
- Scale: 6px / 10px / 14px
- Small: inputs, buttons, badges
- Medium: cards, panels, chat bubbles
- Large: modals, containers

### Typography
- Stack: sans-serif (Geist), monospace for code only
- Headline: heavier weight, tight letter-spacing
- Body: comfortable weight, readable line-height
- Label: medium weight, works at small sizes
- Data: monospace, `font-variant-numeric: tabular-nums`

## Patterns

### Button
- Height: 36px
- Padding: 8px 16px
- Radius: 6px
- Font: 14px, 500 weight

### Card
- Padding: 16px
- Radius: 10px
- Depth: Soft borders
```css
border: 0.5px solid rgba(0, 0, 0, 0.08); /* light mode */
border: 0.5px solid rgba(255, 255, 255, 0.06); /* dark mode */
```

### Sidebar
- Same background as canvas (not different color)
- Subtle border for separation
- Width determined by content hierarchy

## Decisions

| Choice | Value | Why |
|--------|-------|-----|
| Depth | Soft borders | Cozy, approachable feel |
| Base spacing | 4px | Dense layout for information-heavy interfaces |
| Foundation | Warm purple | Sets the color temperature for all surfaces |
| Typography | Sans-serif (Geist) | Friendly and readable |
| Radius | 6px base | Soft, rounded feel |

## Implementation Notes
- Every token must trace to a primitive — no random hex values
- Surface elevation: barely different, still distinguishable
- Borders: low opacity rgba, disappear when not looking for them
- All interactive elements need hover, focus, active, disabled states
- Test in both light and dark modes if dark mode is enabled