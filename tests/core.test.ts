import { test,expect } from 'bun:test';
import { resolve } from 'node:path';
import { parseDataset,parseAnswers,mockResponse,requestBody,imageData,runOne,summarize,loadDataset,PRICES, type Run } from '../src/core';
const sample={id:'test',image:'x.png',labels:{valid:true,category:'meals'}};
const options={apiKey:'test-secret',threshold:.5,timeoutMs:1000};
const fake=(body:unknown,status=200)=>(async()=>new Response(JSON.stringify(body),{status})) as unknown as typeof fetch;
test('official request shape: top-level data URL, noul and choice criteria map',()=>{
 const body=requestBody('d1','data:image/png;base64,abc');
 expect(body.model).toBe('d1');expect(body.images).toEqual(['data:image/png;base64,abc']);
 expect(body.questions.valid).toEqual({type:'noul',instructions:expect.any(String)});
 expect(body.questions.category.type).toBe('choice');expect(Object.keys(body.questions.category.criteria)).toHaveLength(5);
 expect(body).not.toHaveProperty('messages');expect(body).not.toHaveProperty('labels');
});
test('binary complements and inclusive threshold',()=>{
 const raw=mockResponse('x','d1');raw.answers.valid={type:'noul',noul:.5};const a=parseAnswers(raw);
 expect(a.valid).toEqual({prediction:true,probabilities:{true:.5,false:.5}});
 expect(parseAnswers(raw,.6).valid.prediction).toBe(false);
 expect(Object.keys(a.category.probabilities)).toHaveLength(5);
});
test('reject missing, out-of-range, wrong-type and incomplete distributions',()=>{
 for(const bad of [{},{answers:{}},{answers:{valid:{type:'binary',noul:.9}}}])expect(()=>parseAnswers(bad)).toThrow();
 const raw=mockResponse('x','d1');raw.answers.valid={type:'noul',noul:NaN};expect(()=>parseAnswers(raw)).toThrow();
 const choice=mockResponse('x','d1');choice.answers.category={type:'choice',choice:'meals',confidence:1,probabilities:{meals:1}};expect(()=>parseAnswers(choice)).toThrow();
 const sum=mockResponse('x','d1');(sum.answers.category as any).probabilities.meals=.9;expect(()=>parseAnswers(sum)).toThrow();
});
test('dataset relative paths, unknown labels, booleans and duplicate IDs',()=>{
 expect(parseDataset([sample],'/tmp')[0].image).toBe('/tmp/x.png');
 expect(()=>parseDataset([{...sample,labels:{valid:'true'}}],'/tmp')).toThrow();
 expect(()=>parseDataset([{...sample,labels:{category:'food'}}],'/tmp')).toThrow();
 expect(()=>parseDataset([{...sample,labels:{oops:true}}],'/tmp')).toThrow();
 expect(()=>parseDataset([sample,sample],'/tmp')).toThrow();
 expect(()=>parseDataset([],'/tmp')).toThrow();
});
test('live adapter sends bearer header and computes cost once from aggregate usage',async()=>{
 const raw=mockResponse('test','d1');let captured:any;
 const fetcher=(async(url:any,init:any)=>{captured={url,...init};return Response.json(raw)}) as unknown as typeof fetch;
 const run=await runOne(sample,'d1','data:image/png;base64,x',{...options,fetcher});
 expect(run.ok).toBe(true);expect(captured.url).toBe('https://api.liquid.ai/decisions/v1/systemone');expect(captured.headers.Authorization).toBe('Bearer test-secret');expect(captured.redirect).toBe('error');
 expect(run.costUsd).toBe(5300*PRICES.d1/1e6);expect(run.raw).toEqual(raw);
 expect(JSON.parse(captured.body)).not.toHaveProperty('labels');
});
test('absent usage yields unknown cost, never a free call',async()=>{
 const {usage,...raw}=mockResponse('x','d1');const r=await runOne(sample,'d1','data:',{...options,fetcher:fake(raw)});
 expect(r.ok).toBe(true);expect(r.costUsd).toBeNull();expect(summarize([r],[sample])[0].unknownCostRequests).toBe(1);
});
test('HTTP errors, invalid JSON, abort and network failures produce failed runs without retries',async()=>{
 for(const status of [401,422,429,500]){let calls=0;const r=await runOne(sample,'d1','data:',{...options,fetcher:(async()=>{calls++;return new Response('private provider error',{status})}) as unknown as typeof fetch});expect(r.ok).toBe(false);expect(r.error).toContain(String(status));expect(calls).toBe(1);expect(r.costUsd).toBeNull();}
 for(const fetcher of [(async()=>new Response('not json')),(async()=>{throw new Error('test-secret offline')}),(async()=>{throw new DOMException('Timed out','TimeoutError')})]){
 const r=await runOne(sample,'d1','data:',{...options,fetcher:fetcher as unknown as typeof fetch});expect(r.ok).toBe(false);expect(JSON.stringify(r)).not.toContain('test-secret');}
});
test('malformed answers retain known billable usage',async()=>{
 const r=await runOne(sample,'d1','data:',{...options,fetcher:fake({answers:{},usage:{input_tokens:100}})});expect(r.ok).toBe(false);expect(r.costUsd).toBe(100*.02/1e6);
});
test('accuracy separates missing labels and failed requests; quantiles use nearest rank',()=>{
 const answers=parseAnswers(mockResponse('x','d1'));answers.valid.prediction=true;
 const success:Run={id:'test',model:'d1',ok:true,latencyMs:10,answers,usageInputTokens:100,costUsd:.000002};
 const failed:Run={id:'fail',model:'d1',ok:false,latencyMs:200,usageInputTokens:null,costUsd:null,error:'HTTP 500'};
 const summary=summarize([success,failed,{...success,id:'unlabeled',latencyMs:20}],[sample,{id:'fail',image:'x',labels:{valid:false}},{id:'unlabeled',image:'x',labels:{}}])[0];
 expect(summary.questions.valid).toEqual({labeled:2,scored:1,correct:1,accuracy:1,coverage:.5});expect(summary.questions.policy.accuracy).toBeNull();expect(summary.latencyMs).toEqual({mean:15,p50:10,p95:20});expect(summary.failed).toBe(1);
});
test('sample dataset contains real decodable PNG signatures and varied labels',async()=>{
 const samples=await loadDataset(resolve(import.meta.dir,'../sample/dataset.json'));expect(samples).toHaveLength(6);
 for(const s of samples)expect(await imageData(s.image)).toStartWith('data:image/png;base64,');
 expect(samples.some(s=>s.labels.valid===false)).toBe(true);expect(samples.some(s=>s.labels.readable===false)).toBe(true);expect(samples.some(s=>s.labels.suspicious===true)).toBe(true);
});
test('image signature validation rejects text and missing files',async()=>{
 await expect(imageData(resolve(import.meta.dir,'../package.json'))).rejects.toThrow();await expect(imageData('/not/a/real/image.png')).rejects.toThrow();
});
test('mock predictions do not depend on ground truth',async()=>{
 const a=await runOne(sample,'d1','data:',{...options,mock:true});const b=await runOne({...sample,labels:{valid:false}},'d1','data:',{...options,mock:true});expect(a.answers!).toEqual(b.answers!);expect(a.costUsd).toBe(0);
});
test('CLI mock runs and invalid flags fail',async()=>{
 const cwd=resolve(import.meta.dir,'..');
 const help=await Bun.$`bun src/cli.ts --help`.cwd(cwd).quiet();expect(help.exitCode).toBe(0);
 const invalid=await Bun.$`bun src/cli.ts --mock --threshold 2`.cwd(cwd).quiet().nothrow();expect(invalid.exitCode).toBe(1);
 const run=await Bun.$`bun src/cli.ts sample/images/cafe.png --dataset sample/dataset.json --mock --out /private/tmp/receipt-bench-test-${process.pid}.json`.cwd(cwd).quiet();expect(run.stdout.toString()).toContain('valid:');
 const path=`/private/tmp/receipt-bench-test-${process.pid}.json`;const report=await Bun.file(path).json();expect(report.runs).toHaveLength(1);expect(report.samples).toHaveLength(1);await Bun.file(path).delete();const saved=run.stdout.toString().match(/Saved results: (.+)/)?.[1];if(saved)await Bun.file(saved).delete();
});
