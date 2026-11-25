import { strToU8, zipSync } from 'fflate';

const sheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const officeRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRel = 'http://schemas.openxmlformats.org/package/2006/relationships';
const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

function columnName(index: number): string {
  let name = '';
  for (let column = index + 1; column > 0; column = Math.floor((column - 1) / 26)) {
    name = String.fromCharCode(65 + (column - 1) % 26) + name;
  }
  return name;
}

function xmlText(value: string): string {
  return Array.from(value).filter(character => {
    const point = character.codePointAt(0) ?? 0;
    return point === 9 || point === 10 || point === 13 || (point >= 32 && !(point >= 0xd800 && point <= 0xdfff) && point !== 0xfffe && point !== 0xffff);
  }).join('').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function createWorkbook(rows: (readonly (string | number)[])[]): Uint8Array<ArrayBuffer> {
  const sheetData = rows.map((row, index) => {
    const rowNumber = index + 1;
    const cells = row.map((value, column) => {
      const reference = columnName(column) + rowNumber;
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"><v>${value}</v></c>`;
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlText(String(value))}</t></is></c>`;
    }).join('');
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');
  const lastColumn = columnName(Math.max(1, rows[0]?.length ?? 1) - 1);
  const parts: Record<string, string> = {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="${contentType}.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="${contentType}.worksheet+xml"/>
    </Types>`,
    '_rels/.rels': `<Relationships xmlns="${packageRel}"><Relationship Id="rId1" Type="${officeRel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${sheetNs}" xmlns:r="${officeRel}"><sheets><sheet name="Horas" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${packageRel}"><Relationship Id="rId1" Type="${officeRel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${sheetNs}">
      <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
      <cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="5" width="28" customWidth="1"/>
      <col min="6" max="6" width="50" customWidth="1"/><col min="7" max="8" width="18" customWidth="1"/></cols>
      <sheetData>${sheetData}</sheetData>
      <autoFilter ref="A1:${lastColumn}${Math.max(rows.length, 1)}"/>
    </worksheet>`,
  };
  const zip = zipSync(Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])));
  return new Uint8Array(zip);
}
