export interface ReportPixRow {
  index: number;
  dataTransacao: string; // YYYY-MM-DD (para banco de dados)
  dataCurta: string; // DD/MM
  dataCompleta: string; // DD/MM/YYYY
  horaTransacao: string; // HH:MM
  nomeRelatorio: string; // Pagador
  chaveDestino: string | null; // "chave do vendedor" | "sem chave" | etc.
  valor: number; // Numeric value (e.g. 98.00)
  valorFormatado: string; // "R$ 98,00"
  idTransacao: string; // endToEndId
}

export interface ParsedReport {
  vendedorNome: string | null;
  vendedorEmail: string | null;
  diaSemana: string | null;
  dataCurta: string | null; // DD/MM
  dataCompleta: string | null; // DD/MM/YYYY
  dataIso: string | null; // YYYY-MM-DD
  quantidadeEsperada: number;
  quantidadeExtraida: number;
  totalRecebido: number;
  totalRecebidoFormatado: string;
  itens: ReportPixRow[];
  rawText: string;
}

function parseBrCurrency(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function formatBrCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function cleanPayerAndDestinationKey(middleText: string): {
  payer: string;
  destinationKey: string | null;
} {
  const collapsed = middleText.replace(/\s+/g, " ").trim();
  const keyMatch = collapsed.match(
    /^(.*?)\s+(chave do vendedor|sem chave|outra chave)$/i
  );
  if (keyMatch) {
    return {
      payer: keyMatch[1].trim(),
      destinationKey: keyMatch[2].toLowerCase(),
    };
  }
  return {
    payer: collapsed,
    destinationKey: null,
  };
}

export function parseReportText(rawInput: string): ParsedReport {
  const normalized = rawInput
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let vendedorNome: string | null = null;
  let vendedorEmail: string | null = null;
  let diaSemana: string | null = null;
  let dataCurta: string | null = null;
  let dataCompleta: string | null = null;
  let dataIso: string | null = null;

  // Example header line:
  // "VAL · Sábado, 07/11/2026 · Vendedor da transação: val@passaky.com.br"
  for (const line of lines.slice(0, 12)) {
    const headerMatch = line.match(
      /^(.+?)\s*[·•-]\s*([A-Za-zÀ-ÿ-]+),\s*(\d{2})\/(\d{2})\/(\d{4})(?:.*?Vendedor da transa[çc][aã]o:\s*(\S+))?/i
    );
    if (headerMatch) {
      vendedorNome = headerMatch[1].trim();
      diaSemana = headerMatch[2].trim();
      const dd = headerMatch[3];
      const mm = headerMatch[4];
      const yyyy = headerMatch[5];
      dataCurta = `${dd}/${mm}`;
      dataCompleta = `${dd}/${mm}/${yyyy}`;
      dataIso = `${yyyy}-${mm}-${dd}`;
      if (headerMatch[6]) {
        vendedorEmail = headerMatch[6].trim();
      }
      break;
    }
  }

  // Fallback date search if header format varied slightly
  if (!dataCompleta) {
    for (const line of lines.slice(0, 15)) {
      if (/Gerado em/i.test(line)) continue;
      const dateMatch = line.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
      if (dateMatch) {
        const [, dd, mm, yyyy] = dateMatch;
        dataCurta = `${dd}/${mm}`;
        dataCompleta = `${dd}/${mm}/${yyyy}`;
        dataIso = `${yyyy}-${mm}-${dd}`;
        break;
      }
    }
  }

  // Locate "PIX de clientes do vendedor — [qtde] PIX"
  let sectionStartIdx = -1;
  let quantidadeEsperada = 0;

  for (let i = 0; i < lines.length; i++) {
    const sectionMatch = lines[i].match(
      /PIX de clientes do vendedor\s*[—–-]\s*(\d+)\s*PIX/i
    );
    if (sectionMatch) {
      sectionStartIdx = i;
      quantidadeEsperada = Number.parseInt(sectionMatch[1], 10) || 0;
      break;
    }
  }

  const candidateLines: string[] = [];

  if (sectionStartIdx !== -1) {
    for (let i = sectionStartIdx + 1; i < lines.length; i++) {
      const line = lines[i];

      // Stop when reaching table footer / summary
      if (
        /^Total recebido\b/i.test(line) ||
        /^Crit[ée]rio:/i.test(line) ||
        /^PIX pagos pelo pr[óo]prio vendedor/i.test(line)
      ) {
        break;
      }

      // Skip repeated page headers and table column headers across page breaks
      if (
        /^Passaky\s*[·•]/i.test(line) ||
        /^Hora\s+Pagador\s+Chave de destino\s+Valor\s+endToEndId$/i.test(line) ||
        /^Relat[óo]rio do dia/i.test(line)
      ) {
        continue;
      }

      candidateLines.push(line);
    }
  }

  const sectionText = candidateLines.join("\n");

  // Match each row starting with HH:MM and ending with R$ <valor> <endToEndId>
  const rowRegex =
    /(\d{2}:\d{2})\s+([\s\S]*?)\s+R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+(E[A-Za-z0-9]{20,35})\b/g;

  const itens: ReportPixRow[] = [];
  let match: RegExpExecArray | null;

  while ((match = rowRegex.exec(sectionText)) !== null) {
    const horaTransacao = match[1].trim();
    const middle = match[2];
    const valorRaw = match[3];
    const idTransacao = match[4].trim();

    const { payer, destinationKey } = cleanPayerAndDestinationKey(middle);
    const valor = parseBrCurrency(valorRaw);

    itens.push({
      index: itens.length + 1,
      dataTransacao: dataIso || "",
      dataCurta: dataCurta || "",
      dataCompleta: dataCompleta || "",
      horaTransacao,
      nomeRelatorio: payer,
      chaveDestino: destinationKey,
      valor,
      valorFormatado: `R$ ${valorRaw}`,
      idTransacao,
    });
  }

  const totalRecebido = itens.reduce(
    (acc, item) => Math.round((acc + item.valor) * 100) / 100,
    0
  );

  return {
    vendedorNome,
    vendedorEmail,
    diaSemana,
    dataCurta,
    dataCompleta,
    dataIso,
    quantidadeEsperada,
    quantidadeExtraida: itens.length,
    totalRecebido,
    totalRecebidoFormatado: formatBrCurrency(totalRecebido),
    itens,
    rawText: normalized,
  };
}
