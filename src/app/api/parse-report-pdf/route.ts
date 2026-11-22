import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { parseReportText } from "@/lib/report-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "Nenhum arquivo PDF de relatório foi enviado." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    const report = parseReportText(text || "");

    if (!report.dataCurta && report.itens.length === 0) {
      return NextResponse.json(
        {
          error:
            "Não foi possível encontrar a tabela de PIX de clientes neste PDF. Verifique se o arquivo é um relatório válido.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      report,
      totalPages,
    });
  } catch (err) {
    console.error("[parse-report-pdf] Error:", err);
    return NextResponse.json(
      { error: "Não foi possível processar o PDF do relatório." },
      { status: 500 }
    );
  }
}
