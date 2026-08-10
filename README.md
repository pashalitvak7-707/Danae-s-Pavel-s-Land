# Pasha & Danae — a map of our places

A hand-drawn map of the Mediterranean. Every glowing dot is a memory: click it,
its name pops up above the dot, and a button opens the full memory on its own
page. There is no menu and no index — the pages exist only behind the dots.

A password-protected admin panel edits every piece of text on the site, and the
changes appear on the live site straight away.

---

## 1. Add your artwork

Two files, both **1920 × 1080**, into `web/art/`:

| File | What it is |
| --- | --- |
| `world.png` | The clean drawing. This is what everyone sees. |
| `world-numbered.png` | Your version with the pink numbers. Only ever shown inside the admin panel, as a guide for lining the dots up. |

Placeholder versions are committed so the site runs before your art arrives.
Overwrite them and refresh.

Photos go in `web/photos/`. Reference them by filename in the admin panel
(e.g. `poros-boat.jpg`).

## 2. Run it on your own machine

```bash
npm install
ADMIN_PASSWORD=pick-something node server.js
```

- Map: <http://localhost:8080/>
- Admin: <http://localhost:8080/admin.html>

Content is saved to `.data/content.json`, which is git-ignored.

## 3. Put it online

Deploy to **Netlify** — it reads `netlify.toml`, so there is nothing to configure:

1. Push this repo to GitHub.
2. On Netlify: *Add new site → Import an existing project* → pick the repo → Deploy.
3. *Site configuration → Environment variables* → add **`ADMIN_PASSWORD`** with the
   password you want. **The admin panel will not accept any password until you set this.**
4. Redeploy once so the function picks up the variable.

Saved content lives in Netlify Blobs, so it survives redeploys and is shared by
everyone who opens the site.

The site works on any static host (GitHub Pages, Vercel, a USB stick) — it falls
back to the bundled `web/data/content.json`. Without a backend the admin panel
can still edit and download a backup, but it cannot publish live.

---

## Writing the memories

Everything is edited in the admin panel — no code, no redeploy.

**Texts tab** — for each memory: the name that pops up above the dot, the place,
a date, the memory itself, and which photos to show. Blank lines between
paragraphs; each paragraph drifts in as it appears.

**Marker positions tab** — pick a memory, then click the map to move its dot.
Tick *Show my numbered drawing underneath* to line each dot up exactly with the
number you drew.

**Site & backup tab** — the site title, the hint under the map, the dedication at
the foot of every memory page. Download a backup any time; restore from one if
something goes wrong.

Press **Save changes** to publish. Anyone with the site open sees the update the
next time their tab regains focus.

---

## How it fits together

```
web/
  index.html        the map
  admin.html        the admin panel (password gated, linked from nowhere)
  css/, js/
  data/content.json seed content + offline fallback
  art/              world.png, world-numbered.png
  photos/           your photos
netlify/functions/content.js   GET/PUT /api/content, POST /api/login
server.js           the same API for local use, stored in a file
```

Markers are positioned as a percentage of the artwork, inside a box locked to
1920:1080, so a dot stays on the same spot of the drawing at every window size.
On phones the map keeps its height and pans sideways.

## Notes

- Memory pages are reachable at `#/m17`-style links so the back button works.
  Nothing on the site lists them.
- Opened memories turn their dot from pink to yellow, saved per device.
- Honours `prefers-reduced-motion`.
- `web/admin.html` can be renamed to something less guessable; the password is
  what actually protects it.
