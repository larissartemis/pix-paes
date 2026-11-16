export type ReceiptSourceType = "image" | "pdf" | "url" | "text";

export interface ParsedReceipt {
  payerName: string | null;
  payerDocument: string | null;
  payerBank: string | null;
  payerAgency: string | null;
  payerAccount: string | null;
  receiverName: string | null;
  receiverDocument: string | null;
  receiverBank: string | null;
  pixKey: string | null;
  amount: string | null;
  dateTime: string | null;
  transactionId: string | null;
  paymentType: string | null;
  bankDetected: string;
  confidence: "alta" | "média" | "baixa";
  rawText: string;
  sourceType: ReceiptSourceType;
}

const DOC_REGEX =
  /(?:[*+tTxX•.\d]{3})[.,]?\d{3}[.,]?\d{3}-?(?:[*+tTxX•.\d]{2})|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14}|\d{11}/i;

const AMOUNT_REGEX = /R\s*(?:\$|§|S(?=\s+\d))\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)/i;

const E2E_REGEX = /\b(E\d{8}[A-Za-z0-9]{15,26})\b/;

export function normalizeReceiptText(raw: string): string {
  return raw
    // Fix PicPay/PDF private-use-area glyphs
    .replace(/\uE092/g, ":")
    .replace(/\uE088/g, "-")
    .replace(/[•●·]/g, "*")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectBank(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("mercado pago")) return "Mercado Pago";
  if (lower.includes("nu pagamentos") || lower.includes("nubank")) return "Nubank";
  if (lower.includes("pagbank") || lower.includes("pagseguro")) return "PagBank";
  if (lower.includes("banco inter")) return "Banco Inter";
  if (lower.includes("stone institui") || lower.includes("stone")) return "Stone";
  if (lower.includes("picpay")) return "PicPay";
  if (lower.includes("infinitepay")) return "InfinitePay";
  if (lower.includes("itaú") || lower.includes("itau")) return "Itaú";
  if (lower.includes("bradesco")) return "Bradesco";
  if (lower.includes("santander")) return "Santander";
  if (lower.includes("caixa econ")) return "Caixa";
  if (lower.includes("banco do brasil") || lower.includes("bco do brasil")) return "Banco do Brasil";
  if (lower.includes("c6 bank") || lower.includes("banco c6")) return "C6 Bank";
  return "Comprovante Pix";
}

function extractAmount(text: string): string | null {
  const match = text.match(AMOUNT_REGEX);
  if (!match) return null;
  let num = match[1];
  if (!num.includes(",")) {
    num = `${num},00`;
  }
  return `R$ ${num}`;
}

function extractTransactionId(text: string): string | null {
  // Pix E2E IDs are 32 chars: E + 8 digits (ISPB) + 12 digits (YYYYMMDDHHMM) + 11 chars
  const direct = text.match(/\b(E\d{8}[A-Za-z0-9]{23})\b/);
  if (direct) return direct[1];

  // Handle wrapped E2E IDs (e.g. PicPay wraps last 2 chars onto next line)
  const wrapped = text.match(/\b(E\d{8}[A-Za-z0-9]{10,22})\n([A-Za-z0-9]{1,12})(?:\s|$)/);
  if (wrapped) {
    const combined = `${wrapped[1]}${wrapped[2]}`;
    if (combined.length <= 34) return combined;
  }

  const fallbackE2E = text.match(E2E_REGEX);
  if (fallbackE2E) return fallbackE2E[1];

  const authMatch = text.match(
    /(?:c[oó]digo da autentica[çc][aã]o|id da transa[çc][aã]o|c[oó]digo da transa[çc][aã]o)[:\s]*([A-Za-z0-9-]{10,})/i
  );
  return authMatch ? authMatch[1] : null;
}

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  janeiro: "01",
  fev: "02",
  fevereiro: "02",
  mar: "03",
  marco: "03",
  "março": "03",
  abr: "04",
  abril: "04",
  mai: "05",
  maio: "05",
  jun: "06",
  junho: "06",
  jul: "07",
  julho: "07",
  ago: "08",
  agosto: "08",
  set: "09",
  setembro: "09",
  out: "10",
  outubro: "10",
  nov: "11",
  novembro: "11",
  dez: "12",
  dezembro: "12",
};

