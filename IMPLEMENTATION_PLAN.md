# IMPLEMENTATION_PLAN — Anime AI Desktop Companion

Trạng thái dùng trong tài liệu này:

- `[x]` **implemented + tested** — có code và có bằng chứng kiểm thử (tự động hoặc thủ công có ghi chép).
- `[~]` **partially implemented** — có code nhưng chưa kiểm thử đầy đủ hoặc thiếu một phần.
- `[ ]` **planned** — chưa làm.

Mỗi chặng có: mục tiêu, phạm vi file, tiêu chí chấp nhận, rủi ro. Chỉ chuyển chặng khi tiêu chí chấp nhận đạt hoặc blocker đã được ghi rõ.

---

## Chặng 1 — Nền tảng desktop shell an toàn

**Mục tiêu:** Khung Electron + React + TypeScript + Vite, cửa sổ avatar trong suốt, cửa sổ chat riêng, IPC an toàn qua preload, tooling (lint/typecheck/test/build), tài liệu ban đầu.

**File chính:** `package.json`, `electron.vite.config.ts`, `src/main/**`, `src/preload/**`, `src/renderer/**`, `src/shared/**`, `tests/**`, `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`.

**Tiêu chí chấp nhận:**

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` chạy thành công.
- [ ] Avatar window: trong suốt, không viền, always-on-top, không hiện trên taskbar, kéo thả được.
- [ ] Avatar có nút mở chat và nút ẩn; có cách hiện lại (tray icon + phím tắt toàn cục).
- [ ] Chat window riêng, mở/đóng/focus từ avatar.
- [ ] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- [ ] Preload chỉ expose API tối thiểu, có kiểu; không expose `ipcRenderer` thô.
- [ ] Main process kiểm tra sender của mọi IPC (đúng window, đúng origin).
- [ ] Payload IPC được validate (kiểu, kích thước).
- [ ] CSP chặt cho renderer; chặn `window.open`, điều hướng ngoài app, `webview`, permission request mặc định.
- [ ] Single-instance lock.
- [ ] Unit test cho validation, sender check, kéo thả (tính toán vị trí/clamp màn hình).
- [ ] README, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`.

**Rủi ro:** cửa sổ trong suốt trên một số GPU/driver Windows có thể hiện nền đen → có tuỳ chọn tắt hardware acceleration (ghi trong troubleshooting). Chưa kiểm chứng installer ở chặng này.

---

## Chặng 2 — Settings, database, logging, i18n giao diện

- [ ] Module `settings`: schema có kiểu + validate, giá trị mặc định an toàn, lưu file trong `userData`.
- [ ] Module `database`: SQLite (better-sqlite3 hoặc node:sqlite), `schema_version`, migration có test.
- [ ] Module `logging`: log xoay vòng, che dữ liệu nhạy cảm (redaction), mức log cấu hình được.
- [ ] i18n giao diện vi-VN, en-US từ file dịch; fallback khi thiếu key/file; định dạng ngày/số theo locale.
- [ ] Cửa sổ Settings (ngôn ngữ UI, ngôn ngữ hội thoại, vị trí avatar, kích thước).
- [ ] Lưu/khôi phục vị trí avatar.
- [ ] Test: migration, validate settings, fallback i18n, Unicode tiếng Việt có dấu.

## Chặng 3 — AI core, Ollama provider, language manager

- [ ] Interface `LlmProvider` (stream, cancel, list models, health check).
- [ ] Adapter Ollama qua `http://127.0.0.1:11434` (chỉ loopback), timeout, cancel, retry hợp lý.
- [ ] Chat streaming từ main → chat window qua IPC; huỷ phản hồi.
- [ ] Lưu lịch sử hội thoại (SQLite) với giới hạn retention.
- [ ] Language manager: phát hiện ngôn ngữ đầu vào, chế độ "trả lời theo ngôn ngữ người dùng", chọn ngôn ngữ phản hồi cố định.
- [ ] System prompt theo ngôn ngữ, cấu hình được.
- [ ] Trạng thái rõ ràng khi Ollama chưa chạy/chưa có model.
- [ ] Test: provider với mock server, phát hiện ngôn ngữ (vi/en/trộn), cancel.

## Chặng 4 — Voice output (TTS)

- [ ] Interface `TtsEngine` (listVoices, speak, stop).
- [ ] Adapter Windows SAPI (System.Speech qua PowerShell process có tham số cố định, không ghép chuỗi lệnh).
- [ ] Liệt kê voice thực có trên máy; cảnh báo khi không có voice cho ngôn ngữ đã chọn; fallback.
- [ ] Cấu hình voice, tốc độ, âm lượng; avatar có trạng thái "đang nói".
- [ ] Test: chọn voice theo locale, xử lý thiếu voice, escape đầu vào.

## Chặng 5 — Voice input (STT)

- [ ] Interface `SttEngine`; adapter whisper.cpp (binary + model do người dùng cài, đường dẫn cấu hình).
- [ ] Thu âm trong renderer (getUserMedia) chỉ khi người dùng bấm/giữ nút; permission handler chỉ cho phép `media` audio từ chat window.
- [ ] Chọn ngôn ngữ hoặc auto-detect; không lưu audio sau khi nhận dạng (trừ khi người dùng bật).
- [ ] Test: adapter với binary giả, xoá file tạm, timeout.

## Chặng 6 — Computer use, permissions, app launcher

- [ ] Tool registry: JSON schema, validate, timeout, kết quả có cấu trúc, audit log.
- [ ] Phân loại rủi ro low/medium/high/blocked; hộp thoại xác nhận do main process điều khiển.
- [ ] `open_app(app_id)` qua allowlist; `open_url(url)` chỉ http/https.
- [ ] `search_files` trong thư mục được cho phép; `get_system_info`.
- [ ] `capture_screen`, `click_screen`, `type_text`, `press_key` — mặc định tắt, cần quyền + xác nhận.
- [ ] LLM tool-calling: chỉ chọn tool từ registry; không bao giờ thực thi chuỗi lệnh từ LLM.
- [ ] Test: validate schema, path traversal, URL scheme, quyền bị từ chối, audit.

## Chặng 7 — Memory, startup, tuỳ biến nhân vật

- [ ] Memory dài hạn trong SQLite: người dùng xem/sửa/xoá/tắt; chỉ lưu khi được phép.
- [ ] Bật/tắt khởi động cùng Windows (`app.setLoginItemSettings`), mặc định tắt.
- [ ] Đổi nhân vật (gói avatar: ảnh/sprite + manifest), đổi giọng, đổi model.
- [ ] Test: CRUD memory, export/xoá toàn bộ, startup toggle (mock).

## Chặng 8 — Packaging, CI, tài liệu và QA phát hành

- [ ] electron-builder NSIS installer cho Windows x64; kiểm tra cài/gỡ trên Windows thật.
- [ ] CI GitHub Actions (windows-latest): lint, typecheck, test, build.
- [ ] Smoke test khởi động app (Playwright Electron hoặc tương đương).
- [ ] Tài liệu: cài model, thêm ngôn ngữ/voice, startup, troubleshooting, yêu cầu phần cứng.
- [ ] Checklist kiểm thử thủ công + báo cáo tính năng (implemented / tested / partial / planned).
