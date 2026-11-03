# Thêm / cập nhật nội dung

Sau mọi thay đổi: `node tools/build.mjs [--src <dir>]` → kiểm thử → commit → push (xem deploy-and-verify.md).

## Tài liệu Sale guide

**Cách ưu tiên:** tài liệu thuộc Knowledge-Hub thì để người dùng (hoặc bạn, nếu được phép) thêm vào repo
`PM-Knowledge-Hub` (file vào `docs/<hãng>/<giải-pháp>/`, một object vào mảng `DOCS` trong `index.html`). Hub tự
lấy về ở lần đồng bộ sau.

**Tài liệu lẻ gửi trực tiếp cho Hub** (thường gặp: người dùng đính kèm file HTML và nói "thêm vào hãng X, đặt
tên dòng giải pháp là Y"):
1. Chép vào `content/sale-guide-extra/<hãng-không-dấu>/<giải-pháp-không-dấu>/<tên-không-dấu>.html`.
   Đặt tên file không dấu, không khoảng trắng.
2. Thêm vào `saleGuide.extraDocs` trong `config/hub.json`:
   ```json
   { "vendor": "Proofpoint", "solution": "Data Security_Proofpoint", "cat": "data",
     "type": "Cẩm nang bán hàng", "title": "<lấy từ <title> của file>", "tags": ["Data Security", "DSPM"],
     "file": "content/sale-guide-extra/proofpoint/data-security/cam-nang-proofpoint-data-security.html" }
   ```
   - `vendor` phải trùng tên hãng đang hiển thị (sau `vendorRename`), nếu không sẽ tạo hãng mới.
   - `solution` dùng đúng chữ người dùng yêu cầu; tài liệu cùng `solution` gom thành một khối.
   - Quiz/trắc nghiệm → `"type": "Bài kiểm tra"`; cẩm nang/playbook/battlecard → "Cẩm nang bán hàng";
     research/phân tích chuyên sâu → "Nghiên cứu".
   - Chọn `cat` gần nhất trong danh sách SOLUTION_CATS (architecture.md).
3. Hãng mới: thêm tên vào `saleGuide.vendorOrder` đúng vị trí người dùng muốn.

## Tool BOM

File người dùng gửi thường là `.rar`/`.zip` "…_admin" chứa `*_BOM_Tool_source.html` (bản chưa khóa, có giá),
`build_secure.py`, `login_gate.html`, `users.csv`. Chỉ cần file `*_source.html`.
1. Giải nén vào scratchpad (không vào repo). `.rar`: `npm i node-unrar-js` trong thư mục tạm rồi dùng
   `createExtractorFromFile`. Kiểm tra file tự chứa (không `src="assets/…"` ngoài).
2. Mã hóa: `PM_HUB_USER=Admin PM_HUB_PASSWORD='…' node tools/encrypt-bom.mjs "<source.html>" <tên>` →
   `content/bom/<tên>.bin`. (Hoặc người dùng tự làm ở `…/tools/bom-encryptor.html`.)
3. `config/hub.json`: mục `bom-<tên>` — bỏ `"status": "soon"`, thêm `"src": "content/bom/<tên>.bin"`, đặt
   `vendor`, `product` (để nối với sale guide), `tags` (model/SKU chính giúp tìm kiếm).
4. Kiểm thử: mở khóa, mở tool, xem `title` của frame blob đúng tên tool.

Không bao giờ commit `*_source.html`, `users.csv` (đã có trong `.gitignore`).

## Tool Tổng hợp (app)

Thêm một section `kind: "app"` với `src` là trang GitHub Pages của tool (cùng origin `pm-ntshn.github.io`).
Để có lưu file + tìm trong dữ liệu, thêm `persist`:
- `input`: selector `<input type=file>` mà tool dùng (tìm trong `index.html` của tool: `type="file"`).
- `mode`: `"append"` nếu tool cộng dồn nhiều file (input có `multiple`), `"replace"` nếu chỉ giữ một file.
- `search`: selector ô tìm kiếm của tool nhận sự kiện `input` (vd `#q`), để bấm kết quả "Dữ liệu" thì lọc sẵn.
Hiện tại: Dealreg `#file-input` append `#q`; PO `#fileInput` replace `#q`; CRM `#fileInput` replace `#q`;
KPI `#fileInput` append (không có ô tìm).

## Update Solution / Learning Center / mục HTML khác

Chép file vào `content/update-solution/` hoặc `content/learning/`, thêm item:
```json
{ "id": "us-ten-ngan", "section": "update-solution", "title": "…", "kind": "html",
  "src": "content/update-solution/ten-file.html", "icon": "scale", "type": "Infographic",
  "desc": "…", "tags": ["…"] }
```
Trang trên GitHub Pages khác (khóa học…) dùng `"kind": "external"` + `"repo"` (để build lấy chữ đánh chỉ mục).

## Từ đồng nghĩa tìm kiếm

Thêm một mảng vào `synonyms` (chữ có dấu, viết thường được): mỗi nhóm là các cách gọi cùng một khái niệm, kể cả
tên hãng/sản phẩm tiêu biểu. Ảnh hưởng: tìm theo một từ ra tài liệu dùng từ kia, và hiện ở "Từ khóa liên quan".

## Icon có sẵn (`icons.js`)

home calculator handshake cart chart target book sparkles graduation search lock unlock star clock external
maximize minimize sun moon logout menu close chevron arrowRight user users key eye server shield activity network
scale trophy file quiz flask presentation grid layers link sidebar refresh tag enter info database.
Thêm icon mới: thêm path SVG 24×24 nét vào object `P`.
