#!/usr/bin/env bash
# Build APK "Thư viện giải pháp Cyber Security" không cần Gradle: chỉ dùng Android SDK (build-tools + platform) và JDK.
#   ANDROID_HOME=/path/to/sdk bash android/build.sh
# Tuỳ chọn ký bằng khoá cố định (để cài đè bản cũ): ANDROID_KEYSTORE_B64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS.
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] || { echo "Chưa đặt ANDROID_HOME" >&2; exit 1; }
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
PLATFORM="$SDK/platforms/$(ls "$SDK/platforms" | grep -E '^android-[0-9]+$' | sort -V | tail -1)/android.jar"
HTML="../content/update-solution/thu-vien-giai-phap-cyber-security.html"
VERSION_CODE="${VERSION_CODE:-$(date -u +%y%m%d%H)}"
VERSION_NAME="${VERSION_NAME:-$(date -u +%Y.%m.%d)}"
OUT=out
APK=dist/ThuVienCyberSecurity.apk

rm -rf "$OUT" dist && mkdir -p "$OUT/classes" "$OUT/assets" "$OUT/dex" dist
cp "$HTML" "$OUT/assets/index.html"

"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLATFORM" --manifest AndroidManifest.xml -A "$OUT/assets" \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$OUT/res.zip"

javac -source 8 -target 8 -nowarn -cp "$PLATFORM" -d "$OUT/classes" $(find src -name '*.java')
"$BT/d8" --release --lib "$PLATFORM" --min-api 24 --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
(cd "$OUT/dex" && zip -q ../base.apk classes.dex)
"$BT/zipalign" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"

KS="$OUT/release.jks"
PASS="${ANDROID_KEYSTORE_PASSWORD:-cslib-temp}"
ALIAS="${ANDROID_KEY_ALIAS:-cslib}"
if [ -n "${ANDROID_KEYSTORE_B64:-}" ]; then
  echo "$ANDROID_KEYSTORE_B64" | base64 -d > "$KS"
else
  echo "! Không có ANDROID_KEYSTORE_B64: ký bằng khoá tạm (bản sau sẽ không cài đè được, phải gỡ app cũ trước)." >&2
  keytool -genkeypair -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=CS Library, O=NTS Ha Noi, C=VN" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$PASS" --ks-key-alias "$ALIAS" --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner" verify "$APK"
ls -la "$APK"
