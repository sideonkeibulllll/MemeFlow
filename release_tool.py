#!/usr/bin/env python3
"""
MemeFlow Release Tool
Move built artifacts to release folder for distribution.
"""

import os
import shutil
import glob
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
DIST_DIR = PROJECT_ROOT / "dist"
RELEASE_DIR = PROJECT_ROOT / "release"


def get_version():
    import json
    with open(PROJECT_ROOT / "package.json", "r", encoding="utf-8") as f:
        pkg = json.load(f)
    return pkg.get("version", "1.0.0")


def clean_release():
    if RELEASE_DIR.exists():
        for f in RELEASE_DIR.iterdir():
            if f.is_file():
                f.unlink()
    else:
        RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[INFO] Cleaned release directory: {RELEASE_DIR}")


def move_portable_exe(version):
    portable = DIST_DIR / f"MemeFlow {version}.exe"
    if portable.exists():
        dest = RELEASE_DIR / f"MemeFlow-{version}-Portable.exe"
        shutil.copy2(portable, dest)
        print(f"[OK] Portable: {dest.name}")
        return True
    print("[WARN] Portable exe not found")
    return False


def move_installer(version):
    installer = DIST_DIR / f"MemeFlow Setup {version}.exe"
    if installer.exists():
        dest = RELEASE_DIR / f"MemeFlow-{version}-Setup.exe"
        shutil.copy2(installer, dest)
        print(f"[OK] Installer: {dest.name}")
        return True
    print("[WARN] Installer not found")
    return False


def move_apk(version):
    apk_pattern = str(PROJECT_ROOT / "android" / "app" / "build" / "outputs" / "apk" / "**" / "*.apk")
    apks = glob.glob(apk_pattern, recursive=True)
    
    for apk in apks:
        if "release" in apk.lower() or "debug" in apk.lower():
            apk_path = Path(apk)
            suffix = "release" if "release" in apk.lower() else "debug"
            dest = RELEASE_DIR / f"MemeFlow-{version}-{suffix}.apk"
            shutil.copy2(apk_path, dest)
            print(f"[OK] APK ({suffix}): {dest.name}")
            return True
    
    print("[WARN] No APK found (run Android build first)")
    return False


def main():
    print("=" * 50)
    print("  MemeFlow Release Tool")
    print("=" * 50)
    
    version = get_version()
    print(f"[INFO] Version: {version}")
    
    clean_release()
    
    print("\n[INFO] Moving Windows builds...")
    move_portable_exe(version)
    move_installer(version)
    
    print("\n[INFO] Moving Android builds...")
    move_apk(version)
    
    print("\n" + "=" * 50)
    print("  Done! Check the 'release' folder.")
    print("=" * 50)


if __name__ == "__main__":
    main()
