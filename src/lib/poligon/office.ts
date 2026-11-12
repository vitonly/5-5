/*
 * Чтение файлов Word (.docx) и PowerPoint (.pptx) на сервере — без сторонних библиотек.
 * .docx и .pptx — это ZIP-архивы с XML внутри. Читаем оглавление архива,
 * распаковываем нужные XML встроенным zlib и достаём из них текст.
 * Используется только в API (сервер), в браузер не попадает.
 */
import { inflateRawSync } from "zlib";
import type { DocPara, Extract } from "./a-four";

/** Не распаковываем гигантов: архив до 64 МБ, один XML до 30 МБ */
const MAX_XML = 30 * 1024 * 1024;

/** Прочитать ZIP: имя файла внутри архива → его байты (только нужные имена) */
export function readZip(buf: Buffer, want: (name: string) => boolean): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // Конец центрального каталога (подпись 0x06054b50) ищем с конца файла
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("это не документ Office (не ZIP)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // где начинается центральный каталог
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (!want(name) || usize > MAX_XML) continue;
    // Локальный заголовок файла: после него начинаются сжатые данные
    const lnlen = buf.readUInt16LE(local + 26);
    const lxlen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lnlen + lxlen;
    const data = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, Buffer.from(data));
    else if (method === 8) out.set(name, inflateRawSync(data));
  }
  return out;
}

/** Убрать XML-сущности: &amp; → & и т.п. */
function unescape(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Текст из куска XML: все <w:t> или <a:t>, плюс табуляции как пробел */
function runText(xml: string, tag: "w" | "a") {
  const re = tag === "w" ? /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g : /<a:t>([^<]*)<\/a:t>/g;
  let s = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) s += m[1] !== undefined ? unescape(m[1]) : " ";
  return s;
}

/** Абзацы и таблицы из word/document.xml */
export function parseDocx(buf: Buffer): Extract {
  const files = readZip(buf, (n) => n === "word/document.xml");
  const xml = files.get("word/document.xml")?.toString("utf8");
  if (!xml) return { kind: "error", message: "внутри нет текста документа" };

  // Таблицы: <w:tbl> → строки <w:tr> → ячейки <w:tc>
  const tables: string[][][] = [];
  const tblRe = /<w:tbl>([\s\S]*?)<\/w:tbl>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tblRe.exec(xml))) {
    const rows: string[][] = [];
    for (const tr of tm[1].match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? []) {
      const cells = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((tc) =>
        (tc.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []).map((p) => runText(p, "w")).join(" ").trim()
      );
      rows.push(cells);
    }
    tables.push(rows);
  }

  // Абзацы вне таблиц: вырезаем таблицы, чтобы ячейки не считались заголовками
  const body = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, "");
  const paras: DocPara[] = [];
  for (const p of body.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
    const text = runText(p, "w").replace(/\s+/g, " ").trim();
    if (!text) continue;
    // Выделен: стиль заголовка (Heading/Заголовок/Title) или жирный во всём абзаце
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? "";
    const runs = p.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) ?? [];
    const textRuns = runs.filter((r) => /<w:t[\s>]/.test(r));
    const boldRun = (r: string) => /<w:b\/>|<w:b w:val="(true|1|on)"\/>/.test(r);
    const pBold = /<w:pPr>[\s\S]*?<w:rPr>[\s\S]*?(<w:b\/>|<w:b w:val="(true|1|on)"\/>)[\s\S]*?<\/w:rPr>[\s\S]*?<\/w:pPr>/.test(p);
    const strong = /heading|title|заголов|^\d$/i.test(style) || (textRuns.length > 0 && textRuns.every(boldRun)) || pBold;
    paras.push({ text, strong });
  }
  return { kind: "docx", paras, tables };
}

/** Текст каждого слайда из ppt/slides/slideN.xml — по порядку номеров */
export function parsePptx(buf: Buffer): Extract {
  const files = readZip(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const slides = [...files.entries()]
    .sort((a, b) => Number(a[0].match(/(\d+)\.xml$/)![1]) - Number(b[0].match(/(\d+)\.xml$/)![1]))
    .map(([, x]) => {
      const xml = x.toString("utf8");
      // Абзацы слайда <a:p> разделяем переносом строки
      return (xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []).map((p) => runText(p, "a")).filter(Boolean).join("\n");
    });
  if (!slides.length) return { kind: "error", message: "в презентации нет слайдов" };
  return { kind: "pptx", slides };
}
