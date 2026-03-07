import os
import shutil
import subprocess
import sys
import json

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(PROJECT_DIR, "assets")
SOURCE_DIR = os.path.join(PROJECT_DIR, "-qq-vv-awa")
ANDROID_DIR = os.path.join(PROJECT_DIR, "android")
DIST_DIR = os.path.join(PROJECT_DIR, "dist")
WEB_DIR = os.path.join(PROJECT_DIR, "web")

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}

def copy_images_from_source():
    if not os.path.exists(SOURCE_DIR):
        print(f"错误: 源目录不存在: {SOURCE_DIR}")
        return 0
    
    if os.path.exists(ASSETS_DIR):
        shutil.rmtree(ASSETS_DIR)
    os.makedirs(ASSETS_DIR)
    
    count = 0
    for file in os.listdir(SOURCE_DIR):
        ext = os.path.splitext(file)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            shutil.copy2(os.path.join(SOURCE_DIR, file), os.path.join(ASSETS_DIR, file))
            count += 1
    
    print(f"已复制 {count} 张图片到 assets")
    return count

def clear_assets():
    if os.path.exists(ASSETS_DIR):
        shutil.rmtree(ASSETS_DIR)
    os.makedirs(ASSETS_DIR)
    print("已清空 assets")

def prepare_web():
    web_assets = os.path.join(WEB_DIR, "assets")
    if os.path.exists(web_assets):
        shutil.rmtree(web_assets)
    os.makedirs(web_assets)
    
    files = []
    if os.path.exists(ASSETS_DIR):
        for f in os.listdir(ASSETS_DIR):
            if os.path.splitext(f)[1].lower() in IMAGE_EXTENSIONS:
                shutil.copy2(os.path.join(ASSETS_DIR, f), os.path.join(web_assets, f))
                files.append(f)
    
    with open(os.path.join(web_assets, "memes.json"), "w", encoding="utf-8") as f:
        json.dump(files, f, indent=2)
    
    print(f"prepare-web: {len(files)} 张表情包")

def sync_android():
    prepare_web()
    subprocess.run(["npx", "cap", "sync", "android"], cwd=PROJECT_DIR, shell=True)
    print("Android sync 完成")

def build_apk():
    env = os.environ.copy()
    env["JAVA_HOME"] = r"C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"
    
    gradlew = os.path.join(ANDROID_DIR, "gradlew.bat")
    subprocess.run([gradlew, "clean", "assembleDebug"], cwd=ANDROID_DIR, env=env, shell=True)
    
    apk_path = os.path.join(ANDROID_DIR, "app", "build", "outputs", "apk", "debug", "app-debug.apk")
    if os.path.exists(apk_path):
        print(f"APK: {os.path.getsize(apk_path) / (1024*1024):.2f} MB -> {apk_path}")

def build_exe():
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    
    subprocess.run(["npm", "run", "build:win"], cwd=PROJECT_DIR, shell=True)
    
    if os.path.exists(DIST_DIR):
        for f in os.listdir(DIST_DIR):
            if f.endswith(".exe"):
                path = os.path.join(DIST_DIR, f)
                print(f"EXE: {os.path.getsize(path) / (1024*1024):.2f} MB -> {path}")

def main():
    if len(sys.argv) < 2:
        print("用法:")
        print("  python build_all.py full    # 完整版 (从 -qq-vv-awa 复制表情包)")
        print("  python build_all.py lite    # Lite版 (不含表情包)")
        print("  python build_all.py apk     # 只构建完整版 APK")
        print("  python build_all.py exe     # 只构建完整版 EXE")
        return
    
    cmd = sys.argv[1]
    
    if cmd == "full":
        print("构建完整版...")
        copy_images_from_source()
        sync_android()
        build_apk()
        build_exe()
    elif cmd == "lite":
        print("构建 Lite 版...")
        clear_assets()
        sync_android()
        build_apk()
        build_exe()
    elif cmd == "apk":
        copy_images_from_source()
        sync_android()
        build_apk()
    elif cmd == "exe":
        copy_images_from_source()
        build_exe()

if __name__ == "__main__":
    main()
