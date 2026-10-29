# Kiến trúc

Tài liệu này mô tả kiến trúc **hiện tại** (chặng 1) và các điểm mở rộng đã định cho những chặng sau. Phần đánh dấu *(planned)* là thiết kế, chưa có code.

## Tổng quan tiến trình

```
┌──────────────────────── Electron main process (Node.js) ────────────────────────┐
│ index.ts          khởi động, single-instance, tray, phím tắt toàn cục          │
│ security/         harden (chặn điều hướng/popup/webview/quyền), trusted-origin, │
│                   sender authorization, webPreferences an toàn                  │
│ ipc/router.ts     cửa duy nhất nhận IPC: kiểm tra sender → validate → handler   │
│ ipc/handlers.ts   handler theo kênh                                             │
│ windows/          WindowManager (avatar, chat), drag.ts (tính toán thuần)       │
│ (planned) ai-core, llm-providers, voice, memory, computer-use, settings, db     │
└───────────────▲───────────────────────────────────────▲─────────────────────────┘
                │ IPC (kênh cố định trong shared/ipc.ts) │
┌───────────────┴──────────┐               ┌────────────┴─────────────┐
│ preload (sandboxed, CJS) │               │ preload (cùng file)       │
│ window.companion         │               │ window.companion          │
├──────────────────────────┤               ├──────────────────────────┤
│ avatar.html (React)      │               │ chat.html (React)         │
│ trong suốt, không viền   │               │ cửa sổ thường             │
└──────────────────────────┘               └──────────────────────────┘
```

## Module và ranh giới

| Module (theo master prompt) | Vị trí hiện tại | Ghi chú |
| --- | --- | --- |
| desktop-shell | `src/main/index.ts`, `src/main/tray.ts`, `src/main/windows/` | |
| companion-avatar | `src/renderer/avatar/` | Nhân vật SVG gốc, hoạt ảnh CSS |
| chat-ui | `src/renderer/chat/` | |
| permissions (nền tảng) | `src/main/security/` | Chặng 6 mở rộng cho tool permissions |
| language-manager (UI) | `src/shared/i18n.ts`, `src/shared/locales/` | Chặng 3 thêm phần ngôn ngữ hội thoại |
| logging | `src/main/log.ts` | Chặng 2: ghi file, xoay vòng, redaction |
| ai-core, llm-providers | *(planned, chặng 3)* `src/main/ai/` | Interface `LlmProvider`, adapter Ollama |
| voice-input / voice-output | *(planned, chặng 4–5)* `src/main/voice/` | Interface `SttEngine`, `TtsEngine` |
| memory-manager, database, settings | *(planned, chặng 2, 7)* | SQLite + migration |
| computer-use, app-launcher | *(planned, chặng 6)* `src/main/tools/` | Registry + JSON schema + allowlist |
| update-and-packaging | *(planned, chặng 8)* | electron-builder NSIS |

Quy tắc phụ thuộc:

- `shared/` không import Electron hay Node — dùng được ở cả main, preload, renderer và test.
- `renderer/` không import Electron/Node (ESLint `no-restricted-imports` chặn). Mọi thứ đi qua `window.companion`.
- Logic thuần (tính vị trí kéo, kiểm tra origin, phân quyền sender, validate, i18n) tách khỏi API Electron để unit test được.

## Luồng IPC

1. Renderer gọi `window.companion.avatar.dragMove({x, y})`.
2. Preload sao chép tham số thành object mới và gửi trên **một kênh cố định** (`avatar:drag-move`).
3. `IpcRouter` trong main:
   - xác định cửa sổ gửi (`WindowManager.roleOf`) → `avatar` / `chat` / không rõ;
   - yêu cầu frame gửi là main frame, URL thuộc app (`isTrustedRendererUrl`);
   - kiểm tra vai trò được phép dùng kênh (`CHANNEL_ROLES`);
   - nếu bị từ chối: ghi log cảnh báo, bỏ qua (hoặc trả giá trị "rejected" cho `invoke`).
4. Handler validate payload (`shared/validation.ts`) rồi mới xử lý.

Thêm một kênh mới: khai báo trong `IPC` + `CHANNEL_ROLES` (`src/shared/ipc.ts`), thêm validator, đăng ký trong `handlers.ts`, expose qua preload, viết test.

## Kéo thả avatar

Không dùng `-webkit-app-region: drag` (không kẹp được vị trí, không phân biệt được click). Renderer gửi toạ độ màn hình của con trỏ (tối đa một lần mỗi frame); main tính vị trí mới = vị trí ban đầu + độ lệch con trỏ, rồi kẹp trong *work area* (không tính taskbar) của màn hình đang chứa con trỏ (`windows/drag.ts`).

## Build

`electron-vite` build 3 phần vào `out/`:

- `out/main/index.js` — CommonJS.
- `out/preload/index.cjs` — một file CommonJS duy nhất (bắt buộc với preload sandbox), chỉ `require("electron")`.
- `out/renderer/{avatar,chat}.html` + assets — CSP được chèn lúc build (strict ở production, nới cho HMR ở dev).

## Kiểm thử

- `tests/*.test.ts` (Vitest, môi trường Node): validate, phân quyền sender, trusted origin, webPreferences, CSP, kéo thả, i18n, icon khay.
- `npm run test:smoke`: chạy Electron thật với `--smoke-test` (`src/main/smoke-test.ts`), mở cả hai cửa sổ, kiểm tra từ bên trong renderer rằng không có `require`/`process`/`module`, API bị đóng băng, CSP có mặt, IPC từ chối đúng vai trò, `window.open` bị chặn.
