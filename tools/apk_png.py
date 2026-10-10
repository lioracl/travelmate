"""Decode lossless Android PNG resources for comparison after aapt crunching."""
import struct
import zlib


def png_pixels(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    at, parts, palette, alpha = 8, [], b'', b''
    while at < len(data):
        size = int.from_bytes(data[at:at+4], 'big')
        kind, chunk = data[at+4:at+8], data[at+8:at+8+size]
        if kind == b'IHDR':
            width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
            assert interlace == 0
        elif kind == b'IDAT': parts.append(chunk)
        elif kind == b'PLTE': palette = chunk
        elif kind == b'tRNS': alpha = chunk
        at += size + 12
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    assert depth in (1, 2, 4, 8) and (depth == 8 or color in (0, 3))
    stride, bpp = (width*channels*depth+7)//8, max(1, (channels*depth+7)//8)
    raw, rows, cursor = zlib.decompress(b''.join(parts)), bytearray(height*stride), 0
    for y in range(height):
        filt = raw[cursor]; cursor += 1
        for x in range(stride):
            i = y*stride+x
            a = rows[i-bpp] if x >= bpp else 0
            b = rows[i-stride] if y else 0
            c = rows[i-stride-bpp] if y and x >= bpp else 0
            p = a+b-c
            distances = [abs(p-a), abs(p-b), abs(p-c)]
            predictor = [0, a, b, (a+b)//2, [a,b,c][distances.index(min(distances))]][filt]
            rows[i] = (raw[cursor]+predictor) & 255; cursor += 1
    rgba = bytearray()
    for y in range(height):
        for x in range(width):
            i = y*stride+x*channels
            if color == 3:
                bit = x*depth
                v = (rows[y*stride+bit//8] >> (8-depth-bit%8)) & ((1 << depth)-1)
                pixel = list(palette[v*3:v*3+3])+[alpha[v] if v < len(alpha) else 255]
            elif color in (2,6): pixel = list(rows[i:i+3])+[rows[i+3] if color == 6 else 255]
            else:
                v = rows[i] if depth == 8 else ((rows[y*stride+x*depth//8] >> (8-depth-(x*depth)%8)) & ((1 << depth)-1))*255//((1 << depth)-1)
                pixel = [v,v,v,rows[i+1] if color == 4 else 255]
            # Invisible RGB may be discarded by aapt; compare visible content and alpha.
            if pixel[3] == 0: pixel[:3] = [0,0,0]
            rgba.extend(pixel)
    return width, height, bytes(rgba)
