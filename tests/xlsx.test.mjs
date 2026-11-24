import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { createWorkbook } from '../src/xlsx.ts';

test('gera XLSX com horas numéricas e entradas de texto literais', () => {
  const files = unzipSync(createWorkbook([['Descrição', 'Horas'], ['=1+1 & <teste>', 1.25]]));
  assert.deepEqual(Object.keys(files).sort(), [
    '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
  ]);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /=1\+1 &amp; &lt;teste&gt;/);
  assert.doesNotMatch(sheet, /<f[ >]/);
  assert.match(sheet, /<c r="B2"><v>1\.25<\/v><\/c>/);
  assert.match(sheet, /autoFilter ref="A1:B2"/);
});
