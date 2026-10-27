import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MODELS, assert, type Model, type Sample } from './core';
export function selectModel(value:unknown):Model {
 assert(typeof value==='string'&&MODELS.includes(value as Model),'Choose one model: d1 or d1-ultra');
 return value as Model;
}
export function resultFilename(model:Model){return `${new Date().toISOString().replace(/[:.]/g,'-')}_${model}_${randomUUID()}.json`;}
export function safeFilename(value:string){assert(/^[0-9TZ-]+_d1(?:-ultra)?_[0-9a-f-]{36}\.json$/.test(value),'Invalid results filename');return value;}
export async function saveResult(directory:string,model:Model,report:unknown){
 await mkdir(directory,{recursive:true});const file=resultFilename(model);
 await writeFile(resolve(directory,file),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return file;
}
export async function readResult(directory:string,file:string){
 const data=JSON.parse(await readFile(resolve(directory,safeFilename(file)),'utf8'));
 assert(data.mode==='live','Only live results can be presented');return data;
}
export async function listResults(directory:string){
 let files:string[];try{files=await readdir(directory)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
 const results=[];
 for(const file of files.sort().reverse()){
  try{safeFilename(file);const data=await readResult(directory,file);results.push({file,createdAt:data.createdAt,model:data.configuration?.models?.[0],receipts:data.samples?.length??0,requests:data.runs?.length??0,failed:data.runs?.filter((r:any)=>!r.ok).length??0});}catch{/* Ignore unrelated or incomplete files. */}
 }
 return results;
}

export function selectSamples(value:unknown,samples:Sample[]):Sample[]{
 assert(Array.isArray(value)&&value.length>0,'Select at least one receipt');
 assert(value.every(id=>typeof id==='string')&&new Set(value).size===value.length,'Receipt IDs must be unique strings');
 const lookup=new Map(samples.map(s=>[s.id,s]));
 return value.map(id=>{const sample=lookup.get(id);assert(sample,`Unknown receipt: ${id}`);return sample;});
}
