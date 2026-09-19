#!/usr/bin/env python3
"""Render the Osci Bear sprite from sprites.js into icons/icon{16,48,128}.png.
No dependencies: a tiny PNG encoder using zlib + struct."""
import json, os, re, struct, sys, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_sprite(name='osci'):
    src = open(os.path.join(ROOT, 'sprites.js'), encoding='utf-8').read()
    block = re.search(name + r":\s*\{(.*?)\n\s*\},", src, re.S).group(1)
    palette = dict(re.findall(r"(\w):\s*'(#[0-9a-fA-F]{6})'", re.search(r"palette:\s*\{(.*?)\}", block).group(1)))
    rows = re.findall(r"'([.\w]{16})'", re.search(r"rows:\s*\[(.*?)\]", block, re.S).group(1))
    assert len(rows) == 16, rows
    return palette, rows

def hex_rgb(h):
    return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

def png(width, height, pixels):
    raw = b''.join(b'\x00' + bytes(sum(pixels[y], ())) for y in range(height))
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def render(size, palette, rows, bg):
    scale = size // 16
    off = (size - 16 * scale) // 2
    img = [[bg] * size for _ in range(size)]
    # rounded background tile
    r = size // 5
    for y in range(size):
        for x in range(size):
            dx = max(r - x, 0, x - (size - 1 - r)); dy = max(r - y, 0, y - (size - 1 - r))
            if dx * dx + dy * dy > r * r:
                img[y][x] = (0, 0, 0, 0)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            col = hex_rgb(palette[ch]) + (255,)
            for yy in range(scale):
                for xx in range(scale):
                    img[off + y * scale + yy][off + x * scale + xx] = col
    return img

def main():
    palette, rows = load_sprite()
    out = os.path.join(ROOT, 'icons'); os.makedirs(out, exist_ok=True)
    for size in (16, 48, 128):
        bg = (23, 27, 49, 255) if size > 16 else (0, 0, 0, 0)
        data = png(size, size, render(size, palette, rows, bg))
        with open(os.path.join(out, f'icon{size}.png'), 'wb') as f:
            f.write(data)
        print('wrote', f'icons/icon{size}.png', len(data), 'bytes')

if __name__ == '__main__':
    main()
