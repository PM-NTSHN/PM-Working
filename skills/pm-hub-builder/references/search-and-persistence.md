# Tìm kiếm & lưu dữ liệu đã nạp

## Ô tìm kiếm (gõ trực tiếp, không mở cửa sổ riêng)

Có 3 ô `.search-input`: sidebar, topbar (`#topSearch`), hero trang chủ (`#heroSearch`). Gõ vào ô nào thì khung
kết quả `#palette` (`.search-pop`, position fixed) hiện ngay dưới ô đó (`placePalette()`). Ctrl/⌘K hoặc `/` →
focus ô; ↑↓ chọn, Enter mở, Tab nhận gợi ý đầu, Esc đóng. Bấm chip "Tìm nhanh"/tag → điền vào ô.
Người dùng đã yêu cầu rõ: **không** quay lại kiểu modal command palette.

Nhóm kết quả: Hãng · Công cụ · Tài liệu & khóa học (nhóm nào điểm cao hơn lên trước) · **Dữ liệu đã nạp · <tool>**
· **Trong <BOM>**. Dòng trên: "Gợi ý" (cụm từ hoàn thành) và "Từ khóa liên quan" (đồng nghĩa + tag phổ biến).
Chân khung: số mục, số dòng dữ liệu khớp, "đã đọc: CRM 417 dòng", cảnh báo ⚠ nếu không đọc được file, nhắc
mở khóa BOM.

## Engine nội dung (`search.js`)

- Chuẩn hóa `norm()`: thường, bỏ dấu NFD, đ→d. `normMap()` giữ ánh xạ vị trí để tô sáng/trích đoạn trên chữ gốc.
- Chỉ mục ngược theo trường với trọng số: title 12, meta (hãng, giải pháp, loại, section, tags) 7, heading 3, body 1;
  tf bão hòa `1+log(tf)`, nhân idf.
- Mỗi token: khớp đúng (1), gõ dở prefix (0.75, tối đa 40 từ), fuzzy edit-distance ≤1 (≤2 nếu ≥8 ký tự) chỉ khi
  không có khớp nào (0.55). Phủ token: điểm × coverage²; khớp nguyên cụm ở title +40, meta +15; loại mục < 8%
  điểm cao nhất.
- Đồng nghĩa: nhóm được kích hoạt khi câu hỏi chứa trọn một cụm, hoặc là phần đầu của cụm (≥6 ký tự, có dấu cách);
  token đồng nghĩa cộng điểm hệ số 0.6.
- `related(item)`: cùng product +7, cùng giải pháp +5, cùng hãng +4, cùng lĩnh vực +3, tag chung +2.
- Mở tài liệu từ kết quả → `?q=` → `highlightIn()` tìm text node khớp (không dấu) trong iframe, bọc `<mark>`,
  cuộn tới.

Thử nhanh engine bằng Node (không cần trình duyệt): import `SearchEngine` từ `assets/js/search.js`, nạp
`data/catalog.json` + `data/search-index.json`, gọi `.search(q)`, `.suggest(q)`, `.relatedTerms(q, results)`.

## Lưu file đã nạp vào tool (`app.js`: idb, saveImport, hookPersist)

Yêu cầu người dùng: nạp file rồi chuyển mục khác, quay lại, **kể cả F5**, không phải nạp lại.
- Iframe tool không bao giờ bị đóng khi chuyển mục (giữ trạng thái trong phiên).
- Khi iframe `load`: gắn listener **capture** `change` trên `document` của tool (bắt mọi `input[type=file]`) và
  `drop` trên `window` → lưu File vào IndexedDB `pmhub/imports[toolId] = {files, savedAt}` (append: gộp, file
  trùng tên thay bản mới; replace: chỉ file đầu). Capture chạy trước handler của tool nên đọc được file trước khi
  tool reset `input.value`.
- Bọc `window.confirm` của tool: xác nhận câu có "xóa … dữ liệu/file" → xóa bản lưu.
- Nạp lại: `new win.DataTransfer()` + **tạo lại File trong realm của iframe**
  (`new win.File([new win.Uint8Array(buf)], …)`), gán `input.files`, dispatch `change` (cờ `f.replaying` để
  không lưu lại chính nó). Bài học: File/ArrayBuffer từ realm cha làm thư viện Excel của tool lặng lẽ không đọc
  (kiểm `instanceof` khác realm) → luôn tạo trong realm iframe; tương tự khi lọc file nhận được **không dùng
  `instanceof Blob`** mà kiểm `typeof x.arrayBuffer === 'function'`.
- Sau khi nạp lại ~1.2s → `f.ready`; nếu có `?find=` thì điền vào `persist.search` + dispatch `input`/`change`.
- Chip "Đã lưu N file ✕" trên topbar: tooltip liệt kê file + số dòng đã đọc; bấm để xóa và tải lại tool trống.
- Giới hạn cần nói với người dùng: dữ liệu chỉ ở trình duyệt/máy đó; xóa riêng một file trong danh sách của tool
  KPI không đồng bộ ngược (dùng chip để xóa); mở tool ở tab riêng (link gốc) thì không lưu.

## Tìm trong dữ liệu tool (`datasearch.js`)

- Đọc file từ IndexedDB bằng SheetJS (`assets/vendor/xlsx.min.js`, tải lười), mọi sheet: dòng tiêu đề = dòng
  nhiều ô chữ nhất trong 20 dòng đầu; mỗi dòng ≥2 ô thành một bản ghi; tối đa 20.000 dòng/sheet.
- Chọn cột hiển thị theo tên cột chuẩn hóa: id (`id, ma phieu, so po…`), tiêu đề (`ten thuong vu, ten du an,
  khach hang…`), meta (`khach hang, sale, hang, giai doan, trang thai, gia tri…`). Tìm trên **mọi** ô.
- Khớp khi mọi token nằm trong text dòng; điểm cao khi trùng mã/tiêu đề. Mỗi nguồn hiện 5 dòng + "Xem tất cả N
  kết quả". Bấm → `#/v/<tool>?find=<mã>`.
- BOM (khi đã mở khóa): giải mã, lấy chữ hiển thị + chuỗi trong `<script>` (model, SKU, mô tả), lọc rác CSS/code,
  mỗi chuỗi là một bản ghi. Bấm → mở BOM `?q=` tô sáng.
- Chỉ mục đồng bộ (`syncData()`) khi mở ô tìm, sau khi lưu/xóa file, mở/khóa BOM; so chữ ký `savedAt+tên+size`
  để không đọc lại thừa.
- Khi người dùng báo "tìm X không ra": kiểm chân khung ("đã đọc … dòng"?). Có đọc mà 0 khớp → chữ đó có thể do tool
  tự sinh (không nằm trong file gốc) → xin file mẫu. Không thấy "đã đọc" → cache cũ / lỗi đọc file.