function pad2(n: string): string {
  return n.padStart(2, "0");
}

function normalizeMonth(m: string): string {
  const clean = m.toLowerCase().trim();
  if (/^\d{1,2}$/.test(clean)) return pad2(clean);
  return MONTH_MAP[clean] || MONTH_MAP[clean.slice(0, 3)] || "01";
}

function formatDocument(doc: string | null): string | null {
  if (!doc) return null;
  const trimmed = doc.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (/^\d{14}$/.test(trimmed)) {
    return trimmed.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5"
    );
  }
  if (/^\d{11}$/.test(trimmed)) {
    return trimmed.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  if (digitsOnly.length === 14 && !trimmed.includes("*")) {
    return digitsOnly.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5"
    );
  }
  return trimmed;
}

function extractDateTime(text: string): string | null {
  // 1. Slash date WITH time: 15/novembro/2026 às 8:08:40 | 15/11/2026 às 01:44:24 | 14/nov/2026 - 23:57:39
  const slashWithTime = text.match(
    /(\d{1,2})\/([a-zç]+|\d{1,2})\/(\d{4})\s*(?:às|as|-|\*)?\s*(\d{1,2}):(\d{2})(?::\d{2})?/i
  );
  if (slashWithTime) {
    const [, d, m, y, hh, mm] = slashWithTime;
    return `${pad2(d)}/${normalizeMonth(m)}/${y} às ${pad2(hh)}:${mm}`;
  }

  // 2. Word month WITH time: 14 NOV 2026 - 22:51:00 | 15 nov 2026 às 00:14:11 | 15 Nov, 2026 * 01:35
  const wordWithTime = text.match(
    /(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*,?\s+(\d{4})\s*(?:às|as|-|\*)?\s*(\d{1,2}):(\d{2})(?::\d{2})?/i
  );
  if (wordWithTime) {
    const [, d, m, y, hh, mm] = wordWithTime;
    return `${pad2(d)}/${normalizeMonth(m)}/${y} às ${pad2(hh)}:${mm}`;
  }

  // 3. Inter / multi-line format: Data do pagamento ... 14/11/2026 ... Horário 22h28 (or 22:28)
  const interDate = text.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})[\s\S]{0,100}?(?:hor[aá]rio\s*)?(\d{1,2})[h:](\d{2})/i
  );
  if (interDate) {
    const [, d, m, y, hh, mm] = interDate;
    return `${pad2(d)}/${pad2(m)}/${y} às ${pad2(hh)}:${mm}`;
  }

  // 4. Fallback: date only
  const dateOnly = text.match(/(\d{1,2})\/([a-zç]+|\d{1,2})\/(\d{4})/i);
  if (dateOnly) {
    const [, d, m, y] = dateOnly;
    return `${pad2(d)}/${normalizeMonth(m)}/${y}`;
  }

  return null;
}

function isLabelLine(line: string): boolean {
  const clean = line.toLowerCase().replace(/[:]/g, "").trim();
  return [
    "nome",
    "cpf",
    "cnpj",
    "cpf/cnpj",
    "instituição",
    "instituicao",
    "agência",
    "agencia",
    "conta",
    "tipo de conta",
    "chave",
    "chave pix",
    "valor",
    "status",
    "meio",
    "de",
    "para",
    "origem",
    "destino",
    "dados de origem",
    "dados de destino",
    "quem pagou",
    "quem recebeu",
    "pagador",
    "recebedor",
    "identificadores",
    "sobre a transação",
    "informações adicionais",
    "dados bancários do recebedor",
  ].includes(clean);
}

