# X-Ray Annotation Enhancement (Part 3)

## Status

Not Started

## Goals

1. **Keyboard Shortcuts Help Panel** -- In-app shortcut reference overlay (no PDF manual like MedDream)
2. **Drawing Confirmation UI** -- Accept/reject controls after drawing a line or shape
3. **Undo/Redo Toolbar Buttons** -- Move undo/redo from status bar into the main toolbar for visibility

---

## Research: MedDream DICOM Viewer (demo.meddream.com)

Conducted full Playwright-based research on MedDream 8.8.1. Key findings:

### What MedDream Does Well
- **Single-letter shortcuts** for power users (D=Line, A=Angle, B=Pencil, W=Windowing)
- **Split-button toolbar** -- click activates tool, dropdown arrow reveals sub-tools
- **Right-click context menu** for quick tool switching
- **Inline measurement labels** with lock/save icon on annotations
- **Blue endpoint handles** for post-draw adjustment
- **Orange/yellow annotation color** on dark background for high contrast
- **Viewport overlay metadata** -- patient info, zoom, window/level at corners

### Where MedDream Falls Short (Our Opportunities)
- **No undo/redo at all** -- only Delete Selected (Shift+D) and Delete All (Ctrl+Delete). SmartChiro already has full undo/redo history (100 commands) which is a major advantage.
- **No keyboard shortcuts help panel** -- F1 opens a 345-page PDF manual. Shortcuts are only discoverable via tooltip text. We can do much better with an in-app overlay.
- **No drawing confirmation UI** -- annotations are immediately committed. While fast, this can lead to accidental annotations. We can offer a quick confirm/cancel for precision work.
- **No annotation list panel** -- MedDream has "Show Angles" but no structured annotation list. Our existing PropertiesPanel with measurements summary is already superior.

### MedDream Shortcut Reference (for comparison)

| Key | Action |
|-----|--------|
| W | Windowing |
| T | Pan |
| Z | Zoom |
| D | Line |
| A | Angle |
| B | Pencil (freehand) |
| G | Arrow |
| N | Flexpoly |
| H | Continuous measurement |
| V | Intensity |
| E | Delete All |
| Shift+D / Delete | Delete selected |
| Ctrl+Delete | Delete all |
| Ctrl+F | Forward |
| Ctrl+E | Export |

---

## Feature 1: Keyboard Shortcuts Help Panel

### Behavior
- **Trigger**: Press `?` (question mark) key or click a `?` icon button in the toolbar
- **Display**: Full-screen modal overlay with semi-transparent dark backdrop
- **Close**: Press `Escape`, `?` again, or click outside the panel
- **Layout**: Two-column grid grouped by category, styled like VS Code's keyboard shortcuts overlay

### Shortcut Categories & Content

**Navigation**
| Shortcut | Action |
|----------|--------|
| H | Pan / Hand tool |
| Space (hold) | Temporary pan |
| Ctrl/Cmd + 0 | Fit to viewport |
| Ctrl/Cmd + 1 | Zoom to 100% |
| Ctrl/Cmd + = | Zoom in |
| Ctrl/Cmd + - | Zoom out |
| Scroll (Ctrl/Cmd + wheel) | Scroll zoom |

**Drawing Tools**
| Shortcut | Action |
|----------|--------|
| P | Freehand |
| L | Line |
| Shift + L | Polyline |
| A | Arrow |
| R | Rectangle |
| E | Ellipse |
| B | Bezier curve |
| T | Text |
| X | Eraser |

**Measurement Tools**
| Shortcut | Action |
|----------|--------|
| M | Ruler |
| Shift + M | Angle |
| Ctrl/Cmd + Shift + M | Cobb Angle |
| K | Calibration reference |

**Editing**
| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Ctrl/Cmd + C | Copy |
| Ctrl/Cmd + V | Paste |
| Ctrl/Cmd + D | Duplicate |
| Ctrl/Cmd + A | Select all |
| Delete / Backspace | Delete selected |
| Arrow keys | Nudge 1px |
| Shift + Arrow keys | Nudge 10px |
| [ | Send backward |
| ] | Bring forward |
| Ctrl/Cmd + S | Save |

**UI**
| Shortcut | Action |
|----------|--------|
| \\ | Toggle properties panel |
| ? | Toggle shortcuts help |
| Escape | Deselect / close dialog |

### Component

**File**: `src/components/annotation/KeyboardShortcutsPanel.tsx`

```tsx
// Modal overlay component
// Props: isOpen, onClose
// Renders categorized shortcut grid
// Uses Dialog from shadcn/ui with custom styling
// Dark semi-transparent backdrop matching annotation canvas theme (#1A1F36 at 90% opacity)
// White text on dark cards for readability
// Each shortcut row: <kbd> styled key + description
```

### Toolbar Integration
- Add a `?` button at the **far right** of the AnnotationToolbar
- Style: subtle ghost button, `text-[#697386]` default, `text-[#0A2540]` on hover
- Tooltip: "Keyboard Shortcuts (?)"

---

## Feature 2: Drawing Confirmation UI (Accept/Reject)

### Behavior
- After completing a drawn shape (line, ruler, arrow, rectangle, ellipse, freehand, angle, Cobb angle, calibration reference), show a small floating confirmation bar near the shape
- Two buttons: **checkmark** (accept, keep the shape) and **X** (reject, discard the shape)
- **Auto-accept**: If user starts drawing another shape or switches tools, the pending shape is auto-accepted
- **Keyboard**: `Enter` or `Y` to accept, `Escape` or `N` to reject
- **Timeout**: No auto-timeout -- waits for user decision

