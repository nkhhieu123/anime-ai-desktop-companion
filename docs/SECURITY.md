# Mô hình bảo mật

## Mục tiêu

Ứng dụng nhận văn bản từ người dùng và từ một mô hình ngôn ngữ, và (từ chặng 6) sẽ điều khiển máy tính. Vì vậy ranh giới được thiết kế từ chặng 1 với giả định:

1. **Renderer không đáng tin.** Nội dung hiển thị (kể cả output của LLM) có thể chứa mã độc/prompt injection. Renderer không được có quyền Node.js, shell hay file system.
2. **Output của LLM không phải lệnh.** Không bao giờ thực thi chuỗi do LLM sinh ra; chỉ chọn công cụ có sẵn trong registry với tham số đã validate (chặng 6).
3. **Main process là nơi duy nhất ra quyết định** về quyền, xác nhận người dùng và thực thi.

## Các lớp bảo vệ đã có

| Lớp | Cách làm | Vị trí | Kiểm thử |
| --- | --- | --- | --- |
| Cô lập renderer | `contextIsolation: true`, `nodeIntegration: false` (cả worker/subframe), `sandbox: true`, `app.enableSandbox()`, `webviewTag: false`, `webSecurity: true` | `main/security/web-preferences.ts`, `harden.ts` | unit test + smoke test (không có `require`/`process`/`module` trong renderer) |
| Preload tối thiểu | Chỉ expose `window.companion` với các hàm cố định; không expose `ipcRenderer`, không có kênh động; tham số được sao chép thành object mới | `preload/index.ts` | smoke test (key của API, API bị đóng băng) |
| Kiểm tra sender IPC | Mỗi tin nhắn: đúng cửa sổ của app, main frame, URL trusted, vai trò được phép dùng kênh | `main/security/sender.ts`, `main/ipc/router.ts` | unit test + smoke test (chat không ẩn được avatar, avatar không gọi được `chat:send`) |
| Validate payload | Kiểu, số key chính xác, giới hạn toạ độ, độ dài tin nhắn ≤ 4000, chuẩn hoá Unicode NFC | `shared/validation.ts` | unit test |
| CSP | Production: `default-src 'none'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`, không `unsafe-inline`/`unsafe-eval`, không kết nối mạng ngoài | `shared/csp.ts`, chèn lúc build | unit test + smoke test |
| Điều hướng / popup | `setWindowOpenHandler` → deny; `will-navigate`/`will-redirect` tới URL không trusted → chặn; `will-attach-webview` → chặn | `main/security/harden.ts` | smoke test (`window.open`, điều hướng) |
| Quyền trình duyệt | Mọi permission request/check/device đều bị từ chối (mic sẽ được mở có điều kiện ở chặng 5) | `harden.ts` | smoke test (notification, microphone) |
| Trusted origin | Dev: đúng origin của Vite dev server. Prod: file nằm trong `out/renderer` (chống path traversal, không phân biệt hoa thường trên Windows) | `main/security/trusted-origin.ts` | unit test |
| DevTools | Tắt trong bản đóng gói | `web-preferences.ts` | unit test |
| Log | URL được bỏ query/hash trước khi ghi; nội dung chat không được ghi | `harden.ts`, `ipc/handlers.ts` | — |
| Endpoint chỉ loopback | Chỉ `http` tới `127.0.0.1`/`[::1]`; `localhost` được đổi thành `127.0.0.1` để file hosts không thể trỏ đi nơi khác; từ chối credentials, path, query. Không đi theo redirect | `shared/ai.ts`, `ai/ollama-provider.ts` | unit test + smoke test |
| Renderer không có mạng | Mọi kết nối tới Ollama đi từ main; CSP của renderer không cho kết nối ra ngoài | `shared/csp.ts` | unit test |
| Tách system prompt | System prompt nằm trong code, chỉ gửi ở vai trò `system`. Văn bản người dùng và của model không bao giờ được ghép vào đó | `ai/conversation.ts`, `ai/system-prompt.ts` | unit test + smoke test |
| Output của model chỉ là văn bản | Chỉ đi tới event và lịch sử, hiển thị bằng text node của React (không `dangerouslySetInnerHTML`). Không có đường code nào hành động theo nội dung của model | `ai/ai-service.ts`, `chat/ChatApp.tsx` | unit test + smoke test (HTML và lệnh giả hiện nguyên văn, không tạo phần tử, không chạy script) |
| File lưu là dữ liệu không tin cậy | Settings và hội thoại được validate khi đọc; file bị sửa không thể cài thêm tin vai trò `system`, giá trị sai rơi về mặc định | `ai/stores.ts` | unit test |
| Giới hạn tài nguyên | Giới hạn tin nhắn đầu vào, lịch sử, 200.000 ký tự mỗi câu trả lời, độ dài dòng stream, timeout | `shared/ai.ts`, `ai/*` | unit test |
| Riêng tư mặc định | Hội thoại chỉ ở trong bộ nhớ trừ khi người dùng bật lưu; tắt lưu là xoá file | `ai/ai-service.ts` | unit test + smoke test |
| Single instance | `requestSingleInstanceLock` | `main/index.ts` | smoke test (lần chạy thứ hai tự thoát) |

## Ngoài phạm vi / rủi ro đã biết

- **Prompt injection:** tách vai trò không ngăn được model làm theo nội dung trong tin nhắn; nó chỉ bảo đảm nội dung đó không thành lệnh của app. Hiện model không có công cụ nào nên hậu quả chỉ giới hạn ở câu trả lời. Chặng 6 phải giữ nguyên tắc này: quyền do main quyết định, không phải do model.
- **Hội thoại lưu không mã hoá:** khi người dùng bật lưu, ai đọc được thư mục dữ liệu của người dùng đều đọc được file. Giao diện có nói rõ điều này.
- **Tiến trình khác trên máy:** bất kỳ chương trình nào đang nghe ở cổng đã cấu hình đều nhận được prompt. App không xác thực được máy chủ loopback là Ollama thật.
- **Smoke test và máy chủ giả lập nằm trong bản build**, chỉ chạy với cờ `--smoke-test`; chặng 8 sẽ loại khỏi bản đóng gói.

- CSP ở chế độ dev cho phép `'unsafe-inline'` và websocket tới localhost (do Vite HMR yêu cầu). Không dùng dev build để chạy hằng ngày.
- Chưa có ký số mã (code signing) cho bản phát hành — chặng 8.
- Electron fuses (tắt `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, bật ASAR integrity) — sẽ cấu hình khi đóng gói ở chặng 8.
- Log hiện ghi ra console; chặng 3 thêm file log có redaction.

## Kế hoạch cho các chặng sau

- **Chặng 5 (mic):** permission handler chỉ cho `media` (audio) từ cửa sổ chat, khi người dùng chủ động bấm.
- **Chặng 6 (computer use):** tool registry với JSON schema; phân loại low/medium/high/blocked; xác nhận do main hiển thị (renderer không tự xác nhận thay người dùng); allowlist ứng dụng theo `app_id`; `open_url` chỉ `http/https`; tìm file chỉ trong thư mục được cho phép; audit log; mọi tool có timeout.

## Báo cáo lỗ hổng

Vui lòng mở issue riêng tư (GitHub Security Advisory) trên repository thay vì issue công khai.
