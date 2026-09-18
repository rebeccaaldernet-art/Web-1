import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import Papa from 'papaparse';import ExcelJS from 'exceljs';
const ctx={onmessage:null,TextEncoder,TextDecoder,ExcelJS,Papa,importScripts(){},postMessage(v){ctx.result=v}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/lake/file-worker.js','utf8'),ctx);
const run=async data=>{ctx.result=null;await ctx.onmessage({data});return ctx.result};
const bytes=new TextEncoder().encode('Name,Quantity\n"Painting, blue",12\nOther,0').buffer;let r=await run({action:'import',name:'sample.csv',bytes});assert.equal(r.sheets[0].data.rows[0][0],'Painting, blue');assert.equal(r.sheets[0].data.rows[1][1],'0');
const data={columns:['Name','Quantity'],rows:[['Painting',12],['Other',0]]};r=await run({action:'export',kind:'xlsx',dataset:data});assert.ok(r.bytes);r=await run({action:'import',name:'sample.xlsx',bytes:r.bytes,sheetIndex:0});assert.equal(r.sheets[0].data.rows[0][1],12);assert.equal(r.sheets[0].data.rows[1][1],0);
const csv='A,B,C,D,E\n'+('1,2,3,4,5\n'.repeat(40000));r=await run({action:'import',name:'large.csv',bytes:new TextEncoder().encode(csv).buffer});assert.equal(r.sheets[0].data.rows.length,40000);
r=await run({action:'import',name:'too-large.csv',bytes:new TextEncoder().encode('A\n'+('1\n'.repeat(50001))).buffer});assert.match(r.error,/50,000/);
r=await run({action:'export',kind:'csv',dataset:{columns:['name'],rows:[['=cmd()']]}});assert.match(r.text,/'=cmd/);
const source=fs.readFileSync('app/data-lake.tsx','utf8');assert.ok(source.includes('slice(rowStart,rowStart+25)'));assert.ok(source.includes('slice(columnStart,columnStart+10)'));assert.ok(!source.includes("import('exceljs')"));console.log('PASS CSV quoted values, Excel roundtrip, 200,000-cell import, oversize rejection, safe CSV export, bounded 250-cell editor and worker-only file processing.');

const book=new ExcelJS.Workbook();const summary=book.addWorksheet('Summary');summary.addRow(['Name','Quantity']);summary.addRow(['Art',1]);summary.getCell('ZZ60000').font={bold:true};const large=book.addWorksheet('Large');large.addRow(['A','B','C','D','E','F']);for(let i=0;i<45000;i++)large.addRow([1,2,3,4,5,6]);const invalid=book.addWorksheet('Too wide');invalid.getCell('CW1').value='Real data';const workbookBytes=await book.xlsx.writeBuffer();
r=await run({action:'import',name:'multi.xlsx',bytes:workbookBytes});assert.equal(r.worksheets.length,3);assert.equal(r.sheets,undefined);
r=await run({action:'import',name:'multi.xlsx',bytes:workbookBytes,sheetIndex:0});assert.equal(r.sheets[0].data.rows.length,1);assert.equal(r.sheets[0].data.columns.length,2);
r=await run({action:'import',name:'multi.xlsx',bytes:workbookBytes,sheetIndex:1});assert.equal(r.sheets[0].data.rows.length,45000);
r=await run({action:'import',name:'multi.xlsx',bytes:workbookBytes,sheetIndex:2});assert.match(r.error,/column 100/);
console.log('PASS worksheet selection, formatting-only cells ignored, 270,000-cell sheet, independent sheet limits.');
