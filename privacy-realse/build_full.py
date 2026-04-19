#!/usr/bin/env python3
"""
MemeFlow Full Build Tool
Build EXE and APK with memes from -qq-vv-awa folder.
Output to privacy-realse folder.
"""

import os
import shutil
import subprocess
import sys
import json
import glob
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
ASSETS_DIR = PROJECT_ROOT / "assets"
ANDROID_DIR = PROJECT_ROOT / "android"
DIST_DIR = PROJECT_ROOT / "dist"
WEB_DIR = PROJECT_ROOT / "web"
RELEASE_DIR = PROJECT_ROOT / "privacy-realse"
SOURCE_DIR = PROJECT_ROOT / "-qq-vv-awa"

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}


def get_version():
    with open(PROJECT_ROOT / "package.json", "r", encoding="utf-8") as f:
        pkg = json.load(f)
    return pkg.get("version", "1.0.0")


def copy_memes_from_source():
    if not SOURCE_DIR.exists():
        print(f"[ERROR] Source directory not found: {SOURCE_DIR}")
        return 0
    
    if ASSETS_DIR.exists():
        shutil.rmtree(ASSETS_DIR)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    
    count = 0
    for file in SOURCE_DIR.iterdir():
        if file.suffix.lower() in IMAGE_EXTENSIONS:
            shutil.copy2(file, ASSETS_DIR / file.name)
            count += 1
    
    print(f"[OK] Copied {count} memes from source")
    return count


def prepare_web():
    web_assets = WEB_DIR / "assets"
    if web_assets.exists():
        shutil.rmtree(web_assets)
    web_assets.mkdir(parents=True, exist_ok=True)
    
    files = []
    if ASSETS_DIR.exists():
        for f in ASSETS_DIR.iterdir():
            if f.suffix.lower() in IMAGE_EXTENSIONS:
                shutil.copy2(f, web_assets / f.name)
                files.append(f.name)
    
    with open(web_assets / "memes.json", "w", encoding="utf-8") as f:
        json.dump(files, f, indent=2)
    
    print(f"[OK] Prepared web assets: {len(files)} memes")


def sync_android():
    prepare_web()
    result = subprocess.run(
        ["npx", "cap", "sync", "android"],
        cwd=PROJECT_ROOT,
        shell=True,
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"[ERROR] Android sync failed: {result.stderr}")
        return False
    print("[OK] Android sync completed")
    return True


def build_apk(version):
    env = os.environ.copy()
    env["JAVA_HOME"] = r"C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"
    
    gradlew = ANDROID_DIR / "gradlew.bat"
    
    # 生成签名密钥（如果不存在）
    key_file = ANDROID_DIR / "app" / "release-key.jks"
    if not key_file.exists():
        print("[INFO] Generating signing key...")
        keytool = Path(env["JAVA_HOME"]) / "bin" / "keytool.exe"
        result = subprocess.run(
            [
                str(keytool), "-genkey", "-v",
                "-keystore", str(key_file),
                "-alias", "memerandom",
                "-keyalg", "RSA",
                "-keysize", "2048",
                "-validity", "10000",
                "-storepass", "memerandom123",
                "-keypass", "memerandom123",
                "-dname", "CN=MemeRandom, OU=Meme, O=Random, L=Unknown, ST=Unknown, C=CN"
            ],
            cwd=ANDROID_DIR,
            env=env,
            shell=True,
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            print(f"[WARN] Key generation output: {result.stderr}")
    
    print("[INFO] Building APK...")
    result = subprocess.run(
        [str(gradlew), "clean", "assembleRelease"],
        cwd=ANDROID_DIR,
        env=env,
        shell=True,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"[ERROR] APK build failed: {result.stderr}")
        return False
    
    apk_path = ANDROID_DIR / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk"
    
    if apk_path.exists():
        dest = RELEASE_DIR / f"MemeFlow-{version}-Full.apk"
        shutil.copy2(apk_path, dest)
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"[OK] APK: {dest.name} ({size_mb:.2f} MB)")
        return True
    
    print("[ERROR] No APK found")
    return False


def build_exe(version):
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    
    print("[INFO] Building EXE...")
    result = subprocess.run(
        ["npm", "run", "build:win"],
        cwd=PROJECT_ROOT,
        shell=True,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"[ERROR] EXE build failed: {result.stderr}")
        return False
    
    if not DIST_DIR.exists():
        print("[ERROR] dist directory not created")
        return False
    
    built = False
    
    portable = DIST_DIR / f"MemeFlow {version}.exe"
    if portable.exists():
        dest = RELEASE_DIR / f"MemeFlow-{version}-Full-Portable.exe"
        shutil.copy2(portable, dest)
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"[OK] Portable: {dest.name} ({size_mb:.2f} MB)")
        built = True
    
    installer = DIST_DIR / f"MemeFlow Setup {version}.exe"
    if installer.exists():
        dest = RELEASE_DIR / f"MemeFlow-{version}-Full-Setup.exe"
        shutil.copy2(installer, dest)
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"[OK] Installer: {dest.name} ({size_mb:.2f} MB)")
        built = True
    
    if not built:
        print("[ERROR] No EXE files found in dist")
    
    return built


def main():
    print("=" * 50)
    print("  MemeFlow Full Build Tool")
    print("  (Includes memes from -qq-vv-awa folder)")
    print("=" * 50)
    
    version = get_version()
    print(f"[INFO] Version: {version}")
    
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    
    print("\n[STEP 1] Copying memes from source...")
    copy_memes_from_source()
    
    print("\n[STEP 2] Syncing Android...")
    if not sync_android():
        return
    
    print("\n[STEP 3] Building APK...")
    build_apk(version)
    
    print("\n[STEP 4] Building EXE...")
    build_exe(version)
    
    print("\n" + "=" * 50)
    print("  Done! Check the 'privacy-realse' folder.")
    print("=" * 50)


if __name__ == "__main__":
    main()
