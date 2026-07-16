"""Generate Android mipmap icons from icon.png"""
import os
from PIL import Image

SOURCE = os.path.join(os.path.dirname(__file__), 'icon.png')
MIPMAP_BASE = os.path.join(os.path.dirname(__file__), 'android', 'app', 'src', 'main', 'res')

# Density -> size (px) for legacy icons
DENSITIES = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
}

img = Image.open(SOURCE)

# Use square crop from center if not square
w, h = img.size
if w != h:
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))

for density, size in DENSITIES.items():
    mipmap_dir = os.path.join(MIPMAP_BASE, f'mipmap-{density}')
    if not os.path.exists(mipmap_dir):
        print(f"Warning: {mipmap_dir} does not exist, skipping")
        continue
    
    resized = img.resize((size, size), Image.LANCZOS)
    
    # Legacy icons
    resized.save(os.path.join(mipmap_dir, 'ic_launcher.png'))
    resized.save(os.path.join(mipmap_dir, 'ic_launcher_round.png'))
    
    # Adaptive icon foreground: slightly smaller with padding
    # For adaptive icons, the safe zone is ~66% of the canvas
    fg_size = int(size * 0.75)
    fg = img.resize((fg_size, fg_size), Image.LANCZOS)
    fg_canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    offset = (size - fg_size) // 2
    fg_canvas.paste(fg, (offset, offset))
    fg_canvas.save(os.path.join(mipmap_dir, 'ic_launcher_foreground.png'))
    
    # Adaptive icon background: white
    bg = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    bg.save(os.path.join(mipmap_dir, 'ic_launcher_background.png'))

print("Done! Android icons generated successfully.")