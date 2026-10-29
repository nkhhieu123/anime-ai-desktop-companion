# Anime AI Desktop Companion

Trợ lý AI dạng nhân vật anime 2D sống trên desktop Windows 10/11. Ưu tiên chạy cục bộ (local-first): không bắt buộc dịch vụ cloud hay API key trả phí.

> **Trạng thái: Chặng 1/8 — nền tảng desktop shell.** Nhân vật, cửa sổ chat và IPC an toàn đã hoạt động. **Chưa có AI**: tin nhắn chat được nhận nhưng chưa được trả lời (Ollama sẽ có ở chặng 3). Xem [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) để biết tiến độ chi tiết.

## Tính năng hiện có

| Tính năng | Trạng thái |
| --- | --- |
| Avatar anime 2D trong suốt, không viền, luôn nổi, không hiện trên taskbar | implemented, tested (smoke test + kiểm tra thủ công) |
| Kéo thả avatar, giữ trong vùng làm việc của màn hình (hỗ trợ nhiều màn hình) | implemented, tested (unit test) |
| Nút mở chat / ẩn avatar; nhấp đúp để mở chat | implemented |
| Hiện lại avatar: icon khay hệ thống hoặc `Ctrl+Alt+A` | implemented |
| Cửa sổ chat riêng (gửi tin, Enter/Shift+Enter, bộ đếm ký tự, hỗ trợ IME tiếng Việt) | implemented, tested (smoke test) |
| Giao diện tiếng Việt / tiếng Anh theo ngôn ngữ hệ điều hành, fallback sang tiếng Anh | implemented, tested (unit test) |
| Renderer sandbox, contextIsolation, CSP, kiểm tra sender IPC | implemented, tested |
| Trả lời bằng AI cục bộ (Ollama) | planned — chặng 3 |
| Giọng nói (STT/TTS) | planned — chặng 4, 5 |
| Mở ứng dụng/website, computer use | planned — chặng 6 |
| Bộ nhớ dài hạn, khởi động cùng Windows, đổi nhân vật | planned — chặng 7 |
| Bộ cài đặt Windows (installer) | planned — chặng 8, **chưa build/kiểm tra** |

## Yêu cầu

- Windows 10/11 x64 (code chạy được trên macOS/Linux để phát triển, nhưng chỉ Windows là mục tiêu chính thức).
- Node.js **22 trở lên** (đã kiểm tra với Node 24.18) và npm.
- Khoảng 500 MB dung lượng cho `node_modules` (gồm Electron).
- Chưa cần GPU hay mô hình AI ở chặng này.

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

## Scripts

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | Chạy chế độ phát triển (Vite HMR + Electron) |
| `npm run build` | Build main, preload, renderer vào `out/` |
| `npm run preview` | Chạy bản build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript cho main/preload và renderer |
| `npm test` | Unit test (Vitest) |
| `npm run test:smoke` | Build rồi khởi động Electron thật, kiểm tra cửa sổ + ranh giới bảo mật, tự thoát với mã 0/1 |
| `npm run check` | lint + typecheck + test + build |
| `npm run dist:win` | Build installer NSIS (**chưa được cấu hình/kiểm tra — chặng 8**) |

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
| Nền avatar màu đen thay vì trong suốt | Một số driver GPU không hỗ trợ cửa sổ trong suốt. Cập nhật driver; tuỳ chọn tắt tăng tốc phần cứng sẽ có ở chặng 2. |
| `Ctrl+Alt+A` không hoạt động | Phím tắt đã bị ứng dụng khác chiếm (xem log "global shortcut unavailable"). Dùng icon khay hệ thống. |
| Không thấy icon khay | Windows có thể ẩn icon vào menu `^` trên taskbar; kéo nó ra ngoài. |
| Avatar mất sau khi rút màn hình phụ | Nhấn `Ctrl+Alt+A` hai lần; lưu/khôi phục vị trí sẽ có ở chặng 2. |

## Kiểm thử thủ công (chặng 1)

- [ ] `npm run dev`: avatar xuất hiện góc dưới phải, nền trong suốt, không có viền, không có trên taskbar.
- [ ] Mở một cửa sổ khác: avatar vẫn nằm trên.
- [ ] Kéo avatar tới các mép màn hình: không lọt xuống dưới taskbar hoặc ra ngoài màn hình. Nếu có màn hình phụ: kéo sang được.
- [ ] Rê chuột lên avatar: hiện 2 nút; bấm 💬 mở chat bên trái avatar; nhấp đúp cũng mở chat.
- [ ] Gõ tiếng Việt có dấu bằng Unikey/Telex, nhấn Enter khi đang gõ dấu: không gửi nhầm giữa chừng.
- [ ] Gửi tin: hiện thông báo "Chưa kết nối AI" rõ ràng.
- [ ] Bấm ẩn: avatar biến mất; `Ctrl+Alt+A` hoặc icon khay hiện lại.
- [ ] Đóng chat rồi mở lại: hoạt động bình thường. Đóng chat không làm thoát ứng dụng.
- [ ] Mở ứng dụng lần hai: không tạo thêm avatar (single instance).
- [ ] Khay → Thoát: ứng dụng đóng hoàn toàn.

## Giới hạn hiện tại

- Chưa có AI, giọng nói, computer use, bộ nhớ — xem bảng ở trên.
- Vùng trong suốt của cửa sổ avatar (240×320) vẫn nhận chuột; chưa có click-through theo từng pixel.
- Vị trí avatar chưa được lưu giữa các lần chạy; ngôn ngữ UI chưa chọn được trong app (theo hệ điều hành).
- Installer Windows chưa được build hay kiểm tra.

## Giấy phép

`package.json` hiện ghi MIT; chủ dự án cần xác nhận và thêm file `LICENSE` trước khi phát hành.