function parseKeyValueBlock(lines: string[]): {
  name: string | null;
  document: string | null;
  bank: string | null;
  agency: string | null;
  account: string | null;
  pixKey: string | null;
} {
  let name: string | null = null;
  let document: string | null = null;
  let bank: string | null = null;
  let agency: string | null = null;
  let account: string | null = null;
  let pixKey: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === "-") continue;

    // Inline "Label: Value" or "Label Value" (e.g. "Nome Luciana Maria dos Santos")
    const nomeInline = line.match(/^Nome[:\s]+(.+)$/i);
    if (nomeInline && !name) {
      name = nomeInline[1].trim();
      continue;
    }
    if (/^Nome$/i.test(line) && lines[i + 1] && !isLabelLine(lines[i + 1]) && !name) {
      name = lines[++i].trim();
      continue;
    }

    const docInline = line.match(/^(?:CPF\/CNPJ|CPF|CNPJ)[:\s]+(.+)$/i);
    if (docInline && !document) {
      document = docInline[1].trim();
      continue;
    }
    if (/^(?:CPF\/CNPJ|CPF|CNPJ)$/i.test(line) && lines[i + 1] && !document) {
      document = lines[++i].trim();
      continue;
    }

    const instInline = line.match(/^Institui[çc][aã]o[:\s]+(.+)$/i);
    if (instInline && !bank) {
      bank = instInline[1].trim();
      continue;
    }
    if (/^Institui[çc][aã]o$/i.test(line) && lines[i + 1] && !bank) {
      bank = lines[++i].trim();
      continue;
    }

    const agInline = line.match(/^Ag[êe]ncia[:\s]+(.+)$/i);
    if (agInline && !agency) {
      agency = agInline[1].trim();
      continue;
    }
    if (/^Ag[êe]ncia$/i.test(line) && lines[i + 1] && !agency) {
      agency = lines[++i].trim();
      continue;
    }

    const accInline = line.match(/^Conta[:\s]+(.+)$/i);
    if (accInline && !account) {
      account = accInline[1].trim();
      continue;
    }
    if (/^Conta$/i.test(line) && lines[i + 1] && !account) {
      account = lines[++i].trim();
      continue;
    }

    const keyInline = line.match(/^Chave[:\s]+(.+)$/i);
    if (keyInline && !pixKey) {
      pixKey = keyInline[1].trim();
      continue;
    }
    if (/^Chave$/i.test(line) && lines[i + 1] && !pixKey) {
      pixKey = lines[++i].trim();
      continue;
    }
  }

  // Fallback for positional blocks (like PagBank, PicPay, Mercado Pago)
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "-" || isLabelLine(trimmed)) continue;

    if (!document && DOC_REGEX.test(trimmed)) {
      const m = trimmed.match(DOC_REGEX);
      if (m) document = m[0];
      continue;
    }
    if (!name && !DOC_REGEX.test(trimmed) && !/^(?:banco|bco|pagbank|picpay|mercado pago|nu pagamentos|stone|cloudwalk|itaú|bradesco|santander|caixa)/i.test(trimmed)) {
      // Avoid picking up OCR icon artifacts (e.g. "o", "®"), account labels, emails, or OCR-mangled email keys
      const letterCount = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, "").length;
      if (
        letterCount >= 3 &&
        !/^(?:conta corrente|poupan[çc]a|ag\s*\d+|cc\s*\d+|tipo de)/i.test(trimmed) &&
        !/[@©]|\.(?:com|br|net|org)\b/i.test(trimmed)
      ) {
        name = trimmed.replace(/^[^A-Za-z0-9À-ÿ]+/, "").replace(/\s+\.$/, "").trim();
        continue;
      }
    }
    if (!bank && /(?:banco|bco|pagbank|pagseguro|picpay|mercado pago|nu pagamentos|stone|inter|itaú|bradesco|santander|caixa|s\.a\.|ip\b)/i.test(trimmed)) {
      bank = trimmed;
    }
  }

  return { name, document, bank, agency, account, pixKey };
}

