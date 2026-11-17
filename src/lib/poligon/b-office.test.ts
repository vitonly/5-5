import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBDataset } from "./b-dataset";
import { buildBDatasetXlsx, inspectBPptx, inspectBXlsx } from "./b-office";

/** Независимый ZIP без сжатия для нестандартных имён частей и повреждений. */
function fixture(parts: Record<string, string>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(parts)) {
    const n = Buffer.from(name), data = Buffer.from(value);
    let crc = 0xffffffff;
    for (const b of data) { crc ^= b; for (let j = 0; j < 8; j++) crc = crc >>> 1 ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const h = Buffer.alloc(30), c = Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    local.push(h, n, data); central.push(c, n); offset += h.length + n.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(parts).length, 8); end.writeUInt16LE(Object.keys(parts).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const s = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const p = "http://schemas.openxmlformats.org/presentationml/2006/main";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const rels = (rows: [string, string, string][]) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rows.map(([id, type, target]) => `<Relationship Id="${id}" Type="${r}/${type}" Target="${target}"/>`).join("")}</Relationships>`;
const base = (target: string) => ({ "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', "_rels/.rels": rels([["main", "officeDocument", target]]) });
function workbook(): Record<string, string> {
  return { ...base("xl/workbook.xml"),
    "xl/workbook.xml": `<q:workbook xmlns:q="${s}" xmlns:z="${r}"><q:sheets><q:sheet name="Факты &amp; данные" sheetId="1" z:id="ws"/></q:sheets></q:workbook>`,
    "xl/_rels/workbook.xml.rels": rels([["ws", "worksheet", "worksheets/custom.xml"], ["ss", "sharedStrings", "sharedStrings.xml"]]),
    "xl/sharedStrings.xml": `<sst xmlns="${s}"><si><r><t>А&amp;</t></r><r><t>Б&#x1F600;</t></r></si></sst>`,
    "xl/worksheets/custom.xml": `<worksheet xmlns="${s}"><sheetData><row r="3"><c r="C3" t="s"><v>0</v></c><c r="F3" t="inlineStr"><is><r><t xml:space="preserve"> x </t></r><r><t>y</t></r></is></c><c r="G3"><f>1+2</f><v>3</v></c><c r="H3"/><c r="I3" t="e"><v>#N/A</v></c></row></sheetData></worksheet>`,
    "xl/pivotTables/one.xml": `<pivotTableDefinition xmlns="${s}" name="Сводная" cacheId="999"><location ref="B4:D9"/></pivotTableDefinition>`,
    "xl/charts/one.xml": '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart/><c:lineChart/></c:plotArea></c:chart></c:chartSpace>',
  };
}

test("столбцы и горизонтальные полосы различаются внутри общего barChart", () => {
  const parts = workbook();
  parts["xl/charts/chart1.xml"] = '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:barDir val="bar"/></c:barChart><c:barChart><c:barDir val="col"/></c:barChart></c:plotArea></c:chart></c:chartSpace>';
  assert.deepEqual(inspectBXlsx(fixture(parts)).chartTypes.filter(t => t.startsWith("barChart:")), ["barChart:bar", "barChart:col"]);
});

test("детерминированные варианты, ключи и доказательства очистки согласованы", () => {
  const variants = new Set<string>();
  for (let seed = 0; seed < 50; seed++) {
    const d = makeBDataset(`seed-${seed}`);
    assert.deepEqual(d, makeBDataset(`seed-${seed}`));
    variants.add(JSON.stringify([d.teams, d.matches, d.viewers, d.rawSheets]));
    assert.equal(d.totals.players, d.teams.flatMap(t => t.roster).length);
    assert.equal(d.totals.incidents, d.incidents.length);
    assert.equal(d.totals.networkMinutes, d.incidents.reduce((n, i) => n + (i.type === "Сеть" ? i.duration ?? 0 : 0), 0));
    assert.deepEqual(d.totals.top5, [...d.matches].sort((a, b) => b.duration - a.duration || (a.id < b.id ? -1 : 1)).slice(0, 5).map(m => m.id));
    assert.equal(Object.values(d.totals.byHour).reduce((a, b) => a + b), d.matches.length);
    assert.equal(Object.values(d.totals.byIncident).reduce((a, b) => a + b), d.incidents.length);
    assert.equal(Object.values(d.totals.byPlatform).reduce((a, b) => a + b), d.viewers.reduce((n, v) => n + v.viewers, 0));
    for (const m of d.matches) { assert.ok(d.teams.some(t => t.id === m.team1)); assert.ok(d.teams.some(t => t.id === m.team2)); assert.notEqual(m.team1, m.team2); }
    for (const i of d.incidents) assert.ok(d.matches.some(m => m.id === i.matchId));
    assert.equal(d.incidents[0].duration, null);
    assert.equal(new Set(d.viewers.map(v => `${v.matchId}/${v.platform}`)).size, d.viewers.length);
    assert.equal(d.matches[0].duration, d.matches[1].duration);
    assert.notEqual(d.matches[0].time, d.matches[1].time);
    assert.deepEqual(d.cleaningCases.map(c => c.id), ["exact", "other-id", "similar", "platforms", "missing-duration", "format"]);
    const exact = d.cleaningCases[0]; assert.equal(exact.fields.length, 6); assert.deepEqual(exact.before[1], exact.before[2]);
    const registry = d.rawSheets["Составы команд"].slice(1), primary = d.teams[1];
    assert.deepEqual(registry.filter(x => x[1] === "T99").map(x => x[2]), primary.roster.map(x => x.id));
    assert.ok(registry.filter(x => x[1] === "T99").every(x => x[4] === primary.id));
    assert.ok(d.cleaningCases[1].before.some(row => row[0] === "Матчи" && row[2] === "T99"));
    assert.ok(d.cleaningCases[1].after.some(row => row[0] === "Матчи" && row[2] === primary.id));
    for (const c of d.cleaningCases) for (const table of [c.before, c.after]) assert.ok(table.every(row => row.length === table[0].length));
  }
  assert.equal(variants.size, 50);
});

