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

- [x] `npm run lint`, `npm run typecheck`, `npm test` (69 test), `npm run build` chạy thành công (Windows 11, Node 24.18).
- [~] Avatar window: trong suốt, không viền, always-on-top, không hiện trên taskbar, kéo thả được.
  Smoke test xác nhận always-on-top, kích thước, không resize; render nhân vật đã chụp ảnh kiểm tra (offscreen). Tính toán kéo thả có unit test. **Cần kiểm tra thủ công** trên desktop tương tác: độ trong suốt thực tế, ẩn khỏi taskbar, cảm giác kéo.
- [~] Avatar có nút mở chat và nút ẩn; có cách hiện lại (tray icon + phím tắt toàn cục).
  Smoke test xác nhận: nút ẩn qua IPC, tray được tạo, `Ctrl+Alt+A` đăng ký thành công. **Cần kiểm tra thủ công:** bấm vào tray và nhấn phím tắt thật.
- [x] Chat window riêng, mở/đóng/focus từ avatar (smoke test mở + probe; render đã chụp ảnh).
- [x] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- [x] Preload chỉ expose API tối thiểu, có kiểu; không expose `ipcRenderer` thô.
- [x] Main process kiểm tra sender của mọi IPC (đúng window, main frame, đúng origin, đúng vai trò).
- [x] Payload IPC được validate (kiểu, số key, giới hạn, NFC).
- [x] CSP chặt cho renderer; chặn `window.open`, điều hướng ngoài app, `webview`.
- [x] Permission request mặc định bị từ chối (smoke test: notification, microphone). Điều hướng ra ngoài app bị chặn (smoke test).
- [x] Single-instance lock (smoke test: lần chạy thứ hai tự thoát với mã 0 và hiện lại avatar đang ẩn; smoke test báo lỗi nếu đã có bản khác đang chạy).
- [x] Unit test cho validation, sender check, trusted origin, CSP, kéo thả, i18n.
- [x] Smoke test Electron thật: `npm run test:smoke` → PASS (xem số mới nhất ở chặng 2).
- [x] README, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`.

**Rủi ro:** cửa sổ trong suốt trên một số GPU/driver Windows có thể hiện nền đen → tuỳ chọn tắt hardware acceleration sẽ thêm ở chặng 3. Chưa build/kiểm chứng installer ở chặng này.

**Ngoài kế hoạch ban đầu, đã làm sớm:** i18n giao diện vi-VN/en-US tối thiểu (theo locale hệ điều hành, fallback en-US) để không có chuỗi giao diện viết cứng trong component.

---

## Chặng 2 — AI Core chạy cục bộ

**Trạng thái: CHƯA HOÀN THÀNH.** Code và kiểm thử với máy chủ giả lập đã xong; còn thiếu bằng chứng với Ollama thật.

- [x] Interface `LLMProvider` (version, list models, stream chat, cancel qua AbortSignal).
- [~] Adapter Ollama: chỉ endpoint loopback, cấu hình model, timeout, streaming, cancellation. Đã kiểm thử với máy chủ giả lập; **chưa chạy với Ollama thật**.
- [x] Giới hạn độ dài đầu vào và lịch sử hội thoại (số tin và số ký tự).
- [x] Quản lý hội thoại; chỉ lưu cục bộ khi người dùng bật, tắt thì xoá dữ liệu đã lưu. Lưu bằng file JSON; SQLite ở chặng 3.
- [x] System prompt tách khỏi nội dung người dùng, theo ngôn ngữ; output của model chỉ là văn bản hiển thị.
- [~] Màn hình chọn model, kiểm tra kết nối, thông báo model chưa tải và lỗi Ollama. Smoke test đi qua giao diện thật với máy chủ giả lập; chưa thử với Ollama thật và chưa có người dùng thao tác trên màn hình.
- [x] Unit/integration test với mock: provider, lỗi kết nối, timeout, câu trả lời rỗng, streaming, cancel.
- [x] Test cần Ollama thật được tách riêng và ghi rõ: `tests/ollama.live.test.ts`, `npm run test:live`.
- [ ] **Chạy `npm run test:live` với Ollama thật và một model thật.** Blocker: máy phát triển chưa cài Ollama. 5 test này đang bị bỏ qua, chưa từng chạy.

**Rủi ro:** máy chủ giả lập được viết theo tài liệu API của Ollama. Nếu Ollama thật khác tài liệu (ví dụ thông báo lỗi 404, dữ liệu model có `thinking`), chỉ test live mới phát hiện được.

## Chặng 3 — Settings, database, logging, language manager

- [ ] Module `database`: SQLite, `schema_version`, migration có test; chuyển settings và hội thoại từ file JSON sang.
- [ ] Module `logging`: log xoay vòng, che dữ liệu nhạy cảm (redaction), mức log cấu hình được.
- [ ] Chọn ngôn ngữ giao diện trong app; fallback khi thiếu key/file; định dạng ngày/số theo locale.
- [ ] Language manager: phát hiện ngôn ngữ đầu vào (vi/en/trộn).
- [ ] Tuỳ chọn tắt tăng tốc phần cứng; lưu/khôi phục vị trí avatar và kích thước.
- [ ] Test: migration, validate settings, fallback i18n, Unicode tiếng Việt có dấu.

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
- [ ] Smoke test chạy trên CI; loại `smoke-test.ts` và `testing/mock-ollama.ts` khỏi bản đóng gói.
- [ ] Tài liệu: cài model, thêm ngôn ngữ/voice, startup, troubleshooting, yêu cầu phần cứng.
- [ ] Checklist kiểm thử thủ công + báo cáo tính năng (implemented / tested / partial / planned).
