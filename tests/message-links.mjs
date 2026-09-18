import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync('lib/message-links.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {messageLinks}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for(const [body,expected] of [
 ['See https://example.com/page?q=1&x=2.', ['https://example.com/page?q=1&x=2']],
 ['Visit www.example.com or example.ca', ['https://www.example.com/','https://example.ca/']],
 ['(@all) (https://example.com/a_(b))', ['https://example.com/a_(b)']],
 ['Email person@example.com; @all hello', []],
 ['javascript:alert(1) <script>alert(1)</script>', []],
 ['http://localhost:8080/test', ['http://localhost:8080/test']],
 ['https://example.com/@all', ['https://example.com/@all']],
]){const parts=messageLinks(body);assert.equal(parts.map(p=>p.text).join(''),body);assert.deepEqual(parts.filter(p=>p.href).map(p=>p.href),expected)}
console.log('PASS: HTTP/HTTPS, www/bare domains, punctuation, balanced parentheses, exact text preservation, mentions/email and unsafe scheme handling.');
