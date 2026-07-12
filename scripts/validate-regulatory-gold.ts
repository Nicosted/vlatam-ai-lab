import { loadRegulatoryGoldSuite, regulatoryGoldSuiteHash } from '../src/evaluation/index.js';
const path=process.argv[2]??'snapshots/evaluation/regulatory-gold-ar-es-eu-v1.json';
const suite=loadRegulatoryGoldSuite(path);
console.log(JSON.stringify({suite_id:suite.suite_id,version:suite.version,cases:suite.cases.length,hash:regulatoryGoldSuiteHash(suite)}));
