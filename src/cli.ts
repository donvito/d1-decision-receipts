#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { appPaths } from './paths';
import { selectModel,saveResult } from './results';
import { MODELS, PRICES, assert, loadDataset, imageData, runOne, summarize, type Model, type Run } from './core';
export async function main(args:string[]){
 const paths=appPaths();
 const {values,positionals}=parseArgs({args,allowPositionals:true,options:{dataset:{type:'string',default:paths.dataset},model:{type:'string',default:'d1'},models:{type:'string'},out:{type:'string'},mock:{type:'boolean',default:false},threshold:{type:'string',default:'0.5'},'timeout-ms':{type:'string',default:'30000'},help:{type:'boolean',short:'h'}}});
 if(values.help){console.log(`Liquid receipt benchmark\n\nbun run bench [image.png ...] [--dataset labels.json] [--model d1|d1-ultra]\n  --mock               Offline simulated probabilities; no API calls\n  --out results.json   Optional additional copy; each run saves results/<unique>.json\n  --threshold 0.5      Binary decision threshold, inclusive\n  --timeout-ms 30000   Timeout per request; no automatic retries\n\nPaths in the dataset resolve relative to the dataset. Positional paths filter\nthe dataset by exact resolved filename. Data and results folders resolve from the launch directory.`);return;}
 const model=selectModel(values.models??values.model);const models=[model];
 const threshold=Number(values.threshold),timeoutMs=Number(values['timeout-ms']);
 assert(Number.isFinite(threshold)&&threshold>=0&&threshold<=1,'Threshold must be between 0 and 1');
 assert(Number.isSafeInteger(timeoutMs)&&timeoutMs>0,'Timeout must be a positive integer');
 assert(values.mock||process.env.LIQUID_API_KEY,'Set LIQUID_API_KEY or use --mock');
 let samples=await loadDataset(values.dataset!);
 if(positionals.length){const selected=new Set(positionals.map(p=>resolve(p)));for(const p of selected)assert(samples.some(s=>s.image===p),`No labels found for ${p}`);samples=samples.filter(s=>selected.has(s.image));}
 // Preflight every image before sending anything billable.
 const images=await Promise.all(samples.map(s=>imageData(s.image)));
 const runs:Run[]=[];
 console.error(values.mock?'SIMULATED run — not model performance':'LIVE run — images are sent to Liquid AI');
 for(let i=0;i<samples.length;i++)for(const model of models as Model[]){
  const run=await runOne(samples[i],model,images[i],{mock:values.mock,apiKey:process.env.LIQUID_API_KEY,threshold,timeoutMs});runs.push(run);
  console.error(`${run.id} / ${model}: ${run.ok?`${run.latencyMs.toFixed(1)} ms`:run.error}`);
 }
 const report={schemaVersion:1,createdAt:new Date().toISOString(),mode:values.mock?'simulated':'live',configuration:{models,threshold,timeoutMs,pricesUsdPerMillionInputTokens:PRICES,pricingVerified:'2026-10-27'},samples,summary:summarize(runs,samples),runs};
 const saved=await saveResult(paths.results,model,report);
 if(values.out){await mkdir(dirname(resolve(values.out)),{recursive:true});await Bun.write(values.out,JSON.stringify(report,null,2)+'\n');}
 for(const s of report.summary){console.log(`\n${s.model}: ${s.successful}/${s.requests} requests succeeded, mean ${s.latencyMs.mean?.toFixed(1)??'N/A'} ms, known cost $${s.knownCostUsd.toFixed(8)} (${s.unknownCostRequests} unknown)`);for(const [id,q] of Object.entries(s.questions))console.log(`  ${id}: ${q.correct}/${q.scored}, accuracy ${q.accuracy===null?'N/A':(q.accuracy*100).toFixed(1)+'%'}, coverage ${q.scored}/${q.labeled}`);}
 console.log(`\nSaved results: ${resolve(paths.results,saved)}${values.out?'\nAdditional copy: '+resolve(values.out):''}`);
 if(runs.some(r=>!r.ok))process.exitCode=1;
}
if(import.meta.main)main(Bun.argv.slice(2)).catch(e=>{console.error(`Error: ${e.message}`);process.exitCode=1;});
