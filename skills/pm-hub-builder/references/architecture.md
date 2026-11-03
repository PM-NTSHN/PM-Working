# Kiến trúc PM Hub

## Cây thư mục

```
index.html                 Khung duy nhất: màn login, sidebar, topbar (ô tìm kiếm), vùng nội dung, khung kết quả tìm kiếm
assets/css/hub.css         Toàn bộ style (token màu ở :root, sáng/tối, responsive)
assets/js/app.js           Ứng dụng: boot, login, router hash, sidebar, các trang, khung iframe, BOM, lưu file, tìm kiếm
assets/js/search.js        Engine tìm kiếm toàn văn (không dấu, prefix, fuzzy, đồng nghĩa, gợi ý, liên quan)
assets/js/datasearch.js    Tìm trong dữ liệu tool: Excel đã nạp (IndexedDB) + nội dung BOM đã giải mã
assets/js/crypto.js        PBKDF2 + AES-GCM dùng chung cho trình duyệt và Node
assets/js/icons.js         Icon SVG nét (kiểu Lucide), không phụ thuộc CDN
assets/vendor/xlsx.min.js  SheetJS (xlsx-js-style), tải lười khi cần đọc Excel
assets/img/logo-nts.png    Logo
config/hub.json            ← nguồn cấu hình duy nhất do người sửa
content/sale-guide/        SINH TỰ ĐỘNG: chép từ repo PM-Knowledge-Hub/docs (bị xóa & chép lại mỗi lần build)
content/sale-guide-extra/  Tài liệu sale guide bổ sung ngoài Knowledge-Hub (khai báo saleGuide.extraDocs)
content/learning/, content/update-solution/   Trang HTML tĩnh
content/bom/*.bin          Tool BOM đã mã hóa
data/auth.json             Salt + chuỗi kiểm tra mật khẩu (không chứa mật khẩu)
data/catalog.json          SINH TỰ ĐỘNG: sections, items, vendors, cats, types, synonyms
data/search-index.json     SINH TỰ ĐỘNG: {id, h: heading, b: body ≤24k ký tự} cho mỗi item
tools/build.mjs            Đồng bộ Knowledge-Hub + sinh catalog/index
tools/encrypt-bom.mjs      Mã hóa BOM bằng CLI; --init tạo auth.json
tools/bom-encryptor.html   Mã hóa BOM ngay trên trình duyệt (cho người không dùng dòng lệnh)
tools/stamp.mjs            Gắn ?v=<sha> vào CSS/JS trong bản deploy (chống cache cũ)
.github/workflows/sync.yml Build → commit nội dung đồng bộ → đóng gói _site → deploy Pages
```

## Luồng dữ liệu

```
PM-Knowledge-Hub/index.html (mảng DOCS, SOLUTION_CATS, TYPE_ORDER)  ─┐
PM-Knowledge-Hub/docs/**                                             ├─ tools/build.mjs ─→ content/sale-guide/
config/hub.json (sections, items, saleGuide, synonyms)               │                    data/catalog.json
content/**/*.html, repo MMM-course/index.html                        ─┘                    data/search-index.json
```

`build.mjs` đọc literal JS `const DOCS = [...]` của Knowledge-Hub bằng cách đếm ngoặc rồi `vm.runInNewContext`
— nên khi Knowledge-Hub đổi tên biến, build sẽ báo "Không tìm thấy …". Chữ cho chỉ mục: bỏ script/style/svg/head,
lấy h1–h3 làm heading, phần thân giới hạn 24.000 ký tự; trang dựng bằng JS (quiz, khóa học) thì lấy thêm chuỗi
văn bản trong `<script>`.

## Schema `config/hub.json`

