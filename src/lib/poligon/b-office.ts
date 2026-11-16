import { deflateRawSync } from "node:zlib";
import { posix } from "node:path";
import { TextDecoder } from "node:util";
import { readZip } from "./office";
import { makeBDataset, type BCell } from "./b-dataset";

const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const MAX_FILE = 30 * 1024 * 1024, MAX_TOTAL = 80 * 1024 * 1024;
function fail(message: string): never { throw new Error(`Office: ${message}`); }

/** CRC проверяется и при чтении: одного успешного inflate недостаточно. */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP32 с фиксированной датой: одни и те же входные строки дают одинаковые байты. */
function zip(parts: Map<string, string>): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of parts) {
    const filename = Buffer.from(name), raw = Buffer.from(text), data = deflateRawSync(raw);
    const crc = crc32(raw), local = Buffer.alloc(30), dir = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
    dir.writeUInt32LE(0x02014b50); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x800, 8); dir.writeUInt16LE(8, 10); dir.writeUInt16LE(33, 14);
    dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(filename.length, 28); dir.writeUInt32LE(offset, 42);
    locals.push(local, filename, data); central.push(dir, filename);
    offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(parts.size, 8); end.writeUInt16LE(parts.size, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** Сначала строгая проверка границ; саму распаковку выполняет общий readZip. ZIP64 и шифрование не поддерживаются. */
function readOffice(buf: Buffer): Map<string, Buffer> {
  if (!Buffer.isBuffer(buf) || buf.length < 22 || buf.length > 64 * 1024 * 1024) fail("недопустимый размер ZIP");
  let end = -1;
  for (let p = buf.length - 22; p >= Math.max(0, buf.length - 65557); p--) {
    if (buf.readUInt32LE(p) === 0x06054b50 && p + 22 + buf.readUInt16LE(p + 20) === buf.length) { end = p; break; }
  }
  if (end < 0) fail("не найден конец ZIP");
  const count = buf.readUInt16LE(end + 10), size = buf.readUInt32LE(end + 12), start = buf.readUInt32LE(end + 16);
  if (buf.readUInt16LE(end + 4) || buf.readUInt16LE(end + 6) || count !== buf.readUInt16LE(end + 8) || count === 65535 || count > 4096 || start + size !== end) fail("повреждённый каталог ZIP или неподдерживаемый ZIP64/многотомный архив");
  const entries = new Map<string, { length: number; crc: number }>();
  const ranges: [number, number][] = [];
  let p = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || buf.readUInt32LE(p) !== 0x02014b50) fail("повреждён заголовок ZIP");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20), length = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    if (p + 46 + nl + xl + cl > end || local + 30 > start || buf.readUInt32LE(local) !== 0x04034b50) fail("выход заголовка ZIP за границы");
    const name = buf.toString("utf8", p + 46, p + 46 + nl);
    if (!name || name.includes("\\") || name.startsWith("/") || name.split("/").some(s => s === "." || s === "..") || entries.has(name)) fail("неоднозначное имя части ZIP");
    if ((flags & ~0x808) !== 0 || ![0, 8].includes(method) || buf.readUInt16LE(p + 34)) fail("неподдерживаемое сжатие или шифрование ZIP");
    const lnl = buf.readUInt16LE(local + 26), lxl = buf.readUInt16LE(local + 28), data = local + 30 + lnl + lxl;
    if (buf.readUInt16LE(local + 6) !== flags || buf.readUInt16LE(local + 8) !== method || lnl !== nl || data + compressed > start || !buf.subarray(local + 30, local + 30 + lnl).equals(buf.subarray(p + 46, p + 46 + nl))) fail("локальный заголовок ZIP не совпадает с каталогом");
    if (!(flags & 8) && (buf.readUInt32LE(local + 14) !== buf.readUInt32LE(p + 16) || buf.readUInt32LE(local + 18) !== compressed || buf.readUInt32LE(local + 22) !== length)) fail("размер или CRC в заголовках ZIP различается");
    total += length;
    if (length > MAX_FILE || total > MAX_TOTAL || (method === 0 && compressed !== length)) fail("превышен лимит распаковки ZIP или неверный размер");
    entries.set(name, { length, crc: buf.readUInt32LE(p + 16) }); ranges.push([local, data + compressed]);
    p += 46 + nl + xl + cl;
  }
  if (p !== end) fail("размер каталога ZIP не совпадает");
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) fail("части ZIP перекрываются");
  // Проверяем все части, чтобы битые или пропущенные файлы не выглядели корректным отчётом.
  // Комментарий ZIP может содержать ложную сигнатуру EOCD; общему reader передаём архив без комментария.
  const files = readZip(buf.subarray(0, end + 22), () => true);
  for (const [name, entry] of entries) {
    const data = files.get(name);
    if (!data || data.length !== entry.length || crc32(data) !== entry.crc) fail(`неверный размер или CRC: ${name}`);
  }
  return files;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function col(n: number): string { let s = ""; for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }
