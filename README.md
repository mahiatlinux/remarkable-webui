# reMarkable WebUI

Local web interface for reMarkable paper tablets over SSH. Works over the USB cable with no wifi, and over wifi when SSH is enabled there.

![Library](docs/screenshots/library.png)

![Document viewer](docs/screenshots/document.png)

![Screen mirror](docs/screenshots/screen.png)

## Features

- Library with folders, notebooks, PDFs and EPUBs: thumbnails, search (⌘K), grid and list views, drag and drop. Rename, move, pin, trash, delete, new folders and notebooks.
- Upload PDF, EPUB and rmdoc files. The tablet imports them live through its USB web interface, no restart.
- Page viewer: strokes rendered from the `.rm` v6 files, PDF pages underneath, templates from the tablet.
- Export as PDF (rendered by the tablet), rmdoc, or a single page as SVG.
- Device panel with model, firmware, battery, storage and network. Restart xochitl, reboot, power off.
- Live screen mirror with rotation, inversion, screenshots and WebM recording.
- Template gallery, custom `.template` upload and editing.
- File explorer and terminal for the whole tablet.

## Setup

Needs Node.js 22 or newer and SSH on the tablet. reMarkable 1 and 2 have it on by default. Paper Pro needs developer mode under Settings › General › Software › Advanced, and turning it on factory resets the tablet. The root password is at the bottom of Settings › General › Help › Copyrights and licenses.

Over USB the tablet answers on `10.11.99.1`. Over wifi use the address from Settings › Wi-Fi. Uploads and PDF export need "USB web interface" enabled under Settings › Storage.

```sh
npm install
npm run dev
```

The dev server is on http://localhost:5173 with the API on port 8787. For production run `npm run build` then `npm start`, both served from port 8787 (or `PORT`). Release tarballs ship the client prebuilt: unpack, `npm ci --omit=dev`, `npm start`.

Saved devices, including passwords, live in `~/.config/remarkable-webui/devices.json` with mode 600. The server listens on `127.0.0.1` only.

## Notes

- xochitl reads document metadata at startup, so after a rename, move, delete, or a new folder or notebook the app restarts it (about two seconds, the open notebook closes). Turn that off per device in Settings › General to batch changes and restart from the sidebar.
- Screen mirror reads `/dev/fb0` on reMarkable 1, xochitl's memory on reMarkable 2 (reStream offsets) and the DRM buffers on Paper Pro and newer (goMarkableStream method). A static helper (`tools/rmfb.c`, prebuilt in `server/bin/`) is copied to `/home/root/.cache/remarkable-webui/` and streams only the rows that changed. Rebuild it with `zig cc -target aarch64-linux-musl -O2 -static -s -o server/bin/rmfb-aarch64 tools/rmfb.c`.
- Custom templates go into the document store as a `.template` file next to a `TemplateType` `.metadata`, the way reMarkable's own Methods templates arrive since firmware 3.17. They survive updates and nothing on the read-only root partition changes. PNG and SVG templates are not supported there.