```jsonc
{
  "sections": [            // thứ tự = thứ tự trên sidebar; "group" tạo tiêu đề nhóm
    { "id": "bom", "title": "Tool chạy BOM", "short": "BOM", "icon": "calculator",
      "kind": "collection", "locked": true, "desc": "…" },
    { "id": "crm", "group": "Tổng hợp & Báo cáo", "title": "Tổng hợp CRM", "short": "CRM", "icon": "chart",
      "kind": "app", "src": "https://pm-ntshn.github.io/Tool_CRM_v2/", "repo": "Tool_CRM_v2",
      "persist": { "input": "#fileInput", "mode": "replace", "search": "#q" },
      "desc": "…", "tags": ["CRM", "Pipeline"] },
    { "id": "sale-guide", "group": "Kiến thức", "kind": "sale-guide", … },
    { "id": "learning", "group": "Kiến thức", "kind": "collection", … }
  ],
  "items": [               // mục con của các section kiểu collection
    { "id": "bom-kemp", "section": "bom", "title": "BOM Kemp LoadMaster", "kind": "bom",
      "src": "content/bom/kemp.bin", "vendor": "Progress", "product": "kemp", "icon": "server",
      "desc": "…", "tags": ["Kemp", "ADC"] },
    { "id": "bom-easynac", …, "status": "soon" },          // "Sắp có": hiện mờ, không mở được
    { "id": "lc-b2b-sales", "section": "learning", "kind": "html", "src": "content/learning/x.html",
      "type": "Khóa học", "icon": "trophy", … },
    { "id": "lc-mmm", "section": "learning", "kind": "external", "src": "https://…", "repo": "MMM-course", … }
  ],
  "saleGuide": {
    "source": "PM-Knowledge-Hub",
    "vendorOrder": ["Progress", "OpenText", …],            // thứ tự hãng
    "vendorRename": { "Easy NAC": "InfoExpress" },
    "productBySolution": { "Kemp LoadMaster — ADC": "kemp", "DLP — Data Loss Prevention@GTB": "gtb" },
    "extraDocs": [ { "vendor": "Proofpoint", "solution": "Data Security_Proofpoint", "cat": "data",
                     "type": "Cẩm nang bán hàng", "title": "…", "tags": […],
                     "file": "content/sale-guide-extra/proofpoint/data-security/x.html" } ]
  },
  "synonyms": [ ["dlp", "chống thất thoát dữ liệu", "gtb", "safetica"], … ]
}
```

- `kind`: section `app` (mở thẳng tool trong iframe), `collection` (trang lưới thẻ), `sale-guide` (trang riêng).
  Item `bom` (giải mã rồi hiển thị qua blob URL), `html` (file trong repo, được đánh chỉ mục), `external` (iframe URL).
- `product` nối BOM ↔ sale guide ↔ "nội dung liên quan" (vd. trang hãng Progress hiện nút BOM Kemp, BOM WUG).
- `cat` của sale guide lấy từ `SOLUTION_CATS` của Knowledge-Hub (pam, nac, dlp, ddos, npm, siem, backup, appsec,
  data, ot, cdr, pentest, vm, adc, email, itm, platform) → quyết định màu + icon.
- `type`: "Cẩm nang bán hàng", "Nghiên cứu", "Bài kiểm tra", "Presales" (+ "Khóa học", "Infographic" cho mục khác).
- id sale guide sinh tự động: `sg-<đường-dẫn-không-dấu>`; id phải duy nhất (build báo "Trùng id").

## Router (hash)

`#/` trang chủ · `#/s/<section>` trang danh mục · `#/s/sale-guide?cat=dlp&type=…` · `#/s/sale-guide/<vendorId>`
trang hãng · `#/v/<itemId>?q=<từ cần tô sáng>&find=<từ điền vào ô tìm của tool>`.

## Khung iframe

`frames` là Map giữ iframe sống (LRU 6 cho tài liệu, **không bao giờ đóng tool `app`**) → chuyển mục rồi quay lại
không mất trạng thái. BOM hiển thị qua `URL.createObjectURL(blob)`; thu hồi khi khóa lại/đăng xuất.
