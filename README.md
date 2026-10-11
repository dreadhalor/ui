# @dreadhalor/ui

Components shared across my apps. A component lands here when two or more apps need the same
thing *and* it's hard to get right, so a fix should reach all of them at once. Styling primitives
(buttons, cards, inputs) stay in each app on purpose.

Stack it assumes: React 19, Base UI (`@base-ui/react` 1.x), Tailwind 4.

## Using it in an app

1. Install a tagged version straight from GitHub:

   ```sh
   pnpm add github:dreadhalor/ui#v0.1.3
   ```

2. It ships TypeScript source, so let Next compile it (`next.config`):

   ```js
   transpilePackages: ['@dreadhalor/ui'],
   ```

3. Let Tailwind see its classes (in the CSS file that imports Tailwind; the path is relative to
   that file):

   ```css
   @import 'tailwindcss';
   @source '../../node_modules/@dreadhalor/ui/src';
   ```

## Components

### Lightbox — `@dreadhalor/ui/lightbox`

Full-screen viewer: native scroll-snap strip, arrow buttons and keys, a counter, drag down to
close, and pinch / double-tap / trackpad-pinch zoom on any slide that wraps its image in
`<LightboxZoom>`. While a slide is zoomed, dragging pans it instead of changing slides or closing.

```tsx
import { Lightbox, LightboxZoom } from '@dreadhalor/ui/lightbox'

<Lightbox
  open={viewing !== null}
  onClose={() => setViewing(null)}
  count={photos.length}
  index={viewing ?? 0}
  onIndexChange={setViewing}
  getKey={(i) => photos[i].id}
  renderItem={(i) => (
    <LightboxZoom>
      <img src={photos[i].url} alt="" draggable={false}
        className="max-h-full max-w-full select-none object-contain" />
    </LightboxZoom>
  )}
/>
```

- Keep it **mounted** and drive it with `open`, or the exit animation never runs.
- Each app decides what a slide is (video, a locked placeholder, a spinner); only wrap what should
  zoom.
- `closeButton={false}` / `counter={false}` to supply your own header as `children`;
  `stageRef` gives drawers a positioned box to portal into; `data-lightbox-no-swipe` on an element
  stops a drag that starts inside it from closing the viewer.

The comments in `src/lightbox/` explain each non-obvious choice; most were bugs first.

## Developing

```sh
pnpm install
pnpm demo    # every component, live, at localhost:5173 (also on your LAN, for a phone)
pnpm check   # types + lint
pnpm demo --port 5199 & pnpm test:gestures   # touch + mouse checks in headless Chrome
```

The gesture tests send the fake mouse events iOS fires after every tap; without them a touch
test passes while the phone fails (see `zoom.tsx`).

To release: bump `version`, commit, tag `vX.Y.Z`, push with tags, then bump the tag in each app.
