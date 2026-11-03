---
name: pm-hub-builder
description: >-
  Dựng, mở rộng và bảo trì "PM Hub" — cổng web tĩnh (GitHub Pages) gom mọi công cụ của phòng Quản lý Sản phẩm
  NTS Hà Nội vào một link: login theo màu nhận diện NTS, Tool chạy BOM mã hóa AES-256, các tool Tổng hợp
  (Dealreg, PO, CRM, KPI) nhúng iframe và tự lưu/nạp lại file Excel, Sale guide theo hãng & dòng giải pháp,
  Update Solution, Learning Center, ô tìm kiếm toàn văn (không dấu, gõ sai, đồng nghĩa, tìm cả trong dữ liệu
  đã nạp và trong BOM). Dùng skill này BẤT CỨ KHI NÀO người dùng nhắc tới PM Hub, PM-Working, pm-ntshn.github.io,
  muốn thêm tài liệu sale guide / hãng / dòng giải pháp, thêm hoặc cập nhật tool BOM, thêm tool tổng hợp, đổi
  mật khẩu Hub, sửa giao diện / tìm kiếm của Hub, hoặc muốn làm một trang tổng hợp công cụ / cổng nội bộ tương tự
  theo cùng style (kể cả khi không gọi tên "PM Hub").
---

# PM Hub builder

PM Hub là **một trang web tĩnh, không framework, không bước build front-end**: HTML + CSS + ES module thuần,
dữ liệu trong `config/hub.json`, một script Node sinh `data/catalog.json` + `data/search-index.json`, và một
GitHub Action đồng bộ nội dung + deploy GitHub Pages. Repo đang chạy: `PM-NTSHN/PM-Working`, link
`https://pm-ntshn.github.io/PM-Working/`. Toàn bộ mã nguồn mẫu nằm trong `assets/template/` của skill này.

Người dùng (PM, không phải lập trình viên) giao tiếp bằng tiếng Việt, muốn kết quả **đẹp, hiện đại, dùng ngay**,
và thường yêu cầu "sửa xong tự push và update". Trả lời bằng tiếng Việt, ngắn gọn, nói rõ đã kiểm thử gì,
chưa kiểm được gì.

## Bắt đầu: xác định tình huống

1. **Đang có repo PM-Working** (thường gặp nhất) → làm việc trực tiếp trong repo đó. Đọc `config/hub.json`
   và `README.md` của repo trước; code trong repo là nguồn đúng nhất, mẫu trong skill có thể cũ hơn.
2. **Dựng Hub mới** (cho phòng khác, hoặc repo trống) → chép `assets/template/` vào repo, rồi làm theo
   "Dựng mới" bên dưới.
3. **Chỉ hỏi phương án** → tư vấn trước, chưa code. Người dùng thích được trình bày phương án + điểm cần chốt
   rồi mới làm.

Đọc thêm khi cần (đừng đọc hết một lúc):

| Khi làm việc này | Đọc |
|---|---|
| Hiểu cấu trúc file, luồng dữ liệu, schema `hub.json` | `references/architecture.md` |
| Thêm/sửa nội dung: sale guide, hãng, BOM, tool, khóa học | `references/content-ops.md` |
| Giao diện, màu NTS, login, layout trang, thành phần UI | `references/design-style.md` |
| Đăng nhập, mã hóa BOM, đổi mật khẩu, giới hạn bảo mật | `references/security.md` |
| Ô tìm kiếm, lưu file đã nạp, tìm trong dữ liệu tool | `references/search-and-persistence.md` |
| Build, kiểm thử Playwright, push, deploy, xử lý lỗi | `references/deploy-and-verify.md` |

## Nguyên tắc làm việc (vì sao nó quan trọng)

- **Không sửa code của các tool gốc** (Tools-Dealreg, Tool_tonghop_PO, Tool_CRM_v2, HCNS-KPI, MMM-course,
  PM-Knowledge-Hub). Chúng là repo riêng, đang chạy độc lập; Hub chỉ nhúng (iframe cùng origin
  `pm-ntshn.github.io`) và "bọc" thêm tính năng từ bên ngoài (lưu file, điền ô tìm kiếm). Nhờ cùng origin nên Hub
  đọc được `contentDocument` của tool.
- **Cấu hình trước, code sau.** Thêm mục mới gần như luôn chỉ là: chép file vào `content/…` + thêm một object
  vào `config/hub.json` + `node tools/build.mjs`. Chỉ sửa JS/CSS khi cần tính năng mới.
- **Không bao giờ commit bí mật hoặc dữ liệu giá chưa mã hóa**: mật khẩu dạng chữ, file `*_source.html` của BOM,
  `users.csv`. Mật khẩu chỉ truyền qua biến môi trường khi chạy script. Giải nén file người dùng gửi vào thư mục
  tạm (scratchpad), không vào repo.
