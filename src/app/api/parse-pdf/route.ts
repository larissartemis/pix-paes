import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { parseReceiptText } from "@/lib/receipt-parser";

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
