# Bảo mật PM Hub (mức B đã được người dùng chọn)

## Ba mức đã tư vấn

| Mức | Cách làm | Hiệu quả |
|---|---|---|
| A | Hash mật khẩu, nhớ phiên | Chặn người dùng thông thường |
| **B (đang dùng)** | A + **mã hóa AES-256 các tool BOM** bằng khóa sinh từ mật khẩu | Không có mật khẩu thì không đọc được giá BOM dù xem mã nguồn |
| C | Repo private + Cloudflare Pages + Cloudflare Access | Chặn thật phía máy chủ |

Luôn nói rõ: repo và GitHub Pages là **public**; login Hub chỉ là lớp giao diện, các link tool gốc và sale guide
vẫn mở trực tiếp được. Chỉ BOM thực sự được bảo vệ. Muốn chặn hẳn → mức C.

## Cơ chế (`assets/js/crypto.js`, dùng chung trình duyệt + Node 22)

- Khóa = `PBKDF2-SHA256(username.trim().toLowerCase() + "\0" + password, salt, 250000 vòng)` → AES-256-GCM.
- `data/auth.json` = `{ v, kdf, iter, salt, check }`; `check` là AES-GCM của chuỗi `PM-HUB-OK`. Đăng nhập đúng
  khi giải mã được `check`. Không lưu mật khẩu ở đâu cả.
- File BOM `.bin` = `"PMH1" | iv(12) | AES-GCM(gzip(html))` — gzip giúp file nhỏ còn ~60%.
- **Lớp 1 (vào Hub)**: chỉ lưu cờ phiên `{user, salt, exp}` (localStorage 7 ngày nếu "Ghi nhớ", không thì
  sessionStorage 12 giờ). `salt` gắn với auth.json hiện tại → đổi mật khẩu là mọi phiên cũ mất hiệu lực.
- **Lớp 2 (BOM)**: phải nhập lại tài khoản; khóa AES xuất raw lưu ở sessionStorage (mất khi đóng tab), một lần
  dùng cho mọi BOM trong phiên. "Khóa lại" xóa khóa + đóng iframe BOM + bỏ chỉ mục BOM.
- Hai lớp dùng cùng tài khoản root của các file `build_secure.py` gốc (tài khoản Admin). Không ghi mật khẩu vào
  repo, commit, tài liệu hay skill; lấy từ người dùng khi cần và truyền qua biến môi trường
  `PM_HUB_USER` / `PM_HUB_PASSWORD`.

## Đổi mật khẩu

1. `PM_HUB_USER=… PM_HUB_PASSWORD='<mới>' node tools/encrypt-bom.mjs --init` (tạo salt + check mới).
2. Mã hóa lại **mọi** BOM từ file nguồn: `node tools/encrypt-bom.mjs <source.html> <tên>` (cần file nguồn —
   nếu không còn, phải giải mã bằng mật khẩu cũ trước khi `--init`).
3. Commit `data/auth.json` + `content/bom/`. Báo người dùng mọi người phải đăng nhập lại.

## Kiểm tra trước khi commit

```bash
grep -rn "<mật khẩu>" . --exclude-dir=.git   # phải không ra gì
git status --short | grep -Ei "source\.html|users\.csv"   # phải rỗng
```
