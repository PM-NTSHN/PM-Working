package vn.ntshanoi.cslib;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;

/**
 * App "Thư viện giải pháp Cyber Security": một WebView mở file HTML đóng gói sẵn trong assets
 * (cùng nội dung với trang trên PM Hub), chạy hoàn toàn ngoại tuyến. Tiến độ học lưu trong localStorage.
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri)); // liên kết ngoài mở bằng trình duyệt
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
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

    /** Ghi ảnh PNG (base64) vào thư viện ảnh của máy, trả về Uri để chia sẻ. */
    private Uri writePng(String base64, String name) {
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "image/png");
            Uri collection;
            if (Build.VERSION.SDK_INT >= 29) {
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/CyberSecurityLibrary");
                collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            } else {
                collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            }
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
        } catch (Exception e) {
            return null;
        }
    }

    /** Cầu nối cho trang HTML: window.AndroidBridge.savePng / sharePng. */
    private class Bridge {
        @JavascriptInterface
        public void savePng(String base64, String name) {
            Uri uri = writePng(base64, name);
            toast(uri != null ? "Đã lưu ảnh vào Pictures/CyberSecurityLibrary" : "Không lưu được ảnh");
        }

        @JavascriptInterface
        public void sharePng(String base64, String name) {
            Uri uri = writePng(base64, name);
            if (uri == null) {
                toast("Không tạo được ảnh để chia sẻ");
                return;
            }
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, "Chia sẻ ảnh"));
        }
    }
}
