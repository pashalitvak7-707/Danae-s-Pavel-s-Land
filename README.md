# Pasha & Danae — a map of our places

A hand-drawn map of the Mediterranean. Every glowing dot is a memory: click it,
its name pops up above the dot, and a button opens the full memory on its own
page. There is no menu and no index — the pages exist only behind the dots.

A password-protected admin panel edits every piece of text on the site, and the
changes appear on the live site straight away.

---

## 1. Add your artwork

Two files go into the `web/art/` folder. **The names must match exactly** —
lowercase, with `.png` on the end:

| Filename | What it is | Who sees it | Status |
| --- | --- | --- | --- |
| `world.png` | The clean drawing, no numbers | Everyone — this is the map | ✅ in place |
| `world-numbered.png` | The same drawing with the pink numbers | Only you, inside the admin panel | ✅ in place |

**The filename is what matters, not the file.** Uploading a drawing under any
other name (`Correct image.png`, `Image with markers.png`) adds a file the site
never looks at — the two names above are the only ones it reads.

All 32 dots are already positioned. Their coordinates were measured by
subtracting the clean drawing from the numbered one, which leaves only the
handwritten numbers, then taking the centre of each. Every dot sits on the
number it belongs to; nothing needs dragging unless you want to nudge one.

### Requirements

- **Exactly 1920 × 1080 pixels.** The site positions every dot as a percentage
  of this shape. A different aspect ratio (e.g. 1600 × 1000) will make the dots
  sit slightly wrong everywhere.
- **PNG format.** If your export is a JPG, rename won't do it — re-export as PNG.
- **Both files must be the same size and the same framing**, or the numbered
  guide won't line up with the real map underneath it in the admin panel.
- No transparency needed; the drawing should fill the whole frame edge to edge.

### Three ways to put them there

**A. Straight on GitHub (easiest, no tools).**
1. Open your repo on github.com and click into `web` → `art`.
2. *Add file* → *Upload files*.
3. Drag in `world.png` and `world-numbered.png`.
4. Tick *Commit directly to the branch*, then *Commit changes*.

GitHub will ask to confirm because you're replacing existing files — that is
what you want. If you deployed to Netlify, the site rebuilds on its own within
a minute or two.

**B. On your own computer.**
```bash
git pull
# copy the two PNGs into web/art/, replacing what's there
git add web/art
git commit -m "Add the real map artwork"
git push
```

**C. Just send them to me** and I'll commit them and check the dots line up.

### Checking it worked

Open the site. If the map still looks like flat coloured blocks, the file
didn't land — check the filename spelling and that it's inside `web/art/`,
not `web/` or `art/` at the top level. If you see "The map artwork is not here
yet", the filename is wrong.

Then open the admin panel → **Marker positions** → tick *Show my numbered
drawing underneath*, and drag each dot onto its number.

### Photos

Photos go in `web/photos/`, uploaded the same way. Reference them by filename
in the admin panel — e.g. typing `poros-boat.jpg, ferry.jpg` shows both on that
memory's page. Any format a browser reads (jpg, png, webp) is fine. Resize
anything enormous down to about 1600px wide first so the pages stay quick.

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

**Texts tab** — for each memory: the name that pops up above the dot, the number
you drew on the map, the place, a date, the memory itself, and which photos to
show. Blank lines between paragraphs; each paragraph drifts in as it appears.

*+ Add a memory* creates a new dot in the middle of the sea, ready to be
dragged where you want it. *Delete this memory* at the foot of the editor
removes one, with a confirmation first. Both take effect on the site as soon as
you save.

**Marker positions tab** — drag any dot to move it, or pick one and click the
map. Tick *Show my numbered drawing underneath* to line each dot up exactly with
the number you drew. *+ Add a dot* works here too.

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
