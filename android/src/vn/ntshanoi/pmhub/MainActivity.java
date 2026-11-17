package vn.ntshanoi.pmhub;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;

/**
 * App "PM Hub": WebView mở toàn bộ PM Hub (BOM, Tổng hợp báo cáo, Sale Guide, Mindmap, Update Solution gồm
 * Thư viện giải pháp Cyber Security, Learning Center) tại đúng địa chỉ https://pm-ntshn.github.io/PM-Working/.
 *
 * - Có mạng: tải bản mới nhất từ trang, nội dung giống hệt khi mở bằng trình duyệt.
 * - Mất mạng: các file của Hub được trả từ bản đóng gói sẵn trong assets/site (cùng địa chỉ, cùng origin nên
 *   đăng nhập, mở khóa BOM, tiến độ học đã lưu vẫn dùng được). Các tool Tổng hợp nằm ở repo khác nên cần mạng.
 */
public class MainActivity extends Activity {
    private static final String HOST = "pm-ntshn.github.io";
    private static final String BASE = "/PM-Working/";
    private static final String START = "https://" + HOST + BASE;
    private static final int PICK_FILE = 7;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType("*/*");
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(Intent.createChooser(pick, "Chọn tệp"), PICK_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!request.isForMainFrame()) return false;
                String scheme = uri.getScheme();
                if (("https".equals(scheme) || "http".equals(scheme)) && HOST.equals(uri.getHost())) return false;
                if ("blob".equals(scheme) || "data".equals(scheme) || "about".equals(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri)); // liên kết ngoài mở bằng trình duyệt
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (!"GET".equals(request.getMethod()) || !HOST.equals(uri.getHost()) || path == null || !path.startsWith(BASE)) return null;
                if (isOnline()) return null; // có mạng: lấy bản mới nhất trên trang
                String rel = path.substring(BASE.length());
                if (rel.isEmpty() || rel.endsWith("/")) rel += "index.html";
                try {
                    InputStream in = getAssets().open("site/" + rel);
                    String mime = mimeOf(rel);
                    return new WebResourceResponse(mime, isText(mime) ? "utf-8" : null, in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                            new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
                }
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(START);
    }

    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            Network net = cm.getActiveNetwork();
            if (net == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(net);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return true;
        }
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("xml");
    }

    private static String mimeOf(String name) {
        int dot = name.lastIndexOf('.');
        String ext = dot < 0 ? "" : name.substring(dot + 1).toLowerCase();
        switch (ext) {
            case "html": case "htm": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "svg": return "image/svg+xml";
            case "ico": return "image/x-icon";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "pdf": return "application/pdf";
            case "txt": return "text/plain";
            default: return "application/octet-stream";
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILE || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                result = new Uri[clip.getItemCount()];
                for (int i = 0; i < result.length; i++) result[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /** Ghi dữ liệu (base64) vào bộ nhớ dùng chung của máy: ảnh vào Pictures/PMHub, tệp khác vào Download/PMHub. */
    private Uri write(String base64, String name, String mime, boolean image) {
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/PMHub");
                Uri collection = image
                        ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                        : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                Uri uri = getContentResolver().insert(collection, v);
                if (uri == null) return null;
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os == null) return null;
                try {
                    os.write(data);
                } finally {
                    os.close();
                }
                return uri;
            }
            // Android 9 trở xuống: lưu vào thư mục riêng của app (không cần xin quyền).
            File dir = getExternalFilesDir(image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) return null;
            File f = new File(dir, name);
            FileOutputStream os = new FileOutputStream(f);
            try {
                os.write(data);
            } finally {
                os.close();
            }
            return Uri.fromFile(f);
        } catch (Exception e) {
            return null;
        }
    }

    /** Cầu nối cho trang HTML: window.AndroidBridge.savePng / sharePng / saveFile. */
    private class Bridge {
        @JavascriptInterface
        public void savePng(String base64, String name) {
            Uri uri = write(base64, name, "image/png", true);
            toast(uri != null ? "Đã lưu ảnh vào Pictures/PMHub" : "Không lưu được ảnh");
        }

        @JavascriptInterface
        public void sharePng(String base64, String name) {
            Uri uri = write(base64, name, "image/png", true);
            if (uri == null || !"content".equals(uri.getScheme())) {
                toast(uri == null ? "Không tạo được ảnh để chia sẻ" : "Đã lưu ảnh vào bộ nhớ của app");
                return;
            }
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, "Chia sẻ ảnh"));
        }

        /** Tệp do trang tạo ra để tải về (Excel báo cáo, ảnh, .bin mã hóa BOM…). */
        @JavascriptInterface
        public void saveFile(String base64, String name, String mime) {
            boolean image = mime != null && mime.startsWith("image/");
            Uri uri = write(base64, name == null || name.isEmpty() ? "tai-ve" : name,
                    mime == null || mime.isEmpty() ? "application/octet-stream" : mime, image);
            toast(uri != null ? "Đã lưu " + name + " vào " + (image ? "Pictures" : "Download") + "/PMHub" : "Không lưu được tệp");
        }
    }
}
