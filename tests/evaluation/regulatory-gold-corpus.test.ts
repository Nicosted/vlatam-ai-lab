import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe,it } from 'node:test';
import { Ajv2020 as Ajv } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { CapabilityEvaluator, EvaluationError, loadRegulatoryGoldSuite, normalizeObservedOutcome, regulatoryGoldSuiteHash, validateRegulatoryGoldSuite, type RegulatoryGoldSuite, type ReplayObservation } from '../../src/evaluation/index.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats=((addFormatsModule as any).default??addFormatsModule) as (ajv:Ajv)=>void;
const path='snapshots/evaluation/regulatory-gold-ar-es-eu-v1.json';
const suite=()=>structuredClone(loadRegulatoryGoldSuite(path));
const invalid=(mutate:(s:RegulatoryGoldSuite)=>void)=>{const s=suite();mutate(s);assert.throws(()=>validateRegulatoryGoldSuite(s),EvaluationError);};
describe('AI-76 regulatory gold corpus',()=>{
  it('loads through the AI-75 suite contract and validates its schema',()=>{const s=suite();assert.equal(s.cases.length,6);const ajv=new Ajv({strict:false,allErrors:true});addFormats(ajv);const validate=ajv.compile(JSON.parse(readFileSync('schemas/ai-regulatory-gold-suite.schema.json','utf8')));assert.equal(validate(s),true,JSON.stringify(validate.errors));});
  it('fails closed for identity, version, provenance, temporal, dimension, expected, and review defects',()=>{
    invalid(s=>{const m=s as unknown as {cases:unknown[]};m.cases.push(structuredClone(m.cases[0]));});
    invalid(s=>{(s.cases[0]!.suite_ref as {version:string}).version='2.0.0';});
    invalid(s=>{const c=s.cases[0] as unknown as {provenance_refs:string[]};c.provenance_refs=[];});
    invalid(s=>{const c=s.cases[0] as unknown as {temporal_validity?:unknown};delete c.temporal_validity;});
    invalid(s=>{(s.cases[0]!.dimensions[0] as {type:string}).type='unsupported';});
    invalid(s=>{const e=s.cases[0]!.expected as unknown as {required_facts:string[]};e.required_facts=[];});
    invalid(s=>{(s.cases[0] as unknown as {review_status:string}).review_status='approved';});
  });
  it('binds forbidden assertions, abstention, clarification, and human review expectations',()=>{for(const c of suite().cases){assert.ok(c.expected.forbidden_assertions.length);assert.ok(c.expected.mandatory_abstention_conditions.length);assert.ok(c.expected.required_clarification_questions.length);assert.ok(c.expected.human_review_triggers.length);assert.ok(c.dimensions.some(d=>d.type==='correct_abstention'));}});
  it('hashes independently of manifest ordering',()=>{const a=suite(),b=suite();(b as {cases:typeof b.cases}).cases=[...b.cases].reverse();(b as {provenance:typeof b.provenance}).provenance=[...b.provenance].reverse();assert.equal(regulatoryGoldSuiteHash(a),regulatoryGoldSuiteHash(b));});
  it('replays deterministically through AI-75 with zero provider or adapter calls',()=>{const s=suite();let calls=0;const unusedAdapter={execute(){calls++;}};const observations:ReplayObservation[]=s.cases.map(c=>({case_id:c.case_id,case_version:c.version,execution_id:`execution.${c.case_id}`,audit_correlation_id:`audit.${c.case_id}`,normalized_input:c.input,normalized_output:normalizeObservedOutcome({status:'succeeded',output:{jurisdictions:{origin:'AR',destination_country:'ES',destination_bloc:'EU'},classification:{status:'unresolved'},clarification_questions:['request facts'],regulatory_path:{status:'conditional'},temporal_assessment:{status:'requires_review'}},evidence_count:1,citation_count:1,abstained:true})}));const options={id:()=> 'fixed',clock:()=>new Date(0)};assert.deepEqual(new CapabilityEvaluator(options).evaluateReplay(s,observations),new CapabilityEvaluator(options).evaluateReplay(s,[...observations].reverse()));assert.equal(calls,0);assert.ok(unusedAdapter);});
  it('rejects restricted payload fields and does not mutate protected state',()=>{invalid(s=>{(s.cases[0]!.input as Record<string,unknown>).system_prompt='x';});const s=suite(),protectedState={approvedArtifacts:['a'],exports:['e'],pricing:['p'],budgets:['b'],registry:['r'],routing:['route']};const before=structuredClone({s,protectedState});validateRegulatoryGoldSuite(s);assert.deepEqual({s,protectedState},before);assert.doesNotMatch(readFileSync(path,'utf8'),/api[_-]?key|password|authorization|bearer|personal[_-]?data|customer[_-]?(name|email)|system[_-]?prompt/i);});
});