test("XLSX воспроизводим и содержит грязные строки, числа, пустые длительности", () => {
  const seed = "Пример 😀", file = buildBDatasetXlsx(seed), d = makeBDataset(seed);
  assert.deepEqual(file, buildBDatasetXlsx(seed));
  const report = inspectBXlsx(file);
  assert.deepEqual(report.worksheets.map(s => s.name), Object.keys(d.rawSheets));
  for (const sheet of report.worksheets) {
    const rows = d.rawSheets[sheet.name as keyof typeof d.rawSheets];
    assert.deepEqual(sheet.cells.map(c => c.value), rows.flat());
  }
  assert.deepEqual(report.pivots, []); assert.deepEqual(report.chartTypes, []);
});

test("сводная учитывается только при связи лист → объект → кэш книги; график — через рисунок листа", () => {
  const parts = workbook();
  parts["xl/workbook.xml"] = parts["xl/workbook.xml"].replace("</q:workbook>", '<q:pivotCaches><q:pivotCache cacheId="999" z:id="cache"/></q:pivotCaches></q:workbook>');
  parts["xl/_rels/workbook.xml.rels"] = rels([["ws", "worksheet", "worksheets/custom.xml"], ["ss", "sharedStrings", "sharedStrings.xml"], ["cache", "pivotCacheDefinition", "pivotCache/one.xml"]]);
  parts["xl/pivotCache/one.xml"] = `<pivotCacheDefinition xmlns="${s}"><cacheSource type="worksheet"><worksheetSource ref="A1:D5" sheet="Факты &amp; данные"/></cacheSource></pivotCacheDefinition>`;
  parts["xl/worksheets/custom.xml"] = parts["xl/worksheets/custom.xml"].replace("</worksheet>", `<pivotTableParts count="1"><pivotTablePart xmlns:r="${r}" r:id="pv"/></pivotTableParts><drawing xmlns:r="${r}" r:id="drawing"/></worksheet>`);
  parts["xl/worksheets/_rels/custom.xml.rels"] = rels([["pv", "pivotTable", "../pivotTables/one.xml"], ["drawing", "drawing", "../drawings/one.xml"]]);
  parts["xl/drawings/one.xml"] = `<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${r}"><c:chart r:id="chart"/></wsDr>`;
  parts["xl/drawings/_rels/one.xml.rels"] = rels([["chart", "chart", "../charts/one.xml"]]);
  const found = inspectBXlsx(fixture(parts));
  assert.equal(found.attachedPivotCount, 1);
  assert.deepEqual(found.attachedChartTypes, ["barChart", "lineChart"]);
  parts["xl/workbook.xml"] = parts["xl/workbook.xml"].replace(/<q:pivotCaches>.*?<\/q:pivotCaches>/, "");
  assert.equal(inspectBXlsx(fixture(parts)).attachedPivotCount, 0);
});

test("namespace URI, разреженные ссылки, shared/inline, формулы и факты сводных", () => {
  const report = inspectBXlsx(fixture(workbook()));
  assert.deepEqual(report.worksheets[0].cells.map(c => [c.ref, c.value]), [["C3", "А&Б😀"], ["F3", " x y"], ["G3", 3], ["H3", null], ["I3", "#N/A"]]);
  assert.equal(report.worksheets[0].cells[2].formula, "1+2");
  assert.deepEqual(report.pivots, [{ path: "xl/pivotTables/one.xml", name: "Сводная", cacheId: "999", ref: "B4:D9" }]);
  assert.deepEqual(report.chartTypes, ["barChart", "lineChart"]);
  assert.equal(report.attachedPivotCount, 0, "неподключённая XML-часть не доказывает наличие сводной на листе");
  assert.deepEqual(report.attachedChartTypes, []);
  assert.equal("correct" in report, false);
  const strict = Object.fromEntries(Object.entries(workbook()).map(([key, xml]) => [key, xml.replaceAll(s, "http://purl.oclc.org/ooxml/spreadsheetml/main").replaceAll(r, "http://purl.oclc.org/ooxml/officeDocument/relationships")]));
  assert.equal(inspectBXlsx(fixture(strict)).cells, 5);
  const arbitraryNames = workbook();
  arbitraryNames["xl/objects/fact.xml"] = arbitraryNames["xl/pivotTables/one.xml"];
  delete arbitraryNames["xl/pivotTables/one.xml"];
  arbitraryNames["[Content_Types].xml"] = arbitraryNames["[Content_Types].xml"].replace("/>", '><Override PartName="/xl/objects/fact.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/></Types>');
  assert.equal(inspectBXlsx(fixture(arbitraryNames)).pivots[0].path, "xl/objects/fact.xml");
});

