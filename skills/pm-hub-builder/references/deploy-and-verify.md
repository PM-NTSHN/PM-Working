# Build, kiểm thử, deploy

## Build cục bộ

```bash
# clone nguồn một lần (shallow) vào thư mục tạm, rồi:
node tools/build.mjs --src <dir chứa PM-Knowledge-Hub, MMM-course, …>
# hoặc để build tự clone vào .cache/ (cần mạng tới github.com):
node tools/build.mjs
```
Kết quả in: số tài liệu/hãng, kích thước catalog & index, cảnh báo `! thiếu file` và `! nội dung ngắn` (BOM luôn
ngắn — bình thường).

## Kiểm thử bằng trình duyệt thật

```bash
python3 -m http.server 8765 &     # ở gốc repo
node <skill>/scripts/verify_hub.cjs --url http://localhost:8765/ --user Admin --pass "$PM_HUB_PASSWORD" \
     --out <scratchpad>/shots [--tools-src <dir repo tool đã clone> --xlsx <file thử> --tool crm]
```
Script kiểm: login sai/đúng, Sale guide, trang hãng, ô tìm kiếm, mở khóa + giải mã BOM, (tuỳ chọn) nạp file →
F5 → tự nạp lại, không có lỗi JS. Thoát mã 1 nếu có bước FAIL. Luôn mở vài ảnh để soát mắt.
- Môi trường cloud: `pm-ntshn.github.io` thường bị chặn → dùng `--tools-src` để tool chạy cùng origin.
- Font Google / Tailwind CDN bị chặn trong sandbox → trang infographic dùng Tailwind CDN trông "vỡ" khi thử cục bộ;
  trên mạng thật hiển thị đúng — đừng "sửa" nó.
- Tạo file Excel thử bằng `openpyxl` (Dealreg cần cột `ID, Tên, Trạng thái, Tên khối`). Tool CRM chỉ nhận file
  export thật (sheet "1 - Bảng danh mục sản phẩm dự án" hoặc template "Data") — file tự tạo chỉ dùng thử phần
  tìm kiếm của Hub.
- Lệnh `pkill -f "http.server"` có thể giết luôn shell đang chạy lệnh (vì chuỗi khớp) → tránh, hoặc dùng
  `curl -s localhost:8765 || (nohup python3 -m http.server 8765 &)`.

## Workflow GitHub Actions (`.github/workflows/sync.yml`)

Kích hoạt: push lên nhánh trong `on.push.branches`, lịch 06:17 giờ VN hằng ngày, bấm tay (workflow_dispatch).
Các bước: checkout → Node 22 → `node tools/build.mjs` (clone Knowledge-Hub mới nhất) → commit
`content/sale-guide` + `data` với tên "pm-hub-bot" ("chore: đồng bộ nội dung PM Hub") → đóng gói `_site`
(`index.html assets content data tools`, bỏ `tools/*.mjs`) → `tools/stamp.mjs _site <sha8>` gắn `?v=` vào CSS/JS
(chống cache 10 phút của Pages) → upload-pages-artifact → deploy-pages.

Thiết lập một lần: Settings → Pages → Source **GitHub Actions** (không bấm "Configure" các mẫu Jekyll/Static).
Nếu tab Actions báo "No workflows found": GitHub chưa ghi nhận file workflow — cần một lần push vào nhánh mặc định
có file đó (vd sửa `on.push.branches`). Push kích hoạt deploy là hành động "ra ngoài" — cần người dùng đồng ý
(lần đầu); khi họ đã nói "sửa xong tự push và update" thì cứ push.

## Push an toàn

```bash
git pull --rebase origin <nhánh>     # bot hay vừa commit data/*.json
# xung đột chỉ ở data/catalog.json|search-index.json → giữ bản của mình: git checkout --theirs <file> (trong rebase), hoặc build lại
for i in 1 2 3 4; do timeout 90 git push origin <nhánh> && break; sleep $((2**i)); done
```
Đặt `timeout` cho push (từng bị treo). Sau push: xem run mới nhất (GitHub MCP `actions_list list_workflow_runs`)
tới khi `conclusion: success` rồi mới báo người dùng; nếu lỗi → đọc log job (`get_job_logs failed_only`) và sửa.
Sau đó `git pull` để nhận commit của bot.

## Commit message

Tiếng Việt, dòng đầu tóm tắt, phần thân gạch đầu dòng nêu thay đổi và lý do. Không ghi mật khẩu, không ghi tên
model AI.
