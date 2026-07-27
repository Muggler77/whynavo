# WhyNavo Design System

**Direction:** Lucid Canvas / Sample A
**Product:** local-first new tab workspace
**Version:** 0.9
**Design dials:** variance 7/10, motion 3/10, density 5/10

## Product Principles

1. The first screen is the working product, never a marketing hero.
2. Wallpaper creates emotion; controls and data stay quiet, crisp, and readable.
3. Search is centered on the viewport, independent of navigation placement.
4. Desktop navigation is fixed at the extreme left or right and vertically centered.
5. Navigation placement must not shift or cover the personal canvas.
6. Website artwork fills its icon mask; there is no decorative outer icon card.
7. Widgets are recognized by their information shape, not only by title or color.
8. Local data remains usable without an account. Login adds sync rather than unlocking the product.

## Semantic Tokens

### Light

| Role | Value |
|---|---|
| Canvas | `#E9F0F2` |
| Surface | `rgba(250, 253, 253, 0.78)` |
| Soft surface | `rgba(255, 255, 255, 0.56)` |
| Primary text | `#142127` |
| Secondary text | `#42545C` |
| Muted text | `#687B83` |
| Border | `rgba(49, 72, 80, 0.14)` |
| Strong border | `rgba(38, 62, 70, 0.23)` |
| Brand | `#176B65` |
| Brand strong | `#0C514D` |
| Focus | `#0B67D1` |
| Danger | `#B42318` |

### Dark

| Role | Value |
|---|---|
| Canvas | `#111719` |
| Surface | `rgba(25, 34, 37, 0.74)` |
| Soft surface | `rgba(255, 255, 255, 0.08)` |
| Primary text | `#F5FAF9` |
| Secondary text | `#D1DCDA` |
| Muted text | `#A4B3B1` |
| Border | `rgba(255, 255, 255, 0.13)` |
| Brand | `#DFF7F1` |
| Focus | `#85B8FF` |
| Danger | `#FF9B93` |

## Typography

- System stack: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `PingFang SC`, `Microsoft YaHei`, sans-serif.
- No network font is required for first paint.
- Scale: 10, 11, 12, 13, 15, 17, 19, 24, 31.
- Body text uses normal letter spacing and at least 1.5 line height.
- Timers and changing numbers use tabular figures.
- Widget titles remain compact; hero-scale type is reserved for the date/time.

## Layout

- Spacing follows a 4px base: 4, 8, 12, 16, 24, 32, 48.
- Cards and framed tools use an 8px maximum radius.
- Desktop canvas uses 12 columns and 16px gaps.
- Standard bento rows use `6 + 6`, `6 + 3 + 3`, or `3 + 3 + 3 + 3`.
- The desktop canvas begins at least 8px beyond the fixed navigation rail.
- Mobile uses one flowing column and a five-item bottom navigation surface.
- Fixed mobile surfaces respect top and bottom safe-area insets.
- Dialog content owns one vertical scroll region and must expose its final action.

## Components

### Search

- Viewport-centered, 640px maximum width.
- 56px desktop height and at least 54px mobile height.
- High-opacity light surface for predictable contrast over every wallpaper.
- Search engine is a compact segmented control, not explanatory copy.

### Navigation

- 68px desktop rail, vertically centered, fixed to the screen edge.
- Active item uses surface contrast plus a 3px edge indicator.
- Auto-hide trigger becomes non-interactive after the rail opens.
- Hidden and auto modes animate only with transform and opacity.
- Mobile bottom navigation contains the five primary Sample A destinations.
- Tools remains functional but is hidden by default and can be restored from navigation settings.

### Shortcuts

- 48-80px user-controlled icon size.
- Original artwork uses a 24% rounded-square mask and fills the available image area.
- Brand marks that need clear space use an 84% contained image.
- Low-resolution raster candidates below 96px are rejected.
- Images reserve dimensions before loading and use a crisp monogram fallback.

### Widgets

- Shared framing is restrained: one border, one elevation, no nested card stacks.
- Weather: sky surface and horizontal forecast.
- Calendar: paper surface and date block.
- Todo: mint work surface and progress dial.
- Countdown: rose event surface and orbit.
- Focus: cool neutral surface and timer dial.
- Photo: image-first edge-to-edge frame.
- Quote: warm editorial surface and serif quotation.
- Clock, memo, year, calculator, and rates retain distinct content structures.

### Dialogs

- Desktop width follows task complexity, 520-760px.
- Mobile uses a bottom sheet occupying the available dynamic viewport.
- Header remains visible while body content scrolls.
- Inputs are at least 44px high and always have visible labels.
- Login and registration only show account creation fields when signed out.
- Connected account status and sync controls appear only after authentication.

## Motion

- Micro-interactions: 150-240ms.
- Use transform and opacity; do not animate layout dimensions.
- Hover lift is at most 2px and never changes surrounding geometry.
- Drag starts after a 6px mouse movement or a 180ms touch hold.
- All motion is effectively removed under `prefers-reduced-motion`.
- Continuous animation is limited to active loading indicators.

## Performance

- First eight home icons may load eagerly; remaining icons use intersection-based loading.
- Shortcut pages render in bounded batches of 48.
- Off-screen widgets use `content-visibility: auto` outside layout editing.
- Resolved icon candidates are stored per account and bounded.
- Web icon response cache is capped at 200 entries.
- Mobile uses dedicated smaller wallpaper assets.
- Every fixed-format image and icon has stable dimensions to avoid layout shift.

## Accessibility

- Normal text contrast is at least 4.5:1 and large UI contrast is at least 3:1.
- Every icon-only control has an accessible name and visible focus ring.
- Touch targets are at least 44x44px.
- Keyboard users can reorder sortable content with the DnD keyboard sensor.
- Context menus focus on open, close with Escape, and remain inside the viewport.
- Color is never the only indication of active, error, or success state.
- High contrast and reduced transparency preferences receive explicit fallbacks.

## Forbidden Patterns

- No marketing landing page in place of the app.
- No giant decorative hero clock.
- No gradient or blurred decoration objects.
- No nested cards or card-wrapped page sections.
- No purple-dominant or single-hue interface.
- No emoji used as structural icons.
- No hover-only critical action.
- No desktop rail that moves or covers the canvas.
- No unbounded icon, image, or service-worker cache.
- No user-visible service URL, anonymous key, or advanced connection field.

## Release Checklist

- [ ] 375, 768, 1024, and 1440px layouts verified.
- [ ] Phone portrait and short landscape verified.
- [ ] No horizontal document overflow.
- [ ] Desktop rail clears the canvas in left and right modes.
- [ ] Auto-hide rail remains open while the pointer enters it.
- [ ] Right-click menus open at the pointer and fit the viewport.
- [ ] Shortcut and widget drag ordering persists.
- [ ] Settings and account dialogs scroll to their final action.
- [ ] Login, registration, verification notice, and connected states checked.
- [ ] Light, dark, reduced motion, reduced transparency, and high contrast checked.
- [ ] Typecheck, build, migration safety, package safety, and repository scans pass.
