import os
import shutil
import subprocess
import sys
import json
import re

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(PROJECT_DIR, "assets")
SOURCE_DIR = os.path.join(PROJECT_DIR, "-qq-vv-awa")
ANDROID_DIR = os.path.join(PROJECT_DIR, "android")
DIST_DIR = os.path.join(PROJECT_DIR, "dist")
WEB_DIR = os.path.join(PROJECT_DIR, "web")
RELEASE_DIR = os.path.join(PROJECT_DIR, "release")

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}

def get_version():
    package_json_path = os.path.join(PROJECT_DIR, "package.json")
    with open(package_json_path, "r", encoding="utf-8") as f:
        package = json.load(f)
    return package.get("version", "1.3.8")

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

def run_cmd(cmd, cwd=None, env=None, shell=True):
    """统一执行命令，实时输出到终端，并检查返回值"""
    result = subprocess.run(cmd, cwd=cwd, env=env, shell=shell)
    if result.returncode != 0:
        print(f"错误: 命令执行失败 (返回码 {result.returncode})")
        sys.exit(1)
    return result


def prepare_web():
    run_cmd(["npm", "run", "prepare:web"], cwd=PROJECT_DIR)
    print("prepare:web 完成")


def sync_android(pause_enabled=False):
    prepare_web()
    if pause_enabled:
        pause()
    run_cmd(["npx", "cap", "sync", "android"], cwd=PROJECT_DIR)
    print("Android sync 完成")


def build_lite_apk():
    """构建 Lite APK 并嵌入到 Full APK 的 assets/lite/ 目录"""
    print("构建 Lite APK (无内置图片)...")
    run_cmd(["node", "build-lite.js"], cwd=PROJECT_DIR)
    print("Lite APK 已就绪，已嵌入到 Full APK 的 assets/lite/")


def build_apk(version_name="full", is_lite=False, pause_enabled=False):
    if pause_enabled:
        pause()
    env = os.environ.copy()
    env["JAVA_HOME"] = r"C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"
    android_sdk_root = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk")
    if os.path.exists(android_sdk_root):
        env["ANDROID_SDK_ROOT"] = android_sdk_root
    gradlew = os.path.join(ANDROID_DIR, "gradlew.bat")
    # 构建时不 clean，避免再次编译
    run_cmd([gradlew, "assembleDebug"], cwd=ANDROID_DIR, env=env)
    apk_path = os.path.join(ANDROID_DIR, "app", "build", "outputs", "apk", "debug", "app-debug.apk")
    if os.path.exists(apk_path):
        size_mb = os.path.getsize(apk_path) / (1024*1024)
        print(f"APK: {size_mb:.2f} MB -> {apk_path}")
        os.makedirs(RELEASE_DIR, exist_ok=True)
        apk_version = get_version()
        if is_lite:
            release_apk = os.path.join(RELEASE_DIR, f"meme-random-lite-v{apk_version}.apk")
        else:
            release_apk = os.path.join(RELEASE_DIR, f"meme-random-v{apk_version}.apk")
        shutil.copy(apk_path, release_apk)
        print(f"已复制到: {release_apk}")
    else:
        print(f"错误: APK 文件不存在: {apk_path}")
        sys.exit(1)


def build_exe(version_name="full", pause_enabled=False):
    if pause_enabled:
        pause()
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    run_cmd(["npm", "run", "build:win"], cwd=PROJECT_DIR)
    if os.path.exists(DIST_DIR):
        os.makedirs(RELEASE_DIR, exist_ok=True)
        for f in os.listdir(DIST_DIR):
            if f.endswith(".exe"):
                src = os.path.join(DIST_DIR, f)
                size_mb = os.path.getsize(src) / (1024*1024)
                print(f"EXE: {size_mb:.2f} MB -> {src}")
                name = os.path.splitext(f)[0]
                ext = os.path.splitext(f)[1]
                dst = os.path.join(RELEASE_DIR, f"{name}-{version_name}{ext}")
                shutil.copy(src, dst)
                print(f"已复制到: {dst}")
    else:
        print(f"错误: DIST 目录不存在: {DIST_DIR}")
        sys.exit(1)


def pause():
    """暂停，等待用户按 Enter 继续"""
    input("--- 按 Enter 继续下一阶段 ---")

def main():
    if len(sys.argv) < 2:
        print("用法:")
        print("  python build_all.py full    # 完整版: 构建 Lite APK + 嵌入 + 构建 Full APK")
        print("  python build_all.py lite    # 仅构建 Lite APK (无内置表情包)")
        print("  python build_all.py apk     # 快速构建完整版 (不清除，不重新构建 Lite)")
        print("  python build_all.py exe     # 只构建完整版 EXE")
        return
    cmd = sys.argv[1]
    version = get_version()
    print(f"当前版本: v{version}")
    if cmd == "full":
        print("构建包含 Lite 升级机制的完整版...")
        copy_images_from_source()
        sync_android(pause_enabled=True)
        build_lite_apk()
        build_apk("full", is_lite=False, pause_enabled=True)
        build_exe("full", pause_enabled=True)
    elif cmd == "lite":
        print("构建 Lite 版 (无内置表情包)...")
        clear_assets()
        sync_android(pause_enabled=True)
        build_apk("lite", is_lite=True, pause_enabled=True)
    elif cmd == "apk":
        copy_images_from_source()
        sync_android()
        build_lite_apk()
        build_apk("full")
    elif cmd == "exe":
        copy_images_from_source()
        build_exe("full")

if __name__ == "__main__":
    main()
