#!/usr/bin/env python3
"""
MemeFlow Lite Build Tool
Build EXE and APK without memes (user imports their own).
Output to release folder.
"""

import os
import shutil
import subprocess
import sys
import json
import glob
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
ASSETS_DIR = PROJECT_ROOT / "assets"
ANDROID_DIR = PROJECT_ROOT / "android"
DIST_DIR = PROJECT_ROOT / "dist"
WEB_DIR = PROJECT_ROOT / "web"
RELEASE_DIR = PROJECT_ROOT / "release"

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}


def get_version():
    with open(PROJECT_ROOT / "package.json", "r", encoding="utf-8") as f:
        pkg = json.load(f)
    return pkg.get("version", "1.0.0")


def clear_assets():
    if ASSETS_DIR.exists():
        shutil.rmtree(ASSETS_DIR)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[OK] Cleared assets directory")


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
    
    print("[INFO] Building APK...")
    result = subprocess.run(
        [str(gradlew), "clean", "assembleDebug"],
        cwd=ANDROID_DIR,
        env=env,
        shell=True,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"[ERROR] APK build failed: {result.stderr}")
        return False
    
    apk_pattern = str(ANDROID_DIR / "app" / "build" / "outputs" / "apk" / "**" / "*.apk")
    apks = glob.glob(apk_pattern, recursive=True)
    
    for apk in apks:
        if "debug" in apk.lower() or "release" in apk.lower():
            apk_path = Path(apk)
            dest = RELEASE_DIR / f"MemeFlow-{version}-Lite.apk"
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
        dest = RELEASE_DIR / f"MemeFlow-{version}-Lite-Portable.exe"
        shutil.copy2(portable, dest)
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"[OK] Portable: {dest.name} ({size_mb:.2f} MB)")
        built = True
    
    installer = DIST_DIR / f"MemeFlow Setup {version}.exe"
    if installer.exists():
        dest = RELEASE_DIR / f"MemeFlow-{version}-Lite-Setup.exe"
        shutil.copy2(installer, dest)
        size_mb = dest.stat().st_size / (1024 * 1024)
        print(f"[OK] Installer: {dest.name} ({size_mb:.2f} MB)")
        built = True
    
    if not built:
        print("[ERROR] No EXE files found in dist")
    
    return built


def main():
    print("=" * 50)
    print("  MemeFlow Lite Build Tool")
    print("  (No memes included - user imports their own)")
    print("=" * 50)
    
    version = get_version()
    print(f"[INFO] Version: {version}")
    
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    
    print("\n[STEP 1] Clearing assets...")
    clear_assets()
    
    print("\n[STEP 2] Syncing Android...")
    if not sync_android():
        return
    
    print("\n[STEP 3] Building APK...")
    build_apk(version)
    
    print("\n[STEP 4] Building EXE...")
    build_exe(version)
    
    print("\n" + "=" * 50)
    print("  Done! Check the 'release' folder.")
    print("=" * 50)


if __name__ == "__main__":
    main()
