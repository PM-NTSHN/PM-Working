# Style giao diện PM Hub

Mục tiêu người dùng đặt ra: "hiện đại giống các trang web hiện đại nhất", "màu sắc sắc nét, có chiều sâu",
"dễ phân biệt, dễ theo dõi". Tham chiếu tinh thần: Linear / Vercel / Raycast — sidebar tối, nội dung sáng,
thẻ bo góc, bóng nhẹ, màu nhấn có chủ đích.

## Màu nhận diện NTS Hà Nội (token ở `:root` trong hub.css)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--nts-blue` | `#0b5cad` | màu nhấn chính, nút, link, icon trang |
| `--nts-blue-2` | `#1673d1` | gradient |
| `--nts-navy` / `--nts-navy-2` | `#061f42` / `#0a2d5c` | nền sidebar, hero, login |
| `--nts-orange` / `--nts-orange-2` | `#f37021` / `#ff9a4d` | điểm nhấn: nút đăng nhập, gạch active trên sidebar, khóa BOM, mark |

Nền sáng `#f4f6fa`, bề mặt `#fff`, chữ `#0e1a2b`, phụ `#5a6a82`, viền `#e3e8f0`. Có bộ token tối
(`[data-theme=dark]` + `prefers-color-scheme`), nút đổi sáng/tối ở chân sidebar. Font: **Be Vietnam Pro**
(Google Fonts, hiển thị tiếng Việt đẹp). Mọi màu mới phải đi qua token, dùng `color-mix()` để tạo nền nhạt
từ màu nhấn (`color-mix(in srgb, var(--c) 13%, transparent)`).

Màu theo loại nội dung (thống nhất mọi nơi): Cẩm nang bán hàng `#16a34a` (book) · Nghiên cứu `#2563eb` (flask) ·
Bài kiểm tra `#d97706` (quiz) · Presales `#7c3aed` · Khóa học `#db2777` · Infographic `#0891b2`.
Màu theo section: BOM cam `#f37021`, Dealreg `#0ea5e9`, PO `#10b981`, CRM `#6366f1`, KPI `#e11d48`,
Sale guide `#0b5cad`, Update `#8b5cf6`, Learning `#d946ef`. Màu theo lĩnh vực sale guide lấy từ SOLUTION_CATS.

## Màn hình đăng nhập (yêu cầu cố định của người dùng)

- Nền toàn màn: nhiều lớp radial-gradient xanh NTS (góc trên trái) + cam (góc dưới phải) trên nền navy,
  lưới mờ 44px có mask, 3 quả cầu mờ (blur 60px) trôi chậm → "có chiều sâu".
- **Logo to ở giữa**: ô trắng 148px bo 34px, viền sáng + vòng cam mảnh, glow xanh.
- Dưới logo: tiêu đề **"PM Tool"** (chữ "Tool" gradient cam), dòng phụ **"Minh.nguyen@ntshanoi.com.vn"** —
  căn giữa, **phía trên** khung đăng nhập.
- Khung đăng nhập kính mờ (backdrop-filter blur 22px), ô nhập tối có icon, nút hiện mật khẩu, "Ghi nhớ 7 ngày",
  nút cam gradient có bóng; sai mật khẩu → thông báo + rung (`.shake`).

## Khung ứng dụng

- **Sidebar** 272px nền navy gradient, thu gọn được (72px), trên mobile thành ngăn kéo trượt + nền mờ.
  Thứ tự: Trang chủ → (Đã ghim) → nhóm "Công cụ" (BOM, có ổ khóa) → "Tổng hợp & Báo cáo" (4 tool) → "Kiến thức"
  (Sale Guide liệt kê hãng + số tài liệu, Update Solution, Learning Center). Mục active: nền sáng hơn + gạch cam
  bên trái. Mục "Sắp có" mờ + pill cam.
- **Topbar** 60px kính mờ: breadcrumb, các nút của mục đang mở (chip "Đã lưu N file", ghim ★, nội dung liên quan,
  tải lại, mở tab mới, toàn màn hình), ô tìm kiếm 360px gõ trực tiếp.
- **Trang chủ**: hero gradient navy→xanh có chấm lưới, lời chào theo giờ + ngày, ô tìm kiếm lớn + nút "Tìm nhanh";
  4 ô thống kê; lưới "Truy cập nhanh" (thẻ có icon màu section); "Tiếp tục làm việc" + "Đã ghim"; lưới lĩnh vực
  Sale guide.
- **Trang danh mục**: page-head (icon gradient + tiêu đề + mô tả), lưới thẻ `tile`. BOM có thanh trạng thái
  khóa/mở + nút "Khóa lại".
- **Sale guide**: ô lọc cục bộ, chuyển "Theo hãng / Tất cả tài liệu", chip lọc Lĩnh vực + Loại có số đếm.

## Trang hãng (phân biệt rõ dòng giải pháp và tài liệu)

Người dùng từng phàn nàn bản cũ (danh sách hàng) "khó phân biệt". Bản hiện tại:
1. Đầu trang: avatar chữ cái hãng, "N dòng giải pháp · M tài liệu", huy hiệu đếm theo loại; nút BOM liên quan.
2. **Thanh dòng giải pháp dính trên cùng** (`.sol-nav`): ô `01 Tên giải pháp / n tài liệu`, bấm để cuộn tới,
   tự đánh dấu mục đang xem (scroll-spy; cuộn tới cuối thì đánh dấu mục cuối).
3. Mỗi dòng giải pháp là **khối tiêu đề lớn** (`.sol-sec-head`): số thứ tự to `01`, icon lĩnh vực, nhãn
   "DÒNG GIẢI PHÁP · <lĩnh vực>", tên 20px, viền trái 6px + gradient màu lĩnh vực, huy hiệu loại tài liệu.
4. **Tài liệu là thẻ** (`.doc-card`) trong lưới, thụt vào và nối với tiêu đề bằng đường gạch đứt màu lĩnh vực;
   thẻ có viền trên 3px + nhãn IN HOA theo màu loại tài liệu.
Nguyên lý: cấp giải pháp và cấp tài liệu phải khác nhau về **kích thước, hình khối, vị trí thụt lề và màu nguồn**
(lĩnh vực vs loại tài liệu), không chỉ khác cỡ chữ.

## Thành phần dùng lại

`.card` `.tile` `.badge` (`--c`) `.tag` `.chip` (`.on`) `.btn` (`.accent`) `.seg` `.empty` `.row-link`
`.doc-row` `.doc-card` `.pill` `.saved-chip` `.lock-card` `.unlock-bar`. Ưu tiên dùng lại thay vì tạo class mới.

## Responsive & tiếp cận

Breakpoint 1100 / 860 (sidebar thành ngăn kéo, ô tìm kiếm thu thành icon, mở rộng khi focus) / 560.
Luôn chụp thử 1440×900 và 390×844. Giữ `:focus-visible`, `aria-label` cho nút icon, tương phản chữ trắng trên
nền màu (avatar hãng dùng `color-mix(... 80%, #061f42)` để đủ tương phản).
