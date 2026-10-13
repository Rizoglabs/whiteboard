# Whiteboard v1.0 — Release Report (2026-10-13)

Major release: aplikasi diagram 2D yang layak dipakai sehari-hari.
Dikerjakan end-to-end sesuai Master Prompt: implementasi → uji → perbaiki → deploy.

## Status rilis

| Item | Nilai |
|---|---|
| Branch | `whiteboard-v1` → merged fast-forward ke `main` |
| Commit | `db7faf9` (di `main`, sudah push ke `Rizoglabs/whiteboard`) |
| Preview deployment | `dpl_HAQxXp4XvLs2hKR3fuoEiAwLK3jy` — READY |
| Preview URL | https://whiteboard-pn259qrxf-rizoglabs.vercel.app/ (HTTP 200) |
| Production deployment | `dpl_CYtjmcxccCA2VzgD6iKP7nqeueUP` — READY |
| Production URL | https://whiteboard-rizoglabs.vercel.app/ (HTTP 200) |
| Verifikasi bundle | sha256 production = sha256 build lokal yang lolos E2E: `614bf034eee2cbc84cec5b8909545e4346b9dbe235fdd14999db6c825fec3a9a` |

## Perubahan file & arsitektur

Pemisahan lapisan dipertahankan (geometry, camera, scene, history, persistence,
renderer, interaction, UI). Tidak ada rewrite engine; semua ekstensi menempel
pada pola yang sudah ada.

**Baru:**
- `src/core/migrate.ts` — validasi + migrasi dokumen v1 → v2.
- `src/interaction/snapping.ts` — snap edge/center + snap titik endpoint.
- `src/render/text.ts` — word-wrap, measure, fitTextRect (measure injectable).
- `src/io/json.ts` — export/import JSON, validasi ketat, atomic.
- `src/io/png.ts` — export PNG (content bounds, 2x, tanpa grid).
- `src/io/svg.ts` — export SVG (rect/ellipse/line/arrow/text).
- `src/ui/PropertiesPanel.tsx` — panel properti kontekstual.
- `src/ui/TextEditor.tsx` — textarea overlay untuk inline editing.

**Diubah (inti):**
- `src/core/scene.ts` — union `Shape` (rectangle/ellipse/line/arrow/text),
  `opacity`, `translatedShape`/`resizedShape` (endpoint-aware), helper z-order,
  factory per tipe.
- `src/core/history.ts` — `patchShapesAction`, `addShapesAction`,
  `reorderShapesAction`, `replaceDocumentAction`; move/resize kini
  menggeser/memapped endpoint line/arrow.
- `src/core/persistence.ts` — load memigrasi via `migrateDocument`.
- `src/render/renderer.ts` — gambar semua tipe, opacity, guides, opsi grid.
- `src/interaction/controller.ts` — tool baru, create line/arrow/text,
  snapping saat move, magnetic endpoint, copy/paste/duplicate/select-all,
  z-order, dblclick edit teks, `lostpointercapture`, loading gate.
- `src/ui/App.tsx` — loading gate, save chain serialized + generation guard,
  import/export + notice, panel properti, empty state.
- `src/ui/CanvasView.tsx` — redraw coalesced via requestAnimationFrame.
- `src/ui/Toolbar.tsx` — tombol tool baru + Import/JSON/PNG/SVG.

## Fitur selesai

- [x] Ellipse, line, arrow, text (create/select/drag/resize/delete)
- [x] Inline text editing (Enter commit, Shift+Enter newline, Esc batal;
      box kosong yang dibatalkan dihapus)
- [x] Properti: stroke, fill (+none), width 1–12, opacity 10–100%,
      font size 8–96, align left/center/right — semua undoable
- [x] Duplicate, copy/paste (clipboard internal, offset +24), select all
- [x] Z-order: bring forward/backward, to front/back (panel + Ctrl+]/[)
- [x] Snapping edge/center + alignment guides (move); endpoint magnetis (create)
- [x] Export/import JSON via UI; validasi; atomic; migrasi v1→v2
- [x] Export PNG & SVG
- [x] Loading gate (tutup race load vs interaksi awal)
- [x] Autosave serialized; status Saving/Saved/Save failed akurat
- [x] Empty state, notice sukses/gagal, panel responsif (HP = bottom strip)
- [x] F-01 & F-02 tetap teratasi + handler `lostpointercapture`

## Fitur yang TIDAK selesai / di luar scope v1.0

- Konektor panah yang *menempel* (glued) pada objek: endpoint bersifat magnetis
  saat create, tapi tersimpan sebagai koordinat bebas. Menggeser objek target
  tidak menggerakkan panah. (Master prompt: kondisional "jika mendukung".)