test("XML с > в атрибуте и ZIP с сигнатурой EOCD в комментарии", () => {
  const parts = workbook();
  parts["xl/workbook.xml"] = parts["xl/workbook.xml"].replace("Факты &amp; данные", "Факты > данные");
  const file = fixture(parts), comment = Buffer.alloc(30);
  comment.writeUInt32LE(0x06054b50);
  file.writeUInt16LE(comment.length, file.length - 2);
  assert.equal(inspectBXlsx(Buffer.concat([file, comment])).worksheets[0].name, "Факты > данные");
});

test("PPTX читает порядок связей, rich text и фактический размер", () => {
  const parts = { ...base("ppt/presentation.xml"),
    "ppt/presentation.xml": `<x:presentation xmlns:x="${p}" xmlns:r="${r}"><x:sldIdLst><x:sldId id="256" r:id="second"/><x:sldId id="257" r:id="first"/></x:sldIdLst><x:sldSz cx="12192000" cy="6858000"/></x:presentation>`,
    "ppt/_rels/presentation.xml.rels": rels([["first", "slide", "slides/slide1.xml"], ["second", "slide", "slides/slide20.xml"]]),
    "ppt/slides/slide1.xml": `<sld xmlns="${p}" xmlns:a="${a}"><a:p><a:r><a:t>Первый</a:t></a:r></a:p></sld>`,
    "ppt/slides/slide20.xml": `<z:sld xmlns:z="${p}" xmlns:q="${a}"><q:p><q:r><q:t>Б &amp; </q:t></q:r><q:r><q:t>В</q:t></q:r><q:br/><q:r><q:t>Г</q:t></q:r></q:p></z:sld>`,
  };
  const report = inspectBPptx(fixture(parts));
  assert.equal(report.count, 2); assert.equal(report.wide, true); assert.equal(report.text, "Б & В\nГ\n\nПервый");
  assert.equal(report.aspect16by9, true);
  assert.deepEqual(report.dimensions, { cx: 12192000, cy: 6858000 });
  const original = parts["ppt/presentation.xml"];
  for (const [cx, cy, expectedWide] of [[1600, 1000, true], [1600, 901, true], [1200, 900, false]]) {
    parts["ppt/presentation.xml"] = original.replace('cx="12192000" cy="6858000"', `cx="${cx}" cy="${cy}"`);
    const other = inspectBPptx(fixture(parts));
    assert.equal(other.aspect16by9, false); assert.equal(other.wide, expectedWide);
  }
  parts["ppt/presentation.xml"] = original;
  parts["ppt/presentation.xml"] = parts["ppt/presentation.xml"].replace('<x:sldSz cx="12192000" cy="6858000"/>', "");
  const noSize = inspectBPptx(fixture(parts));
  assert.equal(noSize.wide, null); assert.equal(noSize.aspect16by9, null); assert.equal(noSize.dimensions, null);
});

test("повреждения ZIP/XML, лимиты и отсутствующие связи дают явные ошибки", () => {
  const file = buildBDatasetXlsx("bad");
  for (const length of [0, 15, file.length - 1]) assert.throws(() => inspectBXlsx(file.subarray(0, length)), /Office:/);
  const badCrc = Buffer.from(fixture(workbook())); badCrc[60] ^= 1;
  assert.throws(() => inspectBXlsx(badCrc), /Office:/);
  const outOfBounds = Buffer.from(file); outOfBounds.writeUInt32LE(0xfffffff0, file.length - 6);
  assert.throws(() => inspectBXlsx(outOfBounds), /Office:/);
  const oversized = Buffer.from(file), central = oversized.readUInt32LE(file.length - 6);
  oversized.writeUInt32LE(31 * 1024 * 1024, central + 24); oversized.writeUInt32LE(31 * 1024 * 1024, 22);
  assert.throws(() => inspectBXlsx(oversized), /лимит/);
  for (const xml of [`<worksheet xmlns="${s}"><sheetData></worksheet>`, `<!DOCTYPE x [<!ENTITY a "x">]><worksheet xmlns="${s}"/>`, `<worksheet xmlns="${s}"><sheetData><row r="1"><c r="A1" t="s"><v>99</v></c></row></sheetData></worksheet>`, `<x:worksheet/>`]) {
    const parts = workbook(); parts["xl/worksheets/custom.xml"] = xml;
    assert.throws(() => inspectBXlsx(fixture(parts)), /Office:/);
  }
  const missing = workbook(); delete missing["xl/worksheets/custom.xml"];
  assert.throws(() => inspectBXlsx(fixture(missing)), /цель/);
});
