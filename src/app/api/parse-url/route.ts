import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { parseReceiptText } from "@/lib/receipt-parser";

function isAllowedPublicUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string };
    const targetUrl = body.url?.trim() || "";
    const validUrl = isAllowedPublicUrl(targetUrl);

    if (!validUrl) {
      return NextResponse.json(
        { error: "URL inválida ou não permitida." },
        { status: 400 }
      );
    }

    const res = await fetch(validUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Falha ao acessar o link (HTTP ${res.status}).` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/pdf")) {
      return NextResponse.json(
        { error: "O link aponta diretamente para um PDF. Baixe e envie o PDF." },
        { status: 400 }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const pageTitle = $("title").text().trim();
    const ogDesc = $('meta[property="og:description"]').attr("content")?.trim() || "";

    $("script, style, noscript, svg, iframe").remove();

    // Preserve line breaks across block elements
    $("br").replaceWith("\n");
    $("p, div, li, tr, h1, h2, h3, h4, h5, h6, section, article, span").each((_, el) => {
      $(el).append("\n");
    });

    const bodyText = $("body").text();

    const combinedText = [pageTitle, ogDesc, bodyText].filter(Boolean).join("\n");
    const receipt = parseReceiptText(combinedText, "url");

    return NextResponse.json({
      receipt,
      text: receipt.rawText,
      title: pageTitle,
    });
  } catch (err) {
    console.error("[parse-url] Error:", err);
    return NextResponse.json(
      { error: "Não foi possível carregar os dados do link." },
      { status: 500 }
    );
  }
}
