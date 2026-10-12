# @dreadhalor/ui

Components shared across my apps. A component lands here when two or more apps need the same
thing *and* it's hard to get right, so a fix should reach all of them at once. Styling primitives
(buttons, cards, inputs) stay in each app on purpose.

Stack it assumes: React 19, Base UI (`@base-ui/react` 1.x), Tailwind 4.

## Using it in an app

1. Install a tagged version straight from GitHub:

   ```sh
   pnpm add github:dreadhalor/ui#v0.4.0
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
  stops a drag that starts inside it from closing the viewer (dialogs portalled out of the viewer
  are already ignored).
- `containEvents` (default on) stops pointer/touch events bubbling out through the React tree.
  Turn it off if something inside relies on a document-level listener, like a menu that closes on
  an outside tap (LoadLab's photo header does).

The comments in `src/lightbox/` explain each non-obvious choice; most were bugs first.

### Confirm — `@dreadhalor/ui/confirm`

A yes-or-no question on Base UI's alert dialog. Each app themes it once and every confirm in it
looks native; the behaviour is shared:

- **Danger opens on Cancel**, so a reflexive Enter keeps things; a plain confirm opens on the action.
- **Async actions run inside it**: return a promise from `onConfirm` and both buttons disable (with
  `pendingLabel`), Escape and the backdrop wait, success closes, a thrown error stays on screen.
- **Events stop at the dialog**, so one opened from inside a link or a swipeable panel can't click
  the link or drag the panel. It sits above the Lightbox (z-150).
- Escape, Cancel and the backdrop all answer no.

```tsx
import { ConfirmDialog } from '@dreadhalor/ui/confirm'

<ConfirmDialog
  open={asking}
  onOpenChange={setAsking}
  title="Delete this memory?"
  description="This cannot be undone."
  confirmLabel="Delete"
  pendingLabel="Deleting…"
  danger
  onConfirm={() => deleteMemory(id)}   // async: runs in the dialog
  theme={appConfirmTheme}
/>
```

Or ask in one line from anywhere under a `<ConfirmProvider theme={…}>`:

```tsx
const confirm = useConfirm()
if (!(await confirm({ title: 'Archive it?', confirmLabel: 'Archive' }))) return
```

`theme` is a set of class strings, one per part (`backdrop`, `popup`, `title`, `description`,
`error`, `actions`, `cancel`, `confirm`, `danger`). A slot you set replaces the default; spread
`defaultConfirmTheme` to start from it.

### Upload — `@dreadhalor/ui/upload`

The client side of sending files: no UI, no server of its own. Each app draws its own progress
(rings on tiles, a bar, "Adding photo 2 of 5… 40%") and keeps its own endpoint.

- `send(url, body, { onProgress, signal, method, headers })` — XHR, because fetch has no upload
  progress. Resolves for any HTTP answer (check `ok`); rejects only when there was no answer.
- `failureMessage(res)` / `sendOrThrow(...)` — the app's own `{ error }` wins; otherwise plain
  words, including for a proxy's HTML 413 (Cloudflare's tunnel caps a body at 100 MB).
- `useUploadQueue({ upload, concurrency = 1, validate, onSettled })` — per-file status
  (`queued → uploading → processing → done | failed`) and bytes, overall `totals.sent/total`,
  `add`, `retry`, `remove`, `cancel`, `clear`. One failure never stops the rest.

```tsx
const q = useUploadQueue({
  validate: (f) => (f.size > MAX ? 'Photos can be up to 16 MB.' : null),
  upload: (file, { progress, signal }) => {
    const form = new FormData()
    form.set('photo', file)
    return sendOrThrow('/photos', form, { onProgress: progress, signal })
  },
  onSettled: () => router.refresh(),
})
<input type="file" multiple onChange={(e) => q.add(e.target.files)} />
```

Server rules that go with it (see the iOS checklist): files go to a route handler, never a server
action (Cloudflare blocks those when they carry a file); a Next middleware cuts bodies at 10 MB
unless `middlewareClientMaxBodySize` is raised; anything over 100 MB through the tunnel must be
chunked.

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
