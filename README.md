# PM Hub · NTS Hà Nội

Một đường link duy nhất cho toàn bộ công cụ của PM: lên BOM, tổng hợp Dealreg / PO / CRM / KPI, Sale guide, Update solution, Learning Center.

**Địa chỉ:** `https://pm-ntshn.github.io/PM-Working/` (sau khi bật GitHub Pages, xem bên dưới).

## Cấu trúc nội dung

| Mục | Nguồn | Cách hiển thị |
|---|---|---|
| 1. Tool chạy BOM 🔒 | `content/bom/*.bin` (đã mã hóa AES-256) | Giải mã trên trình duyệt sau khi nhập tài khoản lần 2 |
| 2–5. Tổng hợp Dealreg / Đặt hàng / CRM / KPI | Repo `Tools-Dealreg`, `Tool_tonghop_PO`, `Tool_CRM_v2`, `HCNS-KPI` | Nhúng nguyên trang đang chạy, tự cập nhật theo repo gốc |
| 6. Sale Guide | Repo `PM-Knowledge-Hub` | Đồng bộ tự động vào `content/sale-guide/` |
| 7. Update Solution | `content/update-solution/` | Trang HTML |
| 8. Learning Center | `MMM-course` (nhúng) + `content/learning/` | Trang HTML |

```
index.html              Khung Hub: login, sidebar, tìm kiếm, vùng nội dung
assets/                 CSS, JS (app, search, crypto, icons), logo
config/hub.json         ← SỬA FILE NÀY để thêm mục / đổi tên / từ đồng nghĩa
content/                Nội dung (sale-guide được sinh tự động — không sửa tay)
data/catalog.json       Sinh tự động: danh mục
data/search-index.json  Sinh tự động: chỉ mục tìm kiếm toàn văn
data/auth.json          Salt + chuỗi kiểm tra mật khẩu (không chứa mật khẩu)
tools/build.mjs         Build: đồng bộ Sale guide + sinh catalog/index
tools/encrypt-bom.mjs   Mã hóa BOM bằng dòng lệnh
tools/bom-encryptor.html Mã hóa BOM ngay trên trình duyệt (không cần cài gì)
```

## Bật GitHub Pages (một lần)

1. Merge nhánh này vào `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflow `.github/workflows/sync.yml` sẽ build và deploy. Nó tự chạy khi có push lên `main`, mỗi sáng 06:17, hoặc bấm tay ở tab **Actions → Run workflow**. Mỗi lần chạy, Sale guide mới nhất được kéo về từ `PM-Knowledge-Hub`.

## Thêm / cập nhật nội dung

- **Sale guide**: chỉ cần thêm vào repo `PM-Knowledge-Hub` như hiện nay. PM Hub tự lấy về trong lần đồng bộ kế tiếp.
- **Tài liệu Update Solution / Learning**: chép file HTML vào `content/update-solution/` hoặc `content/learning/`, rồi thêm một mục vào `items` trong `config/hub.json`:
  ```json
  { "id": "us-ten-ngan", "section": "update-solution", "title": "Tên hiển thị", "kind": "html",
    "src": "content/update-solution/ten-file.html", "icon": "sparkles", "type": "Infographic",
    "desc": "Mô tả ngắn", "tags": ["Từ khóa 1", "Từ khóa 2"] }
  ```
- **Tool BOM mới** (vd. GTB, Easy NAC đang để "Sắp có"):
  1. Mở `https://pm-ntshn.github.io/PM-Working/tools/bom-encryptor.html`, nhập tài khoản PM, chọn file `*_BOM_Tool_source.html` → tải về file `.bin`.
  2. Đưa file `.bin` vào `content/bom/`.
  3. Trong `config/hub.json`, ở mục BOM tương ứng: bỏ `"status": "soon"` và thêm `"src": "content/bom/<tên>.bin"`.
- **Tìm kiếm**: thêm nhóm từ đồng nghĩa vào `synonyms` trong `config/hub.json`.

Build thử trên máy: `node tools/build.mjs` (Node 22+), rồi chạy một web server tĩnh, vd. `python3 -m http.server`.

## Bảo mật (mức B)

- **Login vào Hub**: kiểm tra bằng PBKDF2-SHA256 (250.000 vòng). Trong repo không lưu mật khẩu dạng chữ. Phiên đăng nhập được nhớ 7 ngày nếu tick "Ghi nhớ", nếu không thì 12 giờ.
- **Tool BOM**: mã hóa AES-256-GCM, khóa sinh từ tài khoản và mật khẩu. Không có mật khẩu thì không đọc được giá, kể cả khi xem mã nguồn. Mở khóa một lần là dùng cho cả phiên tab. Đóng tab hoặc bấm "Khóa lại" thì phải nhập lại.
- **Giới hạn**: lớp login vào Hub chỉ chặn ở phía giao diện. Sale guide và 4 tool Tổng hợp vẫn công khai ở link gốc trên GitHub. Nếu cần chặn thật ở phía máy chủ, dùng phương án C: chuyển repo sang private, host trên Cloudflare Pages và đặt Cloudflare Access.
- **Đổi mật khẩu**:
  1. Chạy `PM_HUB_USER=... PM_HUB_PASSWORD=... node tools/encrypt-bom.mjs --init`.
  2. Mã hóa lại từng file BOM: `node tools/encrypt-bom.mjs <file-nguon.html> <ten>`.
  3. Commit `data/auth.json` và `content/bom/`. Mọi phiên đăng nhập cũ tự hết hiệu lực.
- **Không commit** file BOM gốc chưa khóa hay `users.csv` (đã có trong `.gitignore`).

## Lưu dữ liệu đã nạp ở 4 tool Tổng hợp

Khi nạp file Excel (bấm chọn hoặc kéo-thả) vào Dealreg / PO / CRM / KPI bên trong PM Hub, Hub lưu file vào IndexedDB của trình duyệt và tự nạp lại khi mở lại tool hoặc F5 — không cần sửa code của từng tool (cấu hình ở mục `persist` trong `config/hub.json`). Dealreg & KPI cộng dồn nhiều file (file trùng tên thì thay bản mới), PO & CRM giữ file mới nhất. Nút **"Đã lưu N file ✕"** trên thanh trên cùng để xem / xóa dữ liệu đã lưu; nút "Xoá dữ liệu" trong tool Dealreg cũng xóa luôn bản lưu. Dữ liệu chỉ nằm trên máy đang dùng.

## Tìm kiếm trong dữ liệu của tool

Ô tìm kiếm tìm cả trong:
- **Dữ liệu đã nạp** vào Dealreg / PO / CRM / KPI: Hub đọc các file Excel đã lưu (thư viện `assets/vendor/xlsx.min.js`), mỗi dòng là một kết quả, tìm trên mọi cột (mã, tên, khách hàng, sale, hãng, giai đoạn…). Chọn kết quả → mở tool và tự điền từ khóa vào ô tìm kiếm của tool (cấu hình `persist.search`).
- **Nội dung các tool BOM** (model, SKU, mô tả) khi BOM đã mở khóa trong phiên. Chọn kết quả → mở BOM và tô sáng từ khóa.

Mọi xử lý đều trên trình duyệt, dữ liệu không gửi đi đâu.

## Phím tắt

`Ctrl/⌘ K` hoặc `/`: đưa con trỏ vào ô tìm kiếm (gõ trực tiếp, kết quả hiện ngay bên dưới) · `↑ ↓ Enter`: chọn kết quả · `Tab`: nhận gợi ý · `Esc`: đóng.
