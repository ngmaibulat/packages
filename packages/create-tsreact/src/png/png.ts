import { deflateSync } from "node:zlib";

//A minimal PNG writer. PNG is a signature, a few length-type-data-crc chunks
//and a zlib stream of filtered scanlines - node ships the only hard part
//(deflate) in its standard library, so this needs no dependency and no
//binary asset checked into the repo.
//
//Only what the icons need is implemented: 8-bit RGBA, no interlacing, and
//filter type 0 (none) on every scanline. Real encoders pick a filter per
//scanline to compress better; for flat-colour artwork it makes no difference.

const CRC_TABLE = (() => {
    const table = new Int32Array(256);

    for (let n = 0; n < 256; n++) {
        let c = n;

        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }

        table[n] = c;
    }

    return table;
})();

function crc32(buf: Buffer) {
    let c = 0xffffffff;

    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }

    return (c ^ 0xffffffff) >>> 0;
}

//length | type | data | crc, where the crc covers type+data but not length
function chunk(type: string, data: Buffer) {
    const out = Buffer.alloc(data.length + 12);

    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);

    return out;
}

export default function encodePng(size: number, rgba: Buffer) {
    const stride = size * 4;

    //every scanline is prefixed with its filter byte
    const raw = Buffer.alloc((stride + 1) * size);

    for (let y = 0; y < size; y++) {
        const row = y * (stride + 1);

        raw[row] = 0;
        rgba.copy(raw, row + 1, y * stride, (y + 1) * stride);
    }

    const ihdr = Buffer.alloc(13);

    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; //bit depth
    ihdr[9] = 6; //colour type 6 = truecolour with alpha
    ihdr[10] = 0; //compression: deflate, the only defined value
    ihdr[11] = 0; //filter method: adaptive, the only defined value
    ihdr[12] = 0; //not interlaced

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}
