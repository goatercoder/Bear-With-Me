#!/usr/bin/env python3
"""Render the healthy Oski sprite from oski.js into icons/icon{16,48,128}.png.
No dependencies: a tiny PNG encoder using zlib + struct."""
import os, re, struct, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load():
    src = open(os.path.join(ROOT, 'oski.js'), encoding='utf-8').read()
    palette = dict(re.findall(r"^\s+(\w):\s*'(#[0-9a-fA-F]{6})'", src, re.M))
    rows = re.findall(r"^\s+'([.\w]{24})',$", src[src.index('const BASE'):src.index('const STAGES')], re.M)
    assert len(rows) == 24, len(rows)
    return palette, rows

def hex_rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

def png(size, pixels):
    raw = b''.join(b'\x00' + bytes(sum(pixels[y], ())) for y in range(size))
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def render(size, palette, rows):
    img = [[(0, 0, 0, 0)] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            sx, sy = x * 24 // size, y * 24 // size     # nearest-neighbour sample
            ch = rows[sy][sx]
            if ch != '.':
                img[y][x] = hex_rgb(palette[ch]) + (255,)
    return img

def main():
    palette, rows = load()
    out = os.path.join(ROOT, 'icons'); os.makedirs(out, exist_ok=True)
    for size in (16, 48, 128):
        data = png(size, render(size, palette, rows))
        open(os.path.join(out, f'icon{size}.png'), 'wb').write(data)
        print('wrote', f'icons/icon{size}.png', len(data), 'bytes')

if __name__ == '__main__':
    main()
