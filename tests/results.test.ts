import { test,expect } from 'bun:test';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { selectModel,saveResult,readResult,listResults } from '../src/results';
import { main } from '../src/cli';
test('one model is required; lists and unknown IDs are rejected',async()=>{
 expect(selectModel('d1')).toBe('d1');expect(selectModel('d1-ultra')).toBe('d1-ultra');
 for(const value of [undefined,'d1,d1-ultra','other',''])expect(()=>selectModel(value)).toThrow();
 await expect(main(['--models','d1,d1-ultra'])).rejects.toThrow('Choose one model');
});
test('each run saves a unique file that reloads; no mixing or overwriting',async()=>{
 const directory=await mkdtemp('/private/tmp/receipt-results-');
 try{
  const base={schemaVersion:1,mode:'live',createdAt:new Date().toISOString(),samples:[{id:'one',image:'x.jpg',labels:{}}],summary:[],runs:[{id:'one',model:'d1',ok:false,error:'HTTP 401'}],configuration:{models:['d1']}};
  const a=await saveResult(directory,'d1',base),b=await saveResult(directory,'d1',{...base,runs:[]});
  expect(a).not.toBe(b);expect((await readResult(directory,a)).runs).toHaveLength(1);expect((await readResult(directory,b)).runs).toHaveLength(0);
  const list=await listResults(directory);expect(list).toHaveLength(2);expect(list.find(x=>x.file===a)?.failed).toBe(1);
  await expect(readResult(directory,'../.env')).rejects.toThrow('Invalid results filename');
  await saveResult(directory,'d1',{...base,mode:'simulated'});expect(await listResults(directory)).toHaveLength(2);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('batch selection preserves order and rejects empty, duplicate or unknown receipts',async()=>{
 const {selectSamples}=await import('../src/results');
 const samples=[{id:'a',image:'a.jpg',labels:{}},{id:'b',image:'b.jpg',labels:{}}];
 expect(selectSamples(['b','a'],samples).map(s=>s.id)).toEqual(['b','a']);
 for(const value of [[],['a','a'],['missing'],'a',null])expect(()=>selectSamples(value,samples)).toThrow();
});

test('data and results resolve from an arbitrary launch directory',async()=>{
 const {appPaths}=await import('../src/paths');
 expect(appPaths('/private/tmp/receipt-data')).toEqual({dataset:'/private/tmp/receipt-data/receipts/dataset.json',results:'/private/tmp/receipt-data/results'});
 expect(appPaths().results).toBe(join(process.cwd(),'results'));
});

test('CLI launched outside the app reads and saves in that working directory',async()=>{
 const {mkdir,writeFile,copyFile,readdir,readFile}=await import('node:fs/promises');
 const directory=await mkdtemp('/private/tmp/receipt-launch-');
 try{
  await mkdir(join(directory,'receipts/images'),{recursive:true});
  await copyFile(join(import.meta.dir,'../sample/images/cafe.png'),join(directory,'receipts/images/new.png'));
  await writeFile(join(directory,'receipts/dataset.json'),JSON.stringify([{id:'new',image:'images/new.png',labels:{}}]));
  const process=Bun.spawn([Bun.which('bun')!,join(import.meta.dir,'../src/cli.ts'),'--mock'],{cwd:directory,stdout:'pipe',stderr:'pipe'});
  const stdout=await new Response(process.stdout).text();await new Response(process.stderr).text();
  expect(await process.exited).toBe(0);expect(stdout).toContain(join(directory,'results'));
  const files=await readdir(join(directory,'results'));expect(files).toHaveLength(1);
  const report=JSON.parse(await readFile(join(directory,'results',files[0]),'utf8'));
  expect(report.samples[0].image).toBe(join(directory,'receipts/images/new.png'));expect(report.runs).toHaveLength(1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
