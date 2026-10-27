import { resolve } from 'node:path';
import { appPaths } from './paths';
import { saveResult,listResults,readResult,selectModel,selectSamples } from './results';
import { loadDataset,imageData,runOne,summarize,MODELS,PRICES, type Model } from './core';
const codeRoot=resolve(import.meta.dir,'..');
const paths=appPaths();
const samples=await loadDataset(paths.dataset);
async function benchmark(apiKey:string,model:Model,selectedSamples=samples,progress=(completed:number,total:number)=>{}){
 const runs=[];
 const images=await Promise.all(selectedSamples.map(sample=>imageData(sample.image)));
 for(let i=0;i<selectedSamples.length;i++){
  runs.push(await runOne(selectedSamples[i],model,images[i],{mock:false,apiKey,threshold:.5,timeoutMs:15000}));
  progress(i+1,selectedSamples.length);
 }
 return {schemaVersion:1,createdAt:new Date().toISOString(),mode:'live',configuration:{models:[model],threshold:.5,timeoutMs:15000,pricesUsdPerMillionInputTokens:PRICES,pricingVerified:'2026-10-27'},samples:selectedSamples,summary:summarize(runs,selectedSamples),runs};
}
const emptyReport={schemaVersion:1,mode:'live',samples,summary:[],runs:[]};
const resultsDirectory=paths.results;let busy=false;
const server=Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT??3000),idleTimeout:255,maxRequestBodySize:8192,async fetch(request){
 const url=new URL(request.url),path=url.pathname;
 // Browser requests must originate on this loopback server; never enable CORS.
 if(url.hostname!=='127.0.0.1'&&url.hostname!=='localhost')return new Response('Invalid host',{status:403});
 if(path==='/api/benchmark'){
  if(request.method!=='POST')return new Response('Use POST',{status:405});
  if(request.headers.get('origin')!==url.origin)return new Response('Invalid origin',{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return new Response('Expected JSON',{status:415});
  if(busy)return new Response('A benchmark is already running',{status:409});
  try{
   const body=await request.json();const key=typeof body.apiKey==='string'&&body.apiKey.trim()?body.apiKey.trim():process.env.LIQUID_API_KEY;
   if(!key||key.length>4096)return new Response('Enter an API key or set LIQUID_API_KEY before starting the server',{status:400});
   const selected=selectSamples(body.sampleIds??(body.sampleId?[body.sampleId]:undefined),samples);
   const model=selectModel(body.model);busy=true;
   const encoder=new TextEncoder();
   const stream=new ReadableStream({async start(controller){
    const send=(event:unknown)=>{try{controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'))}catch{/* Run continues and saves even if the browser disconnects. */}};
    try{
     send({type:'progress',completed:0,total:selected.length});
     const report=await benchmark(key,model,selected,(completed,total)=>send({type:'progress',completed,total}));
     const file=await saveResult(resultsDirectory,model,report);
     send({type:'complete',report,file});
    }catch{send({type:'error',message:'Could not complete or save this run. Check the local server.'})}
    finally{busy=false;try{controller.close()}catch{}}
   }});
   return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'}});
  }catch(e){return new Response(e instanceof Error?e.message:'Benchmark request failed',{status:400});}

 }
 if(request.method!=='GET')return new Response('Use GET',{status:405});
 if(path==='/api/receipts')return Response.json(emptyReport);
 if(path==='/api/results')return Response.json(await listResults(resultsDirectory));
 if(path.startsWith('/api/results/')){try{return Response.json(await readResult(resultsDirectory,decodeURIComponent(path.slice('/api/results/'.length))))}catch{return new Response('Results file not found',{status:404})}}
 if(path==='/api/config')return Response.json({environmentKeyConfigured:Boolean(process.env.LIQUID_API_KEY)});
 if(path.startsWith('/sample/')){const sample=samples.find(s=>`/sample/${s.id}`===path);if(sample)return new Response(Bun.file(sample.image));}
 if(path==='/'||path==='/index.html')return new Response(Bun.file(resolve(codeRoot,'demo/index.html')));
 return new Response('Not found',{status:404});
}});
console.log(`Liquid AI Receipt Lab demo: ${server.url}`);

console.log(`Dataset: ${paths.dataset}\nResults: ${paths.results}`);