- Snapping saat create/resize (hanya move yang di-snap).
- Kolaborasi, autentikasi, AI, backend: tetap dilarang scope, tidak dikerjakan.
- Benchmark performa terukur: tidak diklaim, tidak diukur (lihat keterbatasan).

## Temuan bug selama pengerjaan (sebelum/sesudah)

| # | Temuan | Status |
|---|---|---|
| B-01 | `layoutText` tidak hard-break kata tunggal yang lebih panjang dari lebar baris (unit test gagal) | Diperbaiki di `src/render/text.ts`; test hijau |
| B-02 | Titik dblclick test jatuh di luar rect teks setelah fit (test salah, bukan app) | Test diperbaiki (klik tengah shape) |
| B-03 | Ekspektasi Ctrl+D salah di test (2 shape, bukan 3) | Test diperbaiki |
| B-04 | Tombol panel pakai `title`, bukan accessible name → Playwright tidak menemukan | Tambah `aria-label` di panel |
| B-05 | Satu flake `space+drag pans the camera` di full-suite paralel (lulus isolated & re-run 59/59) | Tidak terulang; dicatat sebagai flake observasi |
| B-06 | `saveDocument` sempat terhapus saat edit `persistence.ts` | Terdeteksi via review, dikembalikan sebelum commit |

Tidak ada bug kritis yang diketahui pada alur inti yang diuji.

## Hasil pengujian

Perintah aktual & exit code:

| Perintah | Hasil |
|---|---|
| `npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm test` (vitest) | **83/83 PASS** (37 lama + 46 baru), exit 0 |
| `npm run build` | PASS (exit 0) |
| `npx playwright test --project=local` | **59/59 PASS** (31 lama + 28 baru), exit 0 |
| `npx playwright test --project=prod` | TIDAK DIJALANKAN di sandbox (Chromium terblokir proxy egress — batasan yang sudah diketahui sejak audit) |

E2E baru mencakup: create ellipse/line/arrow, snap endpoint, text tool
(click/drag/dblclick/Enter/Shift+Enter/Esc), properti + undo, copy/paste/
duplicate/select-all, z-order (panel + keyboard), JSON round-trip + invalid
import + undo import, download PNG/SVG, empty-canvas export error, viewport
HP (390×844) & tablet (1024×768), overflow check.

Smoke test production (curl, bukan klaim E2E):
- `https://whiteboard-rizoglabs.vercel.app/` → HTTP 200, `<title>Whiteboard</title>`
- Bundle production byte-identik dengan build lokal yang lolos 59/59 E2E.

## Keterbatasan tersisa & risiko

1. **E2E production tidak dijalankan** — browser sandbox terblokir proxy
   (`ERR_TUNNEL_CONNECTION_FAILED`). Yang terverifikasi: HTTP 200 +
   bundle byte-identik dengan build yang lolos E2E lokal.
2. **Tanpa package-lock.json di deployment** — file 129KB melebihi batas argumen
   CLI (128KB). `npm install` di Vercel me-resolve versi fresh dari range
   `^`. Risiko rendah (range sempit); bundle hasil build terbukti identik
   dengan build lokal.
3. **Vercel MCP 403 pada scope `rizoglabs`** untuk `upload_file` ber-`teamId`
   dan `list_deployment_events`. Deploy dilakukan tanpa `teamId`
   (team di-resolve dari project id) — berhasil.
4. **beforeunload flush best-effort** — tidak dijamin browser; ketahanan nyata
   bertumpu pada autosave debounce 500ms + serialized writes.
5. **Tidak ada benchmark performa** — rAF coalescing diimplementasikan sebagai
   guard struktural; tidak ada klaim speedup.
6. **Panah tidak glued** (lihat di atas).

## Kriteria selesai (acceptance)

1. ✅ Semua tool end-to-end (E2E).
2. ✅ Aksi dokumen undo/redo (unit + E2E).
3. ✅ JSON round-trip mempertahankan objek & properti (unit + E2E).
4. ✅ Input invalid tidak mengubah dokumen (unit + E2E invalid import).
5. ✅ Loading gate — load telat tidak menimpa aksi pengguna.
6. ✅ Status autosave akurat; save failure diuji (suite lama).
7. ✅ F-01 & F-02 tetap teratasi (suite lama hijau).
8. ✅ Tidak ada bug kritis diketahui.
9. ✅ Desktop/tablet/HP lulus E2E lokal.
10. ✅ Typecheck, lint, unit, E2E, build lulus.
11. ✅ Preview & production dilaporkan terpisah + SHA jelas.
12. ✅ Tidak ada klaim tanpa bukti (batasan di atas eksplisit).
