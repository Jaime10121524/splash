const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Testa a implementação real do aplicativo, sem criar uma cópia da máscara.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'phone.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleRef = { exports: {} };
new Function('exports', 'module', compiled)(moduleRef.exports, moduleRef);
const { phoneDigits, maskPhoneBR, editMaskedPhoneBR } = moduleRef.exports;

const examples = [
  ['', ''],
  ['2', '(2'],
  ['21', '(21'],
  ['21999999999', '(21) 99999-9999'],
  ['2133334444', '(21) 3333-4444'],
  ['(21) 99999-9999', '(21) 99999-9999'],
  ['55 (21) 3333-4444', '(21) 3333-4444'],
  ['+55 (21) 99999-9999', '(21) 99999-9999'],
];
for (const [value, expected] of examples) {
  assert.equal(maskPhoneBR(value), expected, 'Falha ao mascarar ' + value);
}
assert.equal(phoneDigits('(21) 99999-9999'), '21999999999');
assert.equal(phoneDigits('+55 (21) 99999-9999'), '21999999999');
assert.equal(editMaskedPhoneBR('', '+55 (21) 99999-9999'), '(21) 99999-9999');
assert.equal(editMaskedPhoneBR('(21) 99999-9999', '(21) 99999-999'), '(21) 9999-9999');
assert.equal(editMaskedPhoneBR('(21) 3333-4444', '(21) 33334444'), '(21) 3333-444');
console.log('OK: máscara DDD, telefone/celular, +55, colagem e exclusão de caracteres.');
