package com.meme.random;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MemeFlow";
    private static final String MEME_DIR = "meme";
    private static final String DEFAULT_DIR = "default";
    private static final String SHARE_DIR = "share";
    private static final String ASSETS_PUBLIC = "public";
    private static final String PREFS_NAME = "MemeFlowPrefs";
    private static final String KEY_ASSETS_COPIED = "assets_copied";
    // v3: 1.5.2 里 index.json 被前端的 writeFile 写成了 0 字节，换 key 强制重写
    private static final String KEY_ASSETS_HASH = "assets_hash_v3";
    private static final String KEY_LITE_PROMPTED = "lite_prompted_code";

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

        // 每次启动都做一次清单同步（内部按 memes.json 指纹判断，没变就立刻返回）。
        // 老逻辑是「首次复制后永远跳过」，导致换新版后新图进不来。
        new Thread(new Runnable() {
            @Override
            public void run() {
                syncAssetsToData();
                installLiteApkIfNeeded();
            }
        }).start();

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
    /**
     * 把 APK 里的出厂图同步到 getFilesDir()/meme/默认/
     *
     * 老逻辑是「首次复制一次，之后永远跳过」，导致两个问题：
     *   1. 换新版后新图进不来 —— 用户必须先卸载重装，否则还是旧的一批
     *   2. 旧版残留的文件永远留在目录里，一旦重建索引就被扫进池子，同一张图占多份
     *
     * 现在改成按出厂清单 memes.json 的指纹做增量同步：
     *   - 指纹没变 → 立刻返回，零开销
     *   - 指纹变了 → 只补齐缺的文件，不删任何东西
     *     （用户自己 ZIP 导入的图在「导入YYYY-MM-DD-HH-mm」文件夹里，不碰）
     *   - index.json 合并写入，保留自建文件夹的条目（老代码会把它整个丢掉）
     */
    private void syncAssetsToData() {
        File memeDir = new File(getFilesDir(), MEME_DIR);
        File defaultDir = new File(memeDir, DEFAULT_DIR);
        File indexFile = new File(memeDir, "index.json");
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        // 先把旧版的中文目录名迁成英文，避免路径编码问题
        migrateFolderNames();

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

            // 去重后的出厂清单，保持原顺序
            ArrayList<String> wanted = new ArrayList<>();
            HashSet<String> seen = new HashSet<>();
            for (int i = 0; i < imageFiles.length; i++) {
                String f = imageFiles[i];
                if (f == null || f.trim().isEmpty()) continue;
                if (seen.add(f)) wanted.add(f);
            }

            // Lite 版 APK 里只有清单没有图片，别去做 1350 次注定失败的 open
            if (!wanted.isEmpty()) {
                try {
                    getAssets().open(ASSETS_PUBLIC + "/assets/" + wanted.get(0)).close();
                } catch (Exception e) {
                    Log.d(TAG, "assets 里没有图片 (Lite 版), 跳过同步");
                    return;
                }
            }

            String hash = md5Hex(memesJsonStr + "#" + wanted.size());
            String lastHash = prefs.getString(KEY_ASSETS_HASH, "");

            if (hash.equals(lastHash) && indexFile.exists()) {
                Log.d(TAG, "出厂清单未变, 跳过同步 (" + wanted.size() + " 张)");
                return;
            }

            if (!defaultDir.exists()) {
                defaultDir.mkdirs();
            }

            // 增量清理：只删「上一个版本的出厂清单里有、这一版没有」的文件。
            // 用户自己存进 default/ 的图不在任何 manifest 里，永远不会被误删。
            File manifestFile = new File(memeDir, ".manifest.json");
            HashSet<String> wantedSet = new HashSet<>(wanted);
            int removed = 0;
            if (manifestFile.exists()) {
                try {
                    JSONArray lastArr = new JSONArray(getFileText(manifestFile));
                    for (int i = 0; i < lastArr.length(); i++) {
                        String oldName = lastArr.getString(i);
                        if (wantedSet.contains(oldName)) continue;
                        File f = new File(defaultDir, oldName);
                        if (f.exists() && f.delete()) removed++;
                    }
                } catch (Exception e) {
                    Log.w(TAG, "旧清单解析失败, 本次不清理: " + e.getMessage());
                }
            }
            if (removed > 0) {
                Log.d(TAG, "清理旧出厂图: " + removed + " 张");
            }

            int copied = 0;
            int existed = 0;
            int failed = 0;
            ArrayList<String> okFiles = new ArrayList<>();

            for (int i = 0; i < wanted.size(); i++) {
                String fileName = wanted.get(i);
                File dest = new File(defaultDir, fileName);
                if (dest.exists()) {
                    existed++;
                    okFiles.add(fileName);
                    continue;
                }
                try {
                    InputStream is = getAssets().open(ASSETS_PUBLIC + "/assets/" + fileName);
                    OutputStream os = new FileOutputStream(dest);
                    byte[] buffer = new byte[16384];
                    int len;
                    while ((len = is.read(buffer)) > 0) {
                        os.write(buffer, 0, len);
                    }
                    os.close();
                    is.close();
                    copied++;
                    okFiles.add(fileName);
                } catch (Exception e) {
                    failed++;
                    Log.w(TAG, "跳过图片: " + fileName + " (" + e.getMessage() + ")");
                }
            }

            // 合并 index：默认文件夹按出厂清单重建，其他文件夹原样保留
            JSONObject root = new JSONObject();
            if (indexFile.exists()) {
                try {
                    JSONObject oldRoot = new JSONObject(getFileText(indexFile));
                    Iterator<String> keys = oldRoot.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        if (!DEFAULT_DIR.equals(k)) {
                            root.put(k, oldRoot.get(k));
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "旧 index.json 解析失败, 只写出厂部分");
                }
            }

            // index = 出厂清单里成功落地的 + default/ 下用户自己放进去的图
            ArrayList<String> indexFiles = new ArrayList<>(okFiles);
            File[] allFiles = defaultDir.listFiles();
            if (allFiles != null) {
                for (int i = 0; i < allFiles.length; i++) {
                    File f = allFiles[i];
                    if (!f.isFile()) continue;
                    String n = f.getName();
                    if (wantedSet.contains(n)) continue;
                    if (!isImageName(n)) continue;
                    indexFiles.add(n);
                }
            }
            Collections.sort(indexFiles);

            JSONArray defaultArr = new JSONArray();
            for (int i = 0; i < indexFiles.size(); i++) {
                defaultArr.put(indexFiles.get(i));
            }
            root.put(DEFAULT_DIR, defaultArr);

            FileOutputStream fos = new FileOutputStream(indexFile);
            fos.write(root.toString().getBytes("UTF-8"));
            fos.close();

            // 记下这一版的出厂清单，下次启动据此判断哪些是「旧出厂图」
            try {
                JSONArray manifestArr = new JSONArray();
                for (int i = 0; i < wanted.size(); i++) manifestArr.put(wanted.get(i));
                FileOutputStream mfos = new FileOutputStream(manifestFile);
                mfos.write(manifestArr.toString().getBytes("UTF-8"));
                mfos.close();
            } catch (Exception e) {
                Log.w(TAG, "写 manifest 失败: " + e.getMessage());
            }

            prefs.edit()
                    .putString(KEY_ASSETS_HASH, hash)
                    .putBoolean(KEY_ASSETS_COPIED, true)
                    .apply();

            Log.d(TAG, "同步完成: 新增 " + copied + ", 已存在 " + existed +
                    ", 失败 " + failed + ", 入库 " + okFiles.size());

            // 关键：前端可能在图还没复制完时就读了 index.json，读到空库。
            // 复制到新文件后主动刷一次页面，让它拿着完整的 index 重新渲染。
            if (copied > 0) {
                final int copiedFinal = copied;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            if (getBridge() != null && getBridge().getWebView() != null) {
                                Log.d(TAG, "新增 " + copiedFinal + " 张, 重新加载页面");
                                getBridge().getWebView().reload();
                            }
                        } catch (Exception e) {
                            Log.w(TAG, "reload 失败: " + e.getMessage());
                        }
                    }
                });
            }

        } catch (Exception e) {
            Log.e(TAG, "同步失败: " + e.getMessage());
        }
    }

    /**
     * 旧版目录名是中文（默认 / 分享 / 导入YYYY-MM-DD-HH-mm），路径编码上有隐患，
     * 统一迁成英文。只改名，不动文件内容。
     */
    private void migrateFolderNames() {
        File memeDir = new File(getFilesDir(), MEME_DIR);
        if (!memeDir.exists()) return;

        renameDir(new File(memeDir, "默认"), new File(memeDir, DEFAULT_DIR));
        renameDir(new File(memeDir, "分享"), new File(memeDir, SHARE_DIR));

        File[] children = memeDir.listFiles();
        if (children == null) return;
        for (int i = 0; i < children.length; i++) {
            File d = children[i];
            if (!d.isDirectory()) continue;
            String name = d.getName();
            if (!name.startsWith("导入")) continue;
            renameDir(d, new File(memeDir, "import-" + name.substring(2)));
        }
    }

    private void renameDir(File from, File to) {
        if (!from.exists() || from.equals(to) || to.exists()) return;
        if (from.renameTo(to)) {
            Log.d(TAG, "目录迁移: " + from.getName() + " -> " + to.getName());
        } else {
            Log.w(TAG, "目录迁移失败: " + from.getName());
        }
    }

    private boolean isImageName(String name) {
        String n = name.toLowerCase();
        return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png")
                || n.endsWith(".gif") || n.endsWith(".webp");
    }

    private String getFileText(File f) throws Exception {
        java.io.FileInputStream fis = new java.io.FileInputStream(f);
        byte[] buf = new byte[(int) f.length()];
        int off = 0;
        while (off < buf.length) {
            int n = fis.read(buf, off, buf.length - off);
            if (n <= 0) break;
            off += n;
        }
        fis.close();
        return new String(buf, 0, off, "UTF-8");
    }

    private String md5Hex(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < digest.length; i++) {
                sb.append(String.format("%02x", digest[i]));
            }
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(s.hashCode());
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

            // 校验版本：待装的 Lite 必须比当前已装的更高，否则弹出来也装不上
            // （系统会报「已安装更高版本」，用户只会困惑）
            SharedPreferences litePrefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            try {
                PackageInfo liteInfo = getPackageManager()
                        .getPackageArchiveInfo(liteApkFile.getAbsolutePath(), 0);
                PackageInfo selfInfo = getPackageManager()
                        .getPackageInfo(getPackageName(), 0);
                if (liteInfo != null && selfInfo != null) {
                    long liteCode = Build.VERSION.SDK_INT >= 28
                            ? liteInfo.getLongVersionCode() : liteInfo.versionCode;
                    long selfCode = Build.VERSION.SDK_INT >= 28
                            ? selfInfo.getLongVersionCode() : selfInfo.versionCode;
                    if (liteCode <= selfCode) {
                        Log.d(TAG, "跳过安装: 内嵌 Lite 版本 " + liteCode +
                                " 不高于当前 " + selfCode);
                        return;
                    }
                    Log.d(TAG, "版本校验通过: Lite " + liteCode + " > 当前 " + selfCode);
                }
            } catch (Exception e) {
                Log.w(TAG, "版本校验失败, 继续尝试安装: " + e.getMessage());
            }

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
            // 不能用 is.available() 分配缓冲区 —— 对 APK 里的压缩资源它不保证返回完整长度，
            // 之前 memes.json 涨到 28KB 后就只读到一部分，JSON 解析失败，
            // 结果一个图都不复制，App 里一张图都没有。
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            int len;
            while ((len = is.read(buffer)) > 0) {
                bos.write(buffer, 0, len);
            }
            is.close();
            return new String(bos.toByteArray(), "UTF-8");
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