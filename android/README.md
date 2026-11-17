# App Android "PM Hub"

App là một WebView mở **toàn bộ PM Hub** tại đúng địa chỉ `https://pm-ntshn.github.io/PM-Working/`: Tool chạy BOM,
Tổng hợp Dealreg / PO / CRM / KPI, Sale Guide các hãng, Mindmap, Update Solution (gồm Thư viện giải pháp Cyber Security),
Learning Center. Hỗ trợ Android 7.0 trở lên.

- **Có mạng**: tải bản mới nhất từ trang, nội dung giống hệt khi mở bằng trình duyệt (không cần cài lại app khi Hub cập nhật).
- **Mất mạng**: dùng bản Hub đóng gói sẵn trong app tại thời điểm build (Sale Guide, Thư viện, Mindmap, BOM đã mã hóa,
  tài liệu Update Solution / Learning nằm trong repo này). Các tool Tổng hợp và khóa học MMM nằm ở repo khác nên cần mạng.
- Tệp do trang tạo ra (Excel xuất từ tool, ảnh chụp) được lưu vào `Download/PMHub` hoặc `Pictures/PMHub` trên máy.

## Lấy file APK

Workflow **Build app Android** (`.github/workflows/android.yml`) tự build mỗi khi nội dung Hub hoặc thư mục `android/`
thay đổi trên nhánh triển khai (nhánh mặc định của repo) (hoặc bấm **Actions → Build app Android → Run workflow**). Kết quả:

- Bản phát hành **app-latest** trong mục *Releases* của repo: tải `PMHub.apk` thẳng về điện thoại.
- Artifact `PMHub-apk` trong lần chạy workflow.

Cài trên Samsung: mở file APK → cho phép "Cài đặt ứng dụng không xác định" cho trình duyệt / ứng dụng Tệp → Cài đặt.

## Ký bằng khoá cố định (nên làm)

Nếu không cấu hình gì, mỗi lần build dùng một khoá tạm → bản mới không cài đè lên bản cũ (phải gỡ app, mất tiến độ học).
Để cài đè được, tạo khoá một lần rồi lưu vào *Settings → Secrets and variables → Actions*:

```bash
keytool -genkeypair -keystore pmhub.jks -alias pmhub -keyalg RSA -keysize 2048 -validity 10000
```

```bash
base64 -w0 pmhub.jks
```

- `ANDROID_KEYSTORE_B64`: chuỗi base64 ở trên
- `ANDROID_KEYSTORE_PASSWORD`: mật khẩu keystore
- `ANDROID_KEY_ALIAS`: `pmhub`

Không commit file `.jks` vào repo.

## Build trên máy

Cần JDK 17+ và Android SDK (build-tools, một platform bất kỳ từ android-34):

```bash
ANDROID_HOME=/duong/dan/sdk bash android/build.sh
```
