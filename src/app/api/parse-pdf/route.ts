import zlib from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { extractImages, extractText, getDocumentProxy } from "unpdf";
import { parseReceiptText } from "@/lib/receipt-parser";

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function rawPixelsToPngBase64(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channels: number
): string {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * channels;
      const dstIdx = rowStart + 1 + x * 4;
      if (channels === 1) {
        const g = data[srcIdx];
        raw[dstIdx] = g;
        raw[dstIdx + 1] = g;
        raw[dstIdx + 2] = g;
        raw[dstIdx + 3] = 255;
      } else if (channels === 3) {
        raw[dstIdx] = data[srcIdx];
        raw[dstIdx + 1] = data[srcIdx + 1];
        raw[dstIdx + 2] = data[srcIdx + 2];
        raw[dstIdx + 3] = 255;
      } else {
        raw[dstIdx] = data[srcIdx];
        raw[dstIdx + 1] = data[srcIdx + 1];
        raw[dstIdx + 2] = data[srcIdx + 2];
        raw[dstIdx + 3] = data[srcIdx + 3];
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA

  const idat = zlib.deflateSync(raw);
  const pngBuffer = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);

  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "Nenhum arquivo PDF enviado." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const cleanText = (text || "").trim();

    // Scanned / image-only PDF: extract embedded images for client-side OCR
    if (cleanText.length < 20) {
      const images: string[] = [];
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pageImages = await extractImages(pdf, pageNum);
        for (const img of pageImages) {
          if (img.width > 50 && img.height > 50) {
            images.push(
              rawPixelsToPngBase64(img.data, img.width, img.height, img.channels)
            );
          }
        }
      }

      if (images.length > 0) {
        return NextResponse.json({
          needsOcr: true,
          images,
          text: cleanText,
          totalPages,
        });
      }
    }

    const receipt = parseReceiptText(text || "", "pdf");

    return NextResponse.json({
      receipt,
      text: text || "",
      totalPages,
    });
  } catch (err) {
    console.error("[parse-pdf] Error:", err);
    return NextResponse.json(
      { error: "Não foi possível ler o PDF enviado." },
      { status: 500 }
    );
  }
}
