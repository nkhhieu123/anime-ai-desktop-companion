# Anime AI Desktop Companion

Trợ lý AI dạng nhân vật anime 2D sống trên desktop Windows 10/11. Ưu tiên chạy cục bộ (local-first): không bắt buộc dịch vụ cloud hay API key trả phí.

> **Trạng thái: đang ở Chặng 2/8 — AI Core chạy cục bộ.** Chat đã nối với Ollama và đã kiểm thử với **máy chủ giả lập**. **Chưa được kiểm thử với Ollama thật và model thật** (xem [Kiểm thử](#kiểm-thử)). Xem [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) để biết tiến độ chi tiết.

## Tính năng hiện có

| Tính năng | Trạng thái |
| --- | --- |
| Avatar anime 2D trong suốt, không viền, luôn nổi, không hiện trên taskbar | implemented, tested (smoke test + kiểm tra thủ công) |
| Kéo thả avatar, giữ trong vùng làm việc của màn hình (hỗ trợ nhiều màn hình) | implemented, tested (unit test) |
| Nút mở chat / ẩn avatar; nhấp đúp để mở chat | implemented |
| Hiện lại avatar: icon khay hệ thống hoặc `Ctrl+Alt+A` | implemented |
| Cửa sổ chat riêng (gửi tin, Enter/Shift+Enter, bộ đếm ký tự, hỗ trợ IME tiếng Việt) | implemented, tested (smoke test) |
| Trả lời bằng model cục bộ qua Ollama: streaming, nút dừng, giới hạn đầu vào và lịch sử | implemented, tested với máy chủ giả lập; **chưa kiểm thử với Ollama thật** |
| Màn hình chọn model, kiểm tra kết nối, thông báo model chưa tải và lỗi Ollama | implemented, tested với máy chủ giả lập; **chưa kiểm thử với Ollama thật** |
| Lưu hội thoại trên máy theo lựa chọn (mặc định tắt) | implemented, tested |
| Chọn ngôn ngữ trả lời của AI (theo người dùng / tiếng Việt / tiếng Anh) | implemented; chất lượng trả lời phụ thuộc model, chưa kiểm chứng |
| Giao diện tiếng Việt / tiếng Anh theo ngôn ngữ hệ điều hành, fallback sang tiếng Anh | implemented, tested (unit test) |
| Renderer sandbox, contextIsolation, CSP, kiểm tra sender IPC | implemented, tested |
| Chọn ngôn ngữ giao diện trong app, SQLite, log ra file | planned — chặng 3 |
| Giọng nói (STT/TTS) | planned — chặng 4, 5 |
| Mở ứng dụng/website, computer use | planned — chặng 6 |
| Bộ nhớ dài hạn, khởi động cùng Windows, đổi nhân vật | planned — chặng 7 |
| Bộ cài đặt Windows (installer) | planned — chặng 8, **chưa build/kiểm tra** |

## Yêu cầu

- Windows 10/11 x64 (code chạy được trên macOS/Linux để phát triển, nhưng chỉ Windows là mục tiêu chính thức).
- Node.js **22 trở lên** (đã kiểm tra với Node 24.18) và npm.
- Khoảng 500 MB dung lượng cho `node_modules` (gồm Electron).
- Để chat: [Ollama](https://ollama.com) và ít nhất một model. Không cần tài khoản cloud hay API key.
- Yêu cầu RAM, GPU và dung lượng phụ thuộc model bạn chọn; xem trang của model trên ollama.com. Dự án chưa đo kiểm phần cứng tối thiểu.

## Cài đặt và chạy

```bash
git clone https://github.com/nkhhieu123/anime-ai-desktop-companion.git
cd anime-ai-desktop-companion
npm install
npm run dev
```

> **npm 11+ (allowScripts):** `package.json` đã cho phép script cài đặt của `electron` (tải binary Electron) và `electron-winstaller`. Nếu npm vẫn báo chặn script, hãy chạy `npm install-scripts approve electron electron-winstaller` rồi `npm rebuild electron`.

Khi chạy, nhân vật xuất hiện ở góc dưới bên phải màn hình chính.

- **Di chuyển:** kéo nhân vật bằng chuột trái.
- **Mở chat:** di chuột lên nhân vật → nút 💬, hoặc nhấp đúp vào nhân vật.
- **Ẩn:** nút con mắt gạch chéo. **Hiện lại:** nhấp icon ở khay hệ thống, hoặc `Ctrl+Alt+A`.
- **Thoát:** chuột phải icon khay → *Thoát*.

## Dùng với Ollama

1. Cài Ollama từ [ollama.com](https://ollama.com) và bảo đảm nó đang chạy.
2. Tải một model, ví dụ: `ollama pull llama3.2`. Xem danh sách đã tải bằng `ollama list`, xoá bằng `ollama rm <tên>`.
3. Trong app: mở chat → nút ⚙ → **Kiểm tra kết nối** → chọn model → **Quay lại chat**.

App chỉ kết nối tới địa chỉ trên chính máy này (`127.0.0.1`, `localhost`, `[::1]`); địa chỉ khác bị từ chối. Mặc định là `http://127.0.0.1:11434`.

### Dữ liệu được lưu ở đâu

Trong thư mục dữ liệu của app (Windows: `%APPDATA%\anime-ai-desktop-companion`):

| File | Nội dung | Khi nào có |
| --- | --- | --- |
| `ai-settings.json` | Địa chỉ Ollama, model, các giới hạn | Khi bạn đổi cài đặt |
| `conversation.json` | Hội thoại, **không mã hoá** | Chỉ khi bật "Lưu hội thoại trên máy này". Tắt tuỳ chọn sẽ xoá file này |

Mặc định hội thoại chỉ nằm trong bộ nhớ và mất khi thoát app. Nội dung tin nhắn không được ghi vào log.

## Scripts

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | Chạy chế độ phát triển (Vite HMR + Electron) |
| `npm run build` | Build main, preload, renderer vào `out/` |
| `npm run preview` | Chạy bản build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript cho main/preload và renderer |
| `npm test` | Unit và integration test với máy chủ giả lập; không cần Ollama |
| `npm run test:live` | Test với **Ollama thật**, xem [Kiểm thử](#kiểm-thử) |
| `npm run test:smoke` | Build rồi khởi động Electron thật, kiểm tra cửa sổ + ranh giới bảo mật, tự thoát với mã 0/1. Hãy đóng app đang chạy trước |
| `npm run check` | lint + typecheck + test + build |
| `npm run dist:win` | Build installer NSIS (**chưa được cấu hình/kiểm tra — chặng 8**) |

## Kiểm thử

| Bài test | Cần Ollama thật? | Lệnh |
| --- | --- | --- |
| `tests/ollama-provider.test.ts`, `ai-service.test.ts`, các test khác | Không, dùng máy chủ giả lập trên loopback | `npm test` |
| Smoke test, chạy Electron thật qua giao diện thật | Không, dùng máy chủ giả lập và thư mục dữ liệu tạm | `npm run test:smoke` |
| `tests/ollama.live.test.ts` | **Có**, Ollama đang chạy và model đã tải | `OLLAMA_LIVE_MODEL=llama3.2:latest npm run test:live` |

Nếu không đặt `OLLAMA_LIVE_MODEL`, các test live bị bỏ qua (hiện là "skipped") và **không có nghĩa là đã đạt**. Trong PowerShell: `$env:OLLAMA_LIVE_MODEL="llama3.2:latest"; npm run test:live`.

## Cấu trúc thư mục

```
src/
  main/        Electron main process (cửa sổ, IPC, bảo mật, tray)
  preload/     Cầu nối duy nhất giữa renderer và main (window.companion)
  renderer/    UI React: avatar.html, chat.html
  shared/      Code dùng chung: hợp đồng IPC, validate, i18n, CSP, file dịch
tests/         Unit test
docs/          Kiến trúc, mô hình bảo mật
```

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/SECURITY.md](docs/SECURITY.md)

## Thêm ngôn ngữ giao diện

1. Sao chép `src/shared/locales/en-US.json` thành `src/shared/locales/<mã>.json` (ví dụ `ja-JP.json`) và dịch các giá trị.
2. Đăng ký file trong `catalogs` ở `src/shared/i18n.ts`.
3. Chạy `npm test` — test sẽ báo nếu thiếu key so với `en-US`. Key thiếu sẽ tự rơi về tiếng Anh khi chạy.

## Khắc phục lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| `npm install` xong nhưng `npm run dev` báo *Electron failed to install correctly* | Script cài đặt của Electron bị chặn: `npm install-scripts approve electron` rồi `npm rebuild electron`. |
| Nền avatar màu đen thay vì trong suốt | Một số driver GPU không hỗ trợ cửa sổ trong suốt. Cập nhật driver; tuỳ chọn tắt tăng tốc phần cứng sẽ có ở chặng 3. |
| Chat báo "Không kết nối được Ollama" | Kiểm tra Ollama đang chạy: mở `http://127.0.0.1:11434` trong trình duyệt, hoặc chạy `ollama list`. Kiểm tra địa chỉ trong ⚙. |
| "Model chưa được tải" | Chạy lệnh `ollama pull <tên model>` mà app hiển thị, rồi bấm **Kiểm tra kết nối**. |
| Danh sách model trống | Chưa tải model nào: `ollama pull llama3.2`. |
| "Model phản hồi quá lâu" | Lần đầu nạp model có thể lâu. Tăng thời gian chờ trong ⚙ hoặc dùng model nhỏ hơn. |
| `npm run test:smoke` báo "another instance is running" | Đóng app đang chạy rồi chạy lại. |
| `Ctrl+Alt+A` không hoạt động | Phím tắt đã bị ứng dụng khác chiếm (xem log "global shortcut unavailable"). Dùng icon khay hệ thống. |
| Không thấy icon khay | Windows có thể ẩn icon vào menu `^` trên taskbar; kéo nó ra ngoài. |
| Avatar mất sau khi rút màn hình phụ | Nhấn `Ctrl+Alt+A` hai lần; lưu/khôi phục vị trí sẽ có ở chặng 3. |

## Kiểm thử thủ công

- [ ] `npm run dev`: avatar xuất hiện góc dưới phải, nền trong suốt, không có viền, không có trên taskbar.
- [ ] Mở một cửa sổ khác: avatar vẫn nằm trên.
- [ ] Kéo avatar tới các mép màn hình: không lọt xuống dưới taskbar hoặc ra ngoài màn hình. Nếu có màn hình phụ: kéo sang được.
- [ ] Rê chuột lên avatar: hiện 2 nút; bấm 💬 mở chat bên trái avatar; nhấp đúp cũng mở chat.
- [ ] Gõ tiếng Việt có dấu bằng Unikey/Telex, nhấn Enter khi đang gõ dấu: không gửi nhầm giữa chừng.
- [ ] Chưa cài Ollama: thanh trên báo "Không kết nối được Ollama"; gửi tin hiện lỗi rõ ràng, app không treo.
- [ ] Có Ollama: ⚙ → Kiểm tra kết nối → danh sách đúng với `ollama list`, chọn model được.
- [ ] Gửi tin tiếng Việt: chữ hiện dần, dấu đúng. Hỏi tiếp một câu liên quan: model nhớ ngữ cảnh.
- [ ] Bấm **Dừng** khi đang trả lời: dừng ngay, giữ phần đã có. Trong `ollama ps` hoặc CPU/GPU, model ngừng sinh chữ.
- [ ] Tắt Ollama giữa chừng: hiện lỗi, gửi lại được sau khi bật lại.
- [ ] Bật "Lưu hội thoại", chat, thoát và mở lại: hội thoại còn. Tắt tuỳ chọn: `conversation.json` biến mất.
- [ ] Đóng cửa sổ chat khi đang trả lời: model dừng; mở lại vẫn dùng được.
- [ ] Bấm ẩn: avatar biến mất; `Ctrl+Alt+A` hoặc icon khay hiện lại.
- [ ] Đóng chat rồi mở lại: hoạt động bình thường. Đóng chat không làm thoát ứng dụng.
- [ ] Mở ứng dụng lần hai: không tạo thêm avatar (single instance).
- [ ] Khay → Thoát: ứng dụng đóng hoàn toàn.

## Giới hạn hiện tại

- **Chưa kiểm thử với Ollama thật.** Máy phát triển chưa cài Ollama, nên mọi bằng chứng tự động hiện dùng máy chủ giả lập mô phỏng API của Ollama.
- Chưa có giọng nói, computer use, bộ nhớ dài hạn — xem bảng ở trên.
- AI chỉ trò chuyện, không có công cụ nào: không mở được ứng dụng hay làm gì trên máy.
- Chỉ có một hội thoại; chưa có danh sách nhiều hội thoại. Chưa hiển thị Markdown (câu trả lời hiện nguyên văn).
- Chưa tải được model từ trong app; dùng `ollama pull`.
- Vùng trong suốt của cửa sổ avatar (240×320) vẫn nhận chuột; chưa có click-through theo từng pixel.
- Vị trí avatar chưa được lưu giữa các lần chạy; ngôn ngữ UI chưa chọn được trong app (theo hệ điều hành).
- Installer Windows chưa được build hay kiểm tra.

## Giấy phép

`package.json` hiện ghi MIT; chủ dự án cần xác nhận và thêm file `LICENSE` trước khi phát hành.