function splitSections(lines: string[]): {
  payerLines: string[];
  receiverLines: string[];
} {
  const payerMarkers = [
    /^quem pagou$/i,
    /^dados de origem$/i,
    /^origem$/i,
    /^de$/i,
    /^pagador$/i,
    /^dados do pagador$/i,
    /^pago por$/i,
  ];
  const receiverMarkers = [
    /^quem recebeu$/i,
    /^dados de destino$/i,
    /^destino$/i,
    /^para$/i,
    /^recebedor$/i,
    /^dados do recebedor$/i,
  ];
  const stopMarkers = [
    /^informa[çc][õo]es adicionais$/i,
    /^identificadores$/i,
    /^id da transa[çc][aã]o/i,
    /^dados banc[aá]rios/i,
    /^nu pagamentos s\.a\./i,
    /^d[uú]vidas\?/i,
    /^ouvidoria/i,
    /^para d[uú]vidas/i,
    /^n\.?[º°]?\s*transa[çc][aã]o/i,
  ];

  // Special case: Mercado Pago ("Origem e destino")
  const origemEDestinoIdx = lines.findIndex((l) => /^origem e destino$/i.test(l.trim()));
  if (origemEDestinoIdx !== -1) {
    const block: string[] = [];
    for (let i = origemEDestinoIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (stopMarkers.some((m) => m.test(t))) break;
      if (t && t !== "-") block.push(t);
    }
    // In Mercado Pago, first CNPJ/CPF line separates payer from receiver
    const firstDocIdx = block.findIndex(
      (l) => DOC_REGEX.test(l) || /^(?:CPF|CNPJ)[:\s]/i.test(l)
    );
    if (firstDocIdx !== -1) {
      return {
        payerLines: block.slice(0, firstDocIdx + 1),
        receiverLines: block.slice(firstDocIdx + 1),
      };
    }
  }

  let mode: "none" | "payer" | "receiver" = "none";
  const payerLines: string[] = [];
  const receiverLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (payerMarkers.some((m) => m.test(line))) {
      mode = "payer";
      continue;
    }
    if (receiverMarkers.some((m) => m.test(line))) {
      mode = "receiver";
      continue;
    }
    if (stopMarkers.some((m) => m.test(line))) {
      mode = "none";
      continue;
    }

    if (mode === "payer") payerLines.push(line);
    else if (mode === "receiver") receiverLines.push(line);
  }

  return { payerLines, receiverLines };
}

export function parseReceiptText(
  rawInput: string,
  sourceType: ReceiptSourceType
): ParsedReceipt {
  const text = normalizeReceiptText(rawInput);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bankDetected = detectBank(text);
  const amount = extractAmount(text);
  const dateTime = extractDateTime(text);
  const transactionId = extractTransactionId(text);

  const { payerLines, receiverLines } = splitSections(lines);
  const payer = parseKeyValueBlock(payerLines);
  const receiver = parseKeyValueBlock(receiverLines);

  let confidence: "alta" | "média" | "baixa" = "baixa";
  if (payer.name && (amount || payer.document)) {
    confidence = "alta";
  } else if (payer.name || amount || transactionId) {
    confidence = "média";
  }

  const paymentType = /pix/i.test(text)
    ? "Pix"
    : /transfer[êe]ncia/i.test(text)
    ? "Transferência"
    : /cart[aã]o/i.test(text)
    ? "Cartão"
    : null;

  return {
    payerName: payer.name,
    payerDocument: formatDocument(payer.document),
    payerBank: payer.bank,
    payerAgency: payer.agency,
    payerAccount: payer.account,
    receiverName: receiver.name,
    receiverDocument: formatDocument(receiver.document),
    receiverBank: receiver.bank,
    pixKey: receiver.pixKey,
    amount,
    dateTime,
    transactionId,
    paymentType,
    bankDetected,
    confidence,
    rawText: text,
    sourceType,
  };
}