- **Nội dung sinh tự động không sửa tay**: `content/sale-guide/` (đồng bộ từ PM-Knowledge-Hub, bị xóa và chép lại
  mỗi lần build), `data/catalog.json`, `data/search-index.json`. Tài liệu lẻ ngoài Knowledge-Hub đặt ở
  `content/sale-guide-extra/` và khai báo ở `saleGuide.extraDocs`.
- **Kiểm thử thật trước khi push**: chạy `scripts/verify_hub.cjs` (Playwright) trên server tĩnh cục bộ, xem ảnh
  chụp. Môi trường cloud thường không truy cập được `pm-ntshn.github.io` → dùng các repo tool clone về và cho
  Playwright phục vụ chúng cùng origin (script đã làm sẵn với `--tools-src`).
- **Nói thật về giới hạn**: login trên trang tĩnh chỉ là lớp giao diện; chỉ phần BOM được mã hóa mới thực sự an
  toàn. Khi không kiểm được (thiếu file mẫu thật, không có mạng tới tool) thì nói rõ và nhờ người dùng thử.

## Quy trình chuẩn cho một thay đổi

1. Hiểu yêu cầu; nếu là việc lớn/mơ hồ → đề xuất phương án và chờ chốt.
2. Sửa `config/hub.json` / thêm file nội dung / sửa code.
3. `node tools/build.mjs --src <thư mục chứa repo nguồn đã clone>` (hoặc không có `--src` để tự clone vào `.cache/`).
   Xem cảnh báo "thiếu file", "nội dung ngắn".
4. `python3 -m http.server 8765` ở gốc repo, rồi
   `node <skill>/scripts/verify_hub.cjs --url http://localhost:8765/ --user Admin --pass "$PM_HUB_PASSWORD" --out <scratchpad>/shots`
   (thêm `--tools-src … --xlsx … --tool crm` khi đụng tới tool Tổng hợp). Mở ảnh chụp để tự soát giao diện.
5. Commit (message tiếng Việt, mô tả "vì sao"), `git pull --rebase` trước (bot của workflow hay commit
   "chore: đồng bộ nội dung PM Hub" — nếu xung đột chỉ ở `data/*.json` thì giữ bản mới của mình hoặc build lại), push.
6. Push lên nhánh deploy sẽ kích hoạt workflow; kiểm tra run thành công rồi mới báo người dùng, kèm link.
   Nhắc Ctrl+F5 chỉ khi bản deploy chưa có bước `stamp.mjs`.

## Dựng mới từ mẫu

1. Chép `assets/template/` (kể cả `.github/`, `.gitignore`, `.nojekyll`) vào gốc repo mới.
2. Mẫu đã kèm thư viện đọc Excel `assets/vendor/xlsx.min.js` (xlsx-js-style, giấy phép trong cùng thư mục) —
   dùng cho tính năng tìm trong dữ liệu đã nạp; chỉ tải khi có file đã lưu.
3. Sửa `config/hub.json`: các `sections` (tiêu đề, `src` của tool), `items`, `saleGuide.source`. Bản cấu hình
   đầy đủ của PM-Working để tham khảo: `config/hub.example.json`.
4. Tạo `data/auth.json` (salt + chuỗi kiểm tra, không chứa mật khẩu):
   `PM_HUB_USER=<user> PM_HUB_PASSWORD='<mật khẩu>' node tools/encrypt-bom.mjs --init`
5. Mã hóa từng tool BOM: `… node tools/encrypt-bom.mjs <file_source.html> <tên>` → `content/bom/<tên>.bin`.
6. Cá nhân hóa: logo `assets/img/logo-nts.png`, dòng chữ dưới tiêu đề login trong `index.html`
   (`.login-sub`), lời chào "Chào buổi…, Minh" trong `renderHome()` của `assets/js/app.js`, màu trong `:root`
   của `assets/css/hub.css`.
7. Build, kiểm thử, push. Bật GitHub Pages: Settings → Pages → Source: **GitHub Actions**. Workflow chạy khi
   push lên `main` (thêm nhánh khác vào `on.push.branches` nếu repo chưa có `main`). GitHub chỉ "nhận" file
   workflow sau một lần push vào nhánh mặc định.

## Báo cáo cho người dùng

Kết thúc mỗi lần làm bằng: đã làm gì (theo gạch đầu dòng, ngôn ngữ người dùng hiểu), đã kiểm thử gì và kết quả,
điều gì chưa kiểm được và người dùng cần thử gì, link trang. Gửi kèm 1–3 ảnh chụp màn hình khi thay đổi giao diện.
