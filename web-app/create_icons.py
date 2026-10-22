import zlib
import struct

def make_png(width, height, r, g, b):
    # Construct raw RGBA pixel data
    raw = bytearray()
    for y in range(height):
        raw.append(0) # filter byte 0 (None)
        for x in range(width):
            # Draw a rounded badge with dark blue background and cyan bike accent
            dx = (x - width / 2) / (width / 2)
            dy = (y - height / 2) / (height / 2)
            dist = dx * dx + dy * dy
            if dist < 0.7:
                # Center cyan/blue gradient
                raw.extend([30, 144, 255, 255])
            elif dist < 0.9:
                raw.extend([15, 23, 42, 255])
            else:
                raw.extend([11, 15, 25, 255])

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(bytes(raw)))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

with open(r'c:\Users\maison\home trainer\web-app\icon-192.png', 'wb') as f:
    f.write(make_png(192, 192, 56, 189, 248))

with open(r'c:\Users\maison\home trainer\web-app\icon-512.png', 'wb') as f:
    f.write(make_png(512, 512, 56, 189, 248))

print("Icons created successfully!")