### When NOT to show confirmation
- **Text tool**: Text has its own inline editing flow
- **Eraser tool**: Deletion is immediate (can be undone)
- **Polyline/Bezier mid-drawing**: Don't show until the shape is completed (double-click / Enter to finish)

### UI Design

```
  ┌──────────┐
  │  ✓   ✕   │   ← floating bar near the drawn shape's midpoint
  └──────────┘
```

- **Position**: Anchored near the midpoint of the drawn shape, offset 12px below
- **Size**: 64px wide, 32px tall, `rounded-[6px]`
- **Background**: `#FFFFFF` with `shadow-md` and 1px `#E3E8EE` border
- **Accept button**: `#30B130` (success green) icon, hover bg `#E8F5E8`
- **Reject button**: `#DF1B41` (danger red) icon, hover bg `#FDE8EC`
- **Icons**: Lucide `Check` and `X`, size 16px, strokeWidth 2
- **Animation**: Fade in with 150ms transition

### State Management

Add to `useDrawingTools.ts`:
```typescript
interface PendingShape {
  shape: BaseShape;
  position: { x: number; y: number }; // screen coordinates for the confirmation bar
}

// New state:
// pendingShape: PendingShape | null
// On drawing completion: set pendingShape instead of committing immediately
// On accept: commit shape to canvas + push undo command
// On reject: discard shape, clear pendingShape
// On tool change or new drawing start: auto-accept pending shape
```

### Component

**File**: `src/components/annotation/DrawingConfirmation.tsx`

```tsx
// Floating confirmation bar
// Props: position: {x, y}, onAccept, onReject
// Positioned absolutely within the canvas viewport
// Transforms with viewport zoom/pan
// Uses portal to render above canvas layers
```

### Integration Points
- `useDrawingTools.ts` -- Shape completion flow (onPointerUp for drag tools, onDoubleClick/Enter for click tools)
- `AnnotationCanvas.tsx` -- Render DrawingConfirmation component when pendingShape exists
- `useCanvasInteraction.ts` -- Add Enter/Y/Escape/N keyboard handlers when pendingShape exists

---

## Feature 3: Undo/Redo Toolbar Buttons

### Current State
- Undo/redo buttons exist in the **StatusBar** (bottom of canvas, 28px height)
- StatusBar also shows cursor position, shape count, tool name, save status
- Buttons are small and easy to miss

### Changes

**Move undo/redo INTO the AnnotationToolbar** (the main tool row):
- Place undo/redo buttons at the **left end** of the toolbar, before the drawing tools
- Separator line between undo/redo group and the first tool (Hand)
- Remove undo/redo buttons from StatusBar

**Button Design:**
- Same icon style as other toolbar buttons (Lucide `Undo2` and `Redo2`, size 18px)
- **Enabled state**: `text-[#425466]`, hover `bg-[#F0F3F7]`
- **Disabled state**: `text-[#A3ACB9]` (30% opacity), `cursor-not-allowed`
- Tooltip: "Undo (Ctrl+Z)" / "Redo (Ctrl+Shift+Z)"
- Same tooltip style as other toolbar tools (400ms delay, shows label + shortcut)

### Files to Modify
- `src/components/annotation/AnnotationToolbar.tsx` -- Add undo/redo buttons at left
- `src/components/annotation/StatusBar.tsx` -- Remove undo/redo buttons
- `src/components/annotation/AnnotationCanvas.tsx` -- Pass canUndo/canRedo/undo/redo to AnnotationToolbar

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `src/components/annotation/KeyboardShortcutsPanel.tsx` | Shortcuts help modal overlay |
| `src/components/annotation/DrawingConfirmation.tsx` | Accept/reject floating bar |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/annotation/AnnotationToolbar.tsx` | Add undo/redo buttons (left), `?` button (right) |
| `src/components/annotation/AnnotationCanvas.tsx` | Render KeyboardShortcutsPanel + DrawingConfirmation, pass undo/redo props to toolbar |
| `src/components/annotation/StatusBar.tsx` | Remove undo/redo buttons |
| `src/hooks/useDrawingTools.ts` | Add pendingShape state, accept/reject flow |
| `src/hooks/useCanvasInteraction.ts` | Add `?` key handler, Enter/Escape for pending shape |

---

## Implementation Order

1. **Undo/Redo Toolbar Buttons** -- Simplest change, move buttons from StatusBar to AnnotationToolbar
2. **Keyboard Shortcuts Help Panel** -- New component + `?` key binding + toolbar button
3. **Drawing Confirmation UI** -- Most complex, requires changes to drawing tool state flow

---

## Acceptance Criteria

- [ ] Pressing `?` opens a categorized keyboard shortcuts overlay
- [ ] Shortcuts overlay can be closed with Escape, `?`, or clicking outside
- [ ] `?` button visible in toolbar with tooltip
- [ ] After drawing a line/shape, accept (checkmark) and reject (X) buttons appear near the shape
- [ ] Clicking accept commits the shape; clicking reject discards it
- [ ] Enter/Y accepts, Escape/N rejects via keyboard
- [ ] Starting a new drawing auto-accepts the pending shape
- [ ] Undo and redo buttons are in the main toolbar (left side)
- [ ] Undo/redo buttons show correct enabled/disabled states
- [ ] Undo/redo removed from status bar
- [ ] All existing shortcuts continue to work unchanged
- [ ] `npm run build` passes with no errors
