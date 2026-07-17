package com.meme.random;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.ConsoleMessage;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.core.graphics.drawable.IconCompat;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MemeFlow";
    private static final String MEME_DIR = "meme";
    private static final String DEFAULT_DIR = "默认";
    private static final String SHARE_DIR = "分享";
    private static final String ASSETS_PUBLIC = "public";
    private static final String PREFS_NAME = "MemeFlowPrefs";
    private static final String KEY_ASSETS_COPIED = "assets_copied";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView.setWebContentsDebuggingEnabled(true);

        getBridge().getWebView().setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d("WebView", consoleMessage.message() + " -- From line " + consoleMessage.lineNumber() + " of " + consoleMessage.sourceId());
                return true;
            }
        });

        createShareShortcut();

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        boolean assetsCopied = prefs.getBoolean(KEY_ASSETS_COPIED, false);
        File memeDir = new File(getFilesDir(), MEME_DIR);
        File indexFile = new File(memeDir, "index.json");

        if (!assetsCopied || !indexFile.exists()) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    copyAssetsToData();
                    installLiteApkIfNeeded();
                }
            }).start();
        } else {
            Log.d(TAG, "已初始化, 跳过 assets 复制");
            installLiteApkIfNeeded();
        }

        handleShareIntent(getIntent());
    }

    /**
     * 首次启动时，将 APK assets/public/assets/ 下的图片复制到 getFilesDir()/meme/默认/
     * 并生成 index.json
     */
    private void createShareShortcut() {
        try {
            ShortcutInfoCompat shortcutInfo = new ShortcutInfoCompat.Builder(this, "meme_share_shortcut")
                    .setShortLabel("添加到Meme")
                    .setLongLabel("添加图片到Meme库")
                    .setIcon(IconCompat.createWithResource(this, android.R.drawable.ic_menu_add))
                    .setCategories(Collections.singleton("com.meme.random.category.SHARE_TARGET"))
                    .build();

            ArrayList<ShortcutInfoCompat> shortcuts = new ArrayList<>();
            shortcuts.add(shortcutInfo);
            ShortcutManagerCompat.setDynamicShortcuts(this, shortcuts);

            Log.d(TAG, "已创建分享快捷方式");
        } catch (Exception e) {
            Log.e(TAG, "创建分享快捷方式失败: " + e.getMessage());
        }
    }
    private void copyAssetsToData() {
        File memeDir = new File(getFilesDir(), MEME_DIR);
        File indexFile = new File(memeDir, "index.json");

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_ASSETS_COPIED, false) && indexFile.exists()) {
            Log.d(TAG, "已初始化, 跳过 assets 复制");
            return;
        }

        Log.d(TAG, "首次启动: 开始从 APK assets 复制图片...");

        try {
            String memesJsonStr = readAssetFile(ASSETS_PUBLIC + "/assets/memes.json");
            if (memesJsonStr == null) {
                Log.e(TAG, "无法读取 assets/public/assets/memes.json");
                return;
            }

            String[] imageFiles = parseJsonStringArray(memesJsonStr);
            if (imageFiles == null || imageFiles.length == 0) {
                Log.e(TAG, "memes.json 中没有图片文件");
                return;
            }

            File defaultDir = new File(memeDir, DEFAULT_DIR);
            if (!defaultDir.exists()) {
                defaultDir.mkdirs();
            }

            int count = 0;
            StringBuilder indexJson = new StringBuilder();
            indexJson.append("{\"").append(DEFAULT_DIR).append("\":[");

            for (int i = 0; i < imageFiles.length; i++) {
                String fileName = imageFiles[i];
                if (fileName == null || fileName.trim().isEmpty()) continue;

                String assetPath = ASSETS_PUBLIC + "/assets/" + fileName;
                try {
                    InputStream is = getAssets().open(assetPath);
                    File destFile = new File(defaultDir, fileName);

                    if (destFile.exists()) {
                        if (count > 0) indexJson.append(",");
                        indexJson.append("\"").append(fileName).append("\"");
                        count++;
                        is.close();
                        continue;
                    }

                    OutputStream os = new FileOutputStream(destFile);
                    byte[] buffer = new byte[8192];
                    int len;
                    while ((len = is.read(buffer)) > 0) {
                        os.write(buffer, 0, len);
                    }
                    os.close();
                    is.close();

                    if (count > 0) indexJson.append(",");
                    indexJson.append("\"").append(fileName).append("\"");
                    count++;
                } catch (Exception e) {
                    Log.w(TAG, "跳过图片: " + fileName + " (" + e.getMessage() + ")");
                }
            }

            indexJson.append("]}");

            FileOutputStream fos = new FileOutputStream(indexFile);
            fos.write(indexJson.toString().getBytes("UTF-8"));
            fos.close();

            prefs.edit().putBoolean(KEY_ASSETS_COPIED, true).apply();

            Log.d(TAG, "初始化完成: 已复制 " + count + "/" + imageFiles.length + " 张表情包");

        } catch (Exception e) {
            Log.e(TAG, "初始化失败: " + e.getMessage());
        }
    }

    /**
     * 如果当前 APK 中内嵌了 Lite APK, 则提取并安装（覆盖升级）
     * 每次进入都会触发安装提示, 直到用户完成安装（Lite 版本覆盖 Full 版本）
     */
    private void installLiteApkIfNeeded() {
        // 检查 assets/lite/app-lite.apk 是否存在
        // Full 版本有内嵌, Lite 版本没有
        try {
            getAssets().open("lite/app-lite.apk").close();
        } catch (IOException e) {
            Log.d(TAG, "未检测到 Lite APK (当前已是 Lite 版本或无内嵌), 跳过");
            return;
        }

        Log.d(TAG, "检测到 Lite APK, 准备安装升级版本...");

        try {
            // 提取 Lite APK 到缓存目录
            File liteDir = new File(getCacheDir(), "lite");
            liteDir.mkdirs();
            File liteApkFile = new File(liteDir, "app-lite.apk");

            InputStream is = getAssets().open("lite/app-lite.apk");
            OutputStream os = new FileOutputStream(liteApkFile);
            byte[] buffer = new byte[8192];
            int len;
            while ((len = is.read(buffer)) > 0) {
                os.write(buffer, 0, len);
            }
            os.close();
            is.close();

            Log.d(TAG, "Lite APK 已提取到: " + liteApkFile.getAbsolutePath());

            // 在主线程弹出安装界面
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Uri apkUri = FileProvider.getUriForFile(
                            MainActivity.this,
                            getPackageName() + ".fileprovider",
                            liteApkFile
                        );

                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);

                        Log.d(TAG, "已启动 Lite APK 安装界面");
                    } catch (Exception e) {
                        Log.e(TAG, "启动安装界面失败: " + e.getMessage());
                    }
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "提取 Lite APK 失败: " + e.getMessage());
        }
    }

    /**
     * 从 APK assets 读取文本文件
     */
    private String readAssetFile(String path) {
        try {
            InputStream is = getAssets().open(path);
            byte[] buffer = new byte[is.available()];
            is.read(buffer);
            is.close();
            return new String(buffer, "UTF-8");
        } catch (Exception e) {
            Log.e(TAG, "读取 assets 文件失败: " + path + " (" + e.getMessage() + ")");
            return null;
        }
    }

    /**
     * 解析 JSON 字符串数组: ["a.jpg","b.png"]
     */
    private String[] parseJsonStringArray(String json) {
        try {
            // 去除首尾的 [] 和空白
            json = json.trim();
            if (!json.startsWith("[") || !json.endsWith("]")) return null;
            String inner = json.substring(1, json.length() - 1).trim();
            if (inner.isEmpty()) return new String[0];

            // 按 "," 分割, 去掉引号
            String[] parts = inner.split(",");
            String[] result = new String[parts.length];
            for (int i = 0; i < parts.length; i++) {
                result[i] = parts[i].trim().replaceAll("^\"|\"$", "");
            }
            return result;
        } catch (Exception e) {
            Log.e(TAG, "解析 JSON 数组失败: " + e.getMessage());
            return null;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShareIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        String type = intent.getType();

        if (type == null || !type.startsWith("image/")) {
            return;
        }

        // 保存图片到 Data/meme/分享/ 目录
        File shareDir = new File(getFilesDir(), MEME_DIR + File.separator + SHARE_DIR);
        if (!shareDir.exists()) {
            shareDir.mkdirs();
        }

        int count = 0;

        try {
            if (Intent.ACTION_SEND.equals(action)) {
                Uri imageUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (imageUri != null) {
                    if (saveImageFromUri(imageUri, shareDir)) count++;
                }
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> imageUris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (imageUris != null) {
                    for (Uri uri : imageUris) {
                        if (saveImageFromUri(uri, shareDir)) count++;
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "保存分享图片失败: " + e.getMessage());
        }

        if (count > 0) {
            Log.d(TAG, "成功保存 " + count + " 张分享图片");

            // 通知前端刷新
            final String js = "if(typeof onShareReceived === 'function') { onShareReceived('" + SHARE_DIR + "'); }";
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                }
            });
        }
    }

    private boolean saveImageFromUri(Uri imageUri, File destDir) {
        try {
            if (imageUri == null) return false;

            String fileName = "share_" + System.currentTimeMillis() + "_" + getFileNameFromUri(imageUri);
            File destFile = new File(destDir, fileName);

            // 避免重名
            int dup = 1;
            while (destFile.exists()) {
                String base = fileName.substring(0, fileName.lastIndexOf('.'));
                String ext = fileName.substring(fileName.lastIndexOf('.'));
                destFile = new File(destDir, base + "_" + (dup++) + ext);
            }

            InputStream is = getContentResolver().openInputStream(imageUri);
            if (is == null) return false;

            OutputStream os = new FileOutputStream(destFile);
            byte[] buffer = new byte[8192];
            int len;
            while ((len = is.read(buffer)) > 0) {
                os.write(buffer, 0, len);
            }
            os.close();
            is.close();

            return true;
        } catch (Exception e) {
            Log.e(TAG, "保存单张图片失败: " + e.getMessage());
            return false;
        }
    }

    private String getFileNameFromUri(Uri uri) {
        String fileName = "image.jpg";
        try {
            String[] proj = { android.provider.MediaStore.Images.Media.DISPLAY_NAME };
            android.database.Cursor cursor = getContentResolver().query(uri, proj, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                fileName = cursor.getString(0);
                cursor.close();
            }
        } catch (Exception e) {
            // 从URI路径提取扩展名
            String path = uri.getPath();
            if (path != null) {
                int dot = path.lastIndexOf('.');
                if (dot > 0) {
                    String ext = path.substring(dot);
                    fileName = "image" + ext;
                }
            }
        }
        return fileName;
    }
}