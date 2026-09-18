import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import Papa from 'papaparse';import ExcelJS from 'exceljs';
const ctx={onmessage:null,TextEncoder,TextDecoder,ExcelJS,Papa,importScripts(){},messages:[],postMessage(v){ctx.messages.push(v)}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/lake/file-worker.js','utf8'),ctx);
const run=async data=>{ctx.messages=[];await ctx.onmessage({data});return ctx.messages.at(-1)};
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));const progress=()=>ctx.messages.filter(m=>m.progress).map(m=>m.progress.name);
// CSV is a one-sheet workbook named after the file.
const bytes=new TextEncoder().encode('Name,Quantity\n"Painting, blue",12\nOther,0').buffer;let r=await run({action:'import',name:'sample.csv',bytes});assert.equal(r.sheets.length,1);assert.equal(r.sheets[0].name,'sample');assert.equal(r.sheets[0].data.rows[0][0],'Painting, blue');assert.equal(r.sheets[0].data.rows[1][1],'0');same(r.failed,[]);
const data={columns:['Name','Quantity'],rows:[['Painting',12],['Other',0]]};r=await run({action:'export',kind:'xlsx',dataset:data});assert.ok(r.bytes);r=await run({action:'import',name:'sample.xlsx',bytes:r.bytes});assert.equal(r.sheets[0].name,'Dataset');assert.equal(r.sheets[0].data.rows[0][1],12);assert.equal(r.sheets[0].data.rows[1][1],0);
const csv='A,B,C,D,E\n'+('1,2,3,4,5\n'.repeat(40000));r=await run({action:'import',name:'large.csv',bytes:new TextEncoder().encode(csv).buffer});assert.equal(r.sheets[0].data.rows.length,40000);
r=await run({action:'import',name:'too-large.csv',bytes:new TextEncoder().encode('A\n'+('1\n'.repeat(50001))).buffer});assert.match(r.error,/50,000/);
r=await run({action:'export',kind:'csv',dataset:{columns:['name'],rows:[['=cmd()']]}});assert.match(r.text,/'=cmd/);
const source=fs.readFileSync('app/data-lake.tsx','utf8');assert.ok(source.includes('slice(rowStart,rowStart+25)'));assert.ok(source.includes('slice(columnStart,columnStart+10)'));assert.ok(!source.includes("import('exceljs')"));console.log('PASS CSV quoted values, Excel roundtrip, 200,000-cell import, oversize rejection, safe CSV export, bounded 250-cell editor and worker-only file processing.');

// A whole workbook: every worksheet in order, types preserved, formatting-only areas ignored, per-sheet failures reported.
const book=new ExcelJS.Workbook();const summary=book.addWorksheet('Summary');summary.addRow(['Name','Quantity','When','Total','Total','Flag']);summary.addRow(['Art',1,new Date(Date.UTC(2026,0,2)),{formula:'B2*2',result:2},'dup',true]);summary.addRow(['Print',null,null,{formula:'B3*2'},'x',false]);summary.getCell('ZZ60000').font={bold:true};
const large=book.addWorksheet('Large');large.addRow(['A','B','C','D','E','F']);for(let i=0;i<45000;i++)large.addRow([1,2,3,4,5,6]);
const invalid=book.addWorksheet('Too wide');invalid.getCell('CW1').value='Real data';
book.addWorksheet('Empty').getCell('B2').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFF0000'}};
const workbookBytes=await book.xlsx.writeBuffer();
r=await run({action:'import',name:'multi.xlsx',bytes:workbookBytes});
same(r.sheets.map(s=>s.name),['Summary','Large']);same(r.failed.map(f=>f.name),['Too wide']);assert.match(r.failed[0].error,/column 100/);same(r.skipped,['Empty']);same(progress(),['Summary','Large','Too wide','Empty']);
const s=r.sheets[0];same(s.data.columns,['Name','Quantity','When','Total','Total (2)','Flag']);assert.equal(s.data.rows[0][2],'2026-01-02T00:00:00.000Z');assert.equal(s.data.rows[0][3],2);assert.equal(s.data.rows[0][5],true);assert.equal(s.data.rows[1][1],null);assert.equal(s.data.rows[1][3],null);assert.ok(s.notes.some(n=>/Duplicate header "Total"/.test(n)));assert.ok(s.notes.some(n=>/formula cell had no saved result/.test(n)));
assert.equal(r.sheets[1].data.rows.length,45000);assert.equal(r.sheets[1].data.columns.length,6);assert.equal(r.totalBytes,r.sheets[0].bytes+r.sheets[1].bytes);
// All current worksheets export as one generated workbook, in order, with Excel-safe unique names.
r=await run({action:'export',kind:'xlsx',sheets:[{name:'Summary',data:JSON.parse(JSON.stringify(s.data))},{name:'Q1/Q2 results: [final]?',data:data},{name:'Q1/Q2 results: [final]?',data:data}]});const out=new ExcelJS.Workbook();await out.xlsx.load(r.bytes);same(out.worksheets.map(w=>w.name),['Summary','Q1 Q2 results   final','Q1 Q2 results   final (2)']);assert.equal(out.worksheets[0].getCell('C2').value,'2026-01-02T00:00:00.000Z');assert.equal(out.worksheets[1].getCell('B2').value,12);
r=await run({action:'import',name:'roundtrip.xlsx',bytes:r.bytes});assert.equal(r.sheets.length,3);same(r.sheets[0].data.columns,s.data.columns);assert.equal(r.sheets[0].data.rows[1][3],null);
const many=new ExcelJS.Workbook();for(let i=0;i<26;i++)many.addWorksheet('S'+i).addRow(['A']);r=await run({action:'import',name:'many.xlsx',bytes:await many.xlsx.writeBuffer()});assert.match(r.error,/at most 25 worksheets/);
const blank=new ExcelJS.Workbook();blank.addWorksheet('Nothing');r=await run({action:'import',name:'blank.xlsx',bytes:await blank.xlsx.writeBuffer()});assert.match(r.error,/No data found/);
console.log('PASS whole-workbook import in order, dates/cached formulas/blanks/booleans, duplicate headers explained, formatting-only cells and empty sheets ignored, 270,000-cell sheet, oversized sheet reported without blocking others, progress messages, multi-sheet Excel export with safe names, roundtrip, and workbook sheet cap.');
