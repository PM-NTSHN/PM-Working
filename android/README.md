# App Android "CS Library" (Thư viện giải pháp Cyber Security)

App là một WebView mở file `content/update-solution/thu-vien-giai-phap-cyber-security.html` được đóng gói sẵn bên trong
(nội dung giống hệt trang trên PM Hub), chạy ngoại tuyến, không xin quyền Internet. Hỗ trợ Android 7.0 trở lên.

## Lấy file APK

Workflow **Build app Android** (`.github/workflows/android.yml`) tự build mỗi khi file thư viện hoặc thư mục `android/`
thay đổi trên nhánh triển khai (nhánh mặc định của repo) (hoặc bấm **Actions → Build app Android → Run workflow**). Kết quả:

- Bản phát hành **app-latest** trong mục *Releases* của repo: tải `ThuVienCyberSecurity.apk` thẳng về điện thoại.
- Artifact `ThuVienCyberSecurity-apk` trong lần chạy workflow.

Cài trên Samsung: mở file APK → cho phép "Cài đặt ứng dụng không xác định" cho trình duyệt / ứng dụng Tệp → Cài đặt.

## Ký bằng khoá cố định (nên làm)

Nếu không cấu hình gì, mỗi lần build dùng một khoá tạm → bản mới không cài đè lên bản cũ (phải gỡ app, mất tiến độ học).
Để cài đè được, tạo khoá một lần rồi lưu vào *Settings → Secrets and variables → Actions*:

```bash
keytool -genkeypair -keystore cslib.jks -alias cslib -keyalg RSA -keysize 2048 -validity 10000
```

```bash
base64 -w0 cslib.jks
```

- `ANDROID_KEYSTORE_B64`: chuỗi base64 ở trên
- `ANDROID_KEYSTORE_PASSWORD`: mật khẩu keystore
- `ANDROID_KEY_ALIAS`: `cslib`

Không commit file `.jks` vào repo.

## Build trên máy

Cần JDK 17+ và Android SDK (build-tools, một platform bất kỳ từ android-34):

```bash
ANDROID_HOME=/duong/dan/sdk bash android/build.sh
```