function worksheet(rows: BCell[][]): string {
  return declaration + `<worksheet xmlns="${S}"><sheetData>` + rows.map((row, i) => `<row r="${i + 1}">` + row.map((value, j) => {
    const ref = `${col(j + 1)}${i + 1}`;
    if (value === null) return `<c r="${ref}"/>`;
    return typeof value === "number" ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
  }).join("") + "</row>").join("") + "</sheetData></worksheet>";
}

/** Выгружаются именно грязные строки; ключи и решения в файл ученика не попадают. */
export function buildBDatasetXlsx(seed: string): Buffer {
  const sheets = Object.entries(makeBDataset(seed).rawSheets), files = new Map<string, string>();
  files.set("[Content_Types].xml", declaration + `<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + "</Types>");
  files.set("_rels/.rels", declaration + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  files.set("xl/workbook.xml", declaration + `<workbook xmlns="${S}" xmlns:r="${R}"><sheets>` + sheets.map(([name], i) => `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + "</sheets></workbook>");
  files.set("xl/_rels/workbook.xml.rels", declaration + `<Relationships xmlns="${PKG}">` + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") + "</Relationships>");
  sheets.forEach(([, rows], i) => files.set(`xl/worksheets/sheet${i + 1}.xml`, worksheet(rows)));
  return zip(files);
}

interface Xml { name: string; ns: string; attrs: Record<string, string>; children: Xml[]; text: string }
/** URI, а не префикс: поддерживаются обычные и Strict OOXML namespaces. */
function canonical(ns: string): string {
  return ns.replace("http://purl.oclc.org/ooxml/", "http://schemas.openxmlformats.org/").replace(/(spreadsheetml|presentationml|drawingml)\/main$/, "$1/2006/main").replace("officeDocument/relationships", "officeDocument/2006/relationships").replace("drawingml/chart", "drawingml/2006/chart");
}
function decode(s: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(s)) fail("неизвестная XML-сущность");
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (_, entity: string) => {
    const simple: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity[0] !== "#") return simple[entity];
    const n = entity[1] === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!(n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff))) fail("недопустимая XML-сущность");
    return String.fromCodePoint(n);
  });
}
function parseXml(bytes: Buffer): Xml {
  let xml: string;
  try {
    const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
    xml = new TextDecoder(utf16, { fatal: true }).decode(bytes).replace(/\r\n?/g, "\n");
  } catch { return fail("неверная кодировка XML"); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(xml)) fail("недопустимые символы XML");
  const stack: { node: Xml; q: string; namespaces: Record<string, string> }[] = [];
  let root: Xml | undefined, nodes = 0, cursor = 0;
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(?:[^<>"']|"[^"]*"|'[^']*')*>|[^<]+/gy;
  while (cursor < xml.length) {
    tokens.lastIndex = cursor;
    const match = tokens.exec(xml);
    if (!match) fail("повреждённый XML");
    const token = match[0]; cursor = tokens.lastIndex;
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    const parent = stack[stack.length - 1];
    if (!token.startsWith("<") || token.startsWith("<![CDATA[")) {
      const text = token.startsWith("<![CDATA[") ? token.slice(9, -3) : decode(token);
      if (parent) parent.node.text += text;
      else if (text.trim()) fail("текст вне корня XML");
      continue;
    }
    if (token.startsWith("<!")) fail("DTD и объявления сущностей запрещены");
    if (token.startsWith("</")) {
      if (!parent || token !== `</${parent.q}>` && token.replace(/\s+>$/, ">") !== `</${parent.q}>`) fail("несогласованные XML-теги");
      stack.pop(); continue;
    }
    const open = /^<([A-Za-z_][\w.:-]*)([\s\S]*?)(\/?)>$/.exec(token);
    if (!open) fail("неверный XML-тег");
    const namespaces = { ...(parent?.namespaces ?? { xml: "http://www.w3.org/XML/1998/namespace" }) };
    const attrs: Record<string, string> = Object.create(null), raw: [string, string][] = [];
    let rest = open[2];
    while (rest.trim()) {
      const a = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*("[^"<]*"|'[^'<]*')/.exec(rest);
      if (!a || raw.some(([key]) => key === a[1])) fail("неверный или повторный XML-атрибут");
      raw.push([a[1], decode(a[2].slice(1, -1))]); rest = rest.slice(a[0].length);
    }
    for (const [key, value] of raw) if (key === "xmlns") namespaces[""] = value; else if (key.startsWith("xmlns:")) namespaces[key.slice(6)] = value;
    const expanded = (q: string, attribute = false): [string, string] => {
      const pieces = q.split(":");
      if (pieces.length > 2 || pieces.some(p => !p)) fail("неверное имя XML");
      const ns = pieces.length === 2 ? namespaces[pieces[0]] : attribute ? "" : namespaces[""] ?? "";
      if (ns === undefined) fail("необъявленный XML namespace");
      return [canonical(ns), pieces[pieces.length - 1]];
    };
    for (const [key, value] of raw) {
      if (key === "xmlns" || key.startsWith("xmlns:")) continue;
      const [ns, name] = expanded(key, true), attr = ns ? `{${ns}}${name}` : name;
      if (Object.hasOwn(attrs, attr)) fail("повторный XML-атрибут");
      attrs[attr] = value;
    }
    const [ns, name] = expanded(open[1]), node: Xml = { name, ns, attrs, children: [], text: "" };
    if (++nodes > 300000 || stack.length > 128) fail("превышен лимит сложности XML");
    if (parent) parent.node.children.push(node); else { if (root) fail("несколько корней XML"); root = node; }
    if (!open[3]) stack.push({ node, q: open[1], namespaces });
  }
  if (!root || stack.length) fail("незавершённый XML");
  return root;
}
function children(node: Xml, ns: string, name: string): Xml[] { return node.children.filter(n => n.ns === ns && n.name === name); }
function all(node: Xml, ns: string, name: string): Xml[] { return [...(node.ns === ns && node.name === name ? [node] : []), ...node.children.flatMap(n => all(n, ns, name))]; }
function part(files: Map<string, Buffer>, path: string, ns: string, name: string): Xml {
  const bytes = files.get(path);
  if (!bytes) return fail(`отсутствует часть ${path}`);
  const root = parseXml(bytes);
  if (root.ns !== ns || root.name !== name) fail(`неверный корень ${path}`);
  return root;
}
interface Rel { id: string; type: string; target: string }
function relationships(files: Map<string, Buffer>, source: string): Rel[] {
  const path = posix.join(posix.dirname(source), "_rels", posix.basename(source) + ".rels");
  if (!files.has(path)) return [];
  const root = part(files, path, PKG, "Relationships"), ids = new Set<string>();
  return children(root, PKG, "Relationship").flatMap(n => {
    const { Id: id, Type: type, Target: raw, TargetMode: mode } = n.attrs;
    if (!id || !type || !raw || ids.has(id)) return fail(`неверная связь ${path}`);
    ids.add(id);
    if (mode === "External") return [];
    if (mode && mode !== "Internal" || /[\\?#]/.test(raw)) return fail(`неподдерживаемая цель связи ${path}`);
    let decoded: string;
    try { decoded = decodeURIComponent(raw); } catch { return fail("неверный URI связи"); }
    const target = posix.normalize(decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(source), decoded));
    if (target.startsWith("../") || target.includes("\\") || !files.has(target)) return fail(`отсутствующая или недопустимая цель ${target}`);
    return [{ id, type: canonical(type), target }];
  });
}
function linked(rels: Rel[], id: string, type: string): string {
  return rels.find(r => r.id === id && r.type === `${R}/${type}`)?.target ?? fail(`не найдена связь ${type}: ${id}`);
}
function mainPart(files: Map<string, Buffer>, ns: string, name: string): { path: string; root: Xml } {
  part(files, "[Content_Types].xml", CT, "Types");
  const main = relationships(files, "").filter(r => r.type === `${R}/officeDocument`);
  if (main.length !== 1) fail("неоднозначная главная часть Office");
  return { path: main[0].target, root: part(files, main[0].target, ns, name) };
}

export interface BOfficeCell { ref: string; type: string; value: BCell | boolean; formula?: string }
export interface BXlsxInspection {
  worksheets: { name: string; path: string; cells: BOfficeCell[] }[];
  cells: number;
  /** Только содержимое частей, без заключения о правильности сводных таблиц. */
  pivots: { path: string; name: string | null; cacheId: string | null; ref: string | null }[];
  chartTypes: string[];
}
/** Факты о книге; наличие сводной таблицы не проверяет её данные и вычисления. */
export function inspectBXlsx(buf: Buffer): BXlsxInspection {
  const files = readOffice(buf), { path, root } = mainPart(files, S, "workbook"), rels = relationships(files, path);
  const shared = rels.filter(r => r.type === `${R}/sharedStrings`);
  if (shared.length > 1) fail("несколько sharedStrings");
  const text = (node: Xml) => all(node, S, "t").filter(t => !all(node, S, "rPh").some(ph => all(ph, S, "t").includes(t))).map(n => n.text).join("");
  const strings = shared.length ? children(part(files, shared[0].target, S, "sst"), S, "si").map(text) : [];
  const names = new Set<string>();
  const worksheets = children(root, S, "sheets").flatMap(n => children(n, S, "sheet")).map(sheet => {
    const name = sheet.attrs.name;
    if (!name || names.has(name.toLowerCase())) fail("нет имени листа или повтор имени");
    names.add(name.toLowerCase());
    const target = linked(rels, sheet.attrs[`{${R}}id`], "worksheet"), ws = part(files, target, S, "worksheet");
    const refs = new Set<string>(), cells: BOfficeCell[] = [];
    let previousRow = 0;
    for (const row of children(ws, S, "sheetData").flatMap(n => children(n, S, "row"))) {
      const rn = row.attrs.r === undefined ? previousRow + 1 : Number(row.attrs.r);
      if (!Number.isInteger(rn) || rn <= previousRow || rn > 1048576) fail("неверный номер строки");
      previousRow = rn;
      let column = 0;
      for (const cell of children(row, S, "c")) {
        const ref = cell.attrs.r ?? `${col(column + 1)}${rn}`, parsed = /^([A-Z]{1,3})([1-9]\d*)$/.exec(ref);
        if (!parsed || Number(parsed[2]) !== rn || refs.has(ref)) fail("неверная или повторная ссылка ячейки");
        const cn = [...parsed[1]].reduce((s, c) => s * 26 + c.charCodeAt(0) - 64, 0);
        if (cn > 16384 || cn <= column) fail("неверный порядок или столбец ячеек");
        column = cn; refs.add(ref);
        const values = children(cell, S, "v"), formulas = children(cell, S, "f"), type = cell.attrs.t ?? "n";
        if (values.length > 1 || formulas.length > 1) fail("повтор значения/формулы ячейки");
        const raw = values[0]?.text;
        let value: BOfficeCell["value"] = null;
        if (type === "inlineStr") { const inline = children(cell, S, "is"); if (inline.length !== 1) fail("нет inlineStr"); value = text(inline[0]); }
        else if (raw !== undefined) {
          if (type === "s") { if (!/^\d+$/.test(raw) || Number(raw) >= strings.length) fail("неверный индекс sharedStrings"); value = strings[Number(raw)]; }
          else if (type === "b") { if (!/^[01]$/.test(raw)) fail("неверное логическое значение"); value = raw === "1"; }
          else if (["str", "e", "d"].includes(type)) value = raw;
          else if (type === "n") { if (!raw.trim() || !Number.isFinite(Number(raw))) fail("неверное числовое значение"); value = Number(raw); }
          else fail(`неподдерживаемый тип ячейки ${type}`);
        } else if (!["n", "s", "b", "str", "e", "d"].includes(type)) fail(`неподдерживаемый тип ячейки ${type}`);
        cells.push({ ref, type, value, ...(formulas[0] ? { formula: formulas[0].text } : {}) });
      }
    }
    return { name, path: target, cells };
  });
  const pivots: BXlsxInspection["pivots"] = [], chartTypes: string[] = [];
  const declarations = new Map(children(part(files, "[Content_Types].xml", CT, "Types"), CT, "Override").map(n => [n.attrs.PartName, n.attrs.ContentType]));
  for (const [name, bytes] of files) {
    if (!name.endsWith(".xml")) continue;
    // Тип части берём из XML, а не из номера файла или выбранного префикса.
    const declared = declarations.get(`/${name}`) ?? "";
    if (!/pivotTable|drawingml\.chart\+xml/.test(declared) && !name.includes("pivot") && !name.includes("chart")) continue;
    const node = parseXml(bytes);
    if (node.ns === S && node.name === "pivotTableDefinition") pivots.push({ path: name, name: node.attrs.name ?? null, cacheId: node.attrs.cacheId ?? null, ref: children(node, S, "location")[0]?.attrs.ref ?? null });
    if (node.ns === C && node.name === "chartSpace") for (const plot of all(node, C, "plotArea")) for (const child of plot.children) if (child.ns === C && child.name.endsWith("Chart")) {
      // В OOXML столбцы и горизонтальные полосы имеют общий тег barChart.
      const direction = child.name === "barChart" ? children(child, C, "barDir")[0]?.attrs.val : undefined;
      chartTypes.push(direction === "bar" || direction === "col" ? `${child.name}:${direction}` : child.name);
    }
  }
  return { worksheets, cells: worksheets.reduce((sum, s) => sum + s.cells.length, 0), pivots, chartTypes: [...new Set(chartTypes)].sort() };
}

export interface BPptxInspection {
  slides: { path: string; text: string }[];
  count: number;
  /** null — размер слайда в файле не указан; wide — отношение сторон больше 4:3. */
  wide: boolean | null;
  aspect16by9: boolean | null;
  /** Размеры в EMU из p:sldSz, без подстановки предполагаемых значений. */
  dimensions: { cx: number; cy: number } | null;
  text: string;
}
/** Порядок определяется списком презентации и связями, а не именами slideN.xml. */
export function inspectBPptx(buf: Buffer): BPptxInspection {
  const files = readOffice(buf), { path, root } = mainPart(files, P, "presentation"), rels = relationships(files, path);
  const slides = children(root, P, "sldIdLst").flatMap(n => children(n, P, "sldId")).map(slide => {
    const target = linked(rels, slide.attrs[`{${R}}id`], "slide"), node = part(files, target, P, "sld");
    return { path: target, text: all(node, A, "p").map(p => p.children.map(run => run.name === "br" && run.ns === A ? "\n" : all(run, A, "t").map(t => t.text).join("")).join("")).join("\n") };
  });
  const size = children(root, P, "sldSz")[0];
  let wide: boolean | null = null, aspect16by9: boolean | null = null;
  let dimensions: BPptxInspection["dimensions"] = null;
  if (size) {
    const x = Number(size.attrs.cx), y = Number(size.attrs.cy);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x <= 0 || y <= 0) fail("неверный размер слайда");
    dimensions = { cx: x, cy: y };
    // Целочисленное сравнение без допуска и округления дробного отношения сторон.
    wide = BigInt(x) * BigInt(3) > BigInt(y) * BigInt(4);
    aspect16by9 = BigInt(x) * BigInt(9) === BigInt(y) * BigInt(16);
  }
  return { slides, count: slides.length, wide, aspect16by9, dimensions, text: slides.map(s => s.text).join("\n\n") };
}
