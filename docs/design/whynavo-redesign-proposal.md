# WhyNavo Redesign Proposal

## Product intent

WhyNavo should feel like the place a person wants to begin the day, not a dashboard that asks for attention. The product is a private, local-first starting surface: immediate access to personal destinations, small useful information, and a workspace that the user can shape.

The redesign removes the current time-first composition. The first visual signal becomes a personal canvas containing large, crisp destinations and a small number of useful widgets. Search remains available but does not dominate the page.

## Visual directions

### A. Lucid Canvas

An airy daylight workspace with a photographic or illustrated wallpaper, restrained translucent surfaces, and generous empty space. Navigation is a slim overlay at the far edge; it never consumes the main canvas. This is the recommended default because it makes the product feel calm, personal, and immediately approachable.

### B. Editorial Utility

A warm, paper-like information workspace. Site collections use large real favicons, while every widget has a distinct material and silhouette: schedule ribbons, a stacked note, a focus dial, and a slim forecast. This direction supplies the best information hierarchy for users who return to WhyNavo many times a day.

### C. Night Studio

A deep, photographic evening workspace with charcoal glass, restrained cyan focus states, and a high-contrast content layer. It is an optional dark wallpaper scene, not the universal default. It adds emotion without forcing a dark visual identity on every user.

## Recommended direction

Combine Lucid Canvas with Editorial Utility. Default to a bright or lightly tinted wallpaper, use a dark theme only when the user chooses it, and let wallpaper mood determine the surface treatment. Night Studio becomes one of the polished built-in scenes.

## Experience rules

1. The navigation rail is independently positioned at the far left or right and vertically centered. It is never part of the page grid and cannot shift the central canvas.
2. The main canvas is a freeform drag surface. Shortcuts, groups, and widgets use the same spatial model, with clear snap lines and keyboard alternatives.
3. Favicon images are the icon. They occupy the full icon circle or rounded-square mask with no extra colored container. Broken or remote icons fall back to a crisp generated monogram.
4. Widgets must not be cloned cards with different titles. Weather, note, agenda, countdown, media, focus, and calendar each need a distinct information shape, density, and primary interaction.
5. Context menus are a first-class desktop interaction. Right-click opens at the pointer, keeps the target preview visible, and offers size, duplicate, lock, remove, and appearance actions without obscuring the canvas.
6. Mobile uses the same data model but a different composition: a compact top bar, one-column flowing sections, touch drag handles, and a 44px minimum target size. There is no hidden desktop-only action.
7. Motion is limited to spatial feedback: a 150-250ms lift on drag, a short spring when dropping, and gentle opacity transitions. It respects reduced-motion preferences.

## Delivery sequence

1. Brand and data-safe migration: new product identifiers, local database migration, cloud-function identifier migration, links, update metadata, documentation, and release archive names.
2. Canvas foundation: decouple the rail from layout, restore robust context menus, implement a single drag-and-drop coordinate system for shortcuts and widgets, and add grid snapping plus keyboard movement.
3. Icon system: resolve high-quality icons on demand, cache per local account, reserve layout before images decode, and use resilient fallbacks so no icon appears blank or blurry.
4. Widget collection: redesign every existing widget around its specific job, add compact/standard/feature sizes, and make size changes preview in place.
5. Final polish: wallpaper-aware contrast, light/dark tokens, desktop and mobile visual QA, keyboard navigation, focus states, reduced-motion review, and performance profiling.

## Acceptance criteria

- The first viewport communicates a personal new-tab product in under one second, without a giant clock or a marketing hero.
- Navigation placement does not alter the content grid.
- Every shortcut and widget can be moved without visual jumps or unexpected resizes.
- Right-click works consistently on desktop and long-press offers the equivalent action on touch devices.
- Every widget is recognizable by shape before reading its title.
- No clipped settings panel, jittering auto-hide rail, blurry favicon, or blank image state remains at 375px, 768px, 1024px, or 1440px.
