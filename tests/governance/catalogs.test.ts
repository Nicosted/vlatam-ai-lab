import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; import { describe,it } from 'node:test'; import { Ajv2020 as Ajv } from 'ajv/dist/2020.js'; import addFormatsModule from 'ajv-formats';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: Ajv) => void;
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
describe('AI-74 catalogs and audit safety',()=>{
  for(const [name,schemaPath,dataPath] of [['pricing','schemas/ai-pricing.schema.json','config/ai-pricing.json'],['budget','schemas/ai-budget-policies.schema.json','config/ai-budget-policies.json']] as const) it(`${name} catalog validates and rejects invalid units`,()=>{const ajv=new Ajv({allErrors:true});addFormats(ajv);const validate=ajv.compile(load(schemaPath));assert.equal(validate(load(dataPath)),true,JSON.stringify(validate.errors));const bad=structuredClone(load(dataPath)); if(name==='pricing')bad.prices[0].currency='usd';else bad.policies[0].currency='usd';assert.equal(validate(bad),false);});
  it('catalogs contain no credential-shaped fields',()=>{const text=readFileSync('config/ai-pricing.json','utf8')+readFileSync('config/ai-budget-policies.json','utf8');assert.doesNotMatch(text,/api[_-]?key|password|bearer|authorization|secret/i);});
});
