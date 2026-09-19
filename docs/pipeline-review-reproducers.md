# Pipeline review: reproducible audit fixtures

Baseline: `master` at `7f3ffcd`, reviewed 19 September 2026. Companion to [the review](whole-pipeline-review.md).

These **13 probes assert the faulty behavior observed during the review**. A passing probe confirms the reproduction, not correctness. When fixing a defect, replace its expectations with the intended behavior. The normal suite was also run separately: 1,085 backend and 36 frontend tests passed, as did typechecking.

To reproduce, copy each code block into its named temporary file, then run:

```powershell
npm.cmd run -w backend test -- test/pipeline-audit.temp.test.ts
npm.cmd run -w frontend test -- lib/export/pipeline-audit.temp.test.ts
```

The backend uses in-memory SQLite and mocked inference/retrieval; the frontend mocks data access. No production database, external website, or paid model is used. The repository's test configuration isolates the fetch cache. Remove the two temporary files afterward, or turn the relevant cases into proper regression tests during implementation. They were removed after this audit.

The other seven reproductions in the review used separate Node processes, in-memory SQLite or a fresh temporary cache, and loopback HTTP servers: redirect timing; review correction loss; hosted confirmation model identity; reading deletion on reparse; framework verification; hosted preflight routing; and cross-model inference-cache reuse. Their inputs and observed outputs are recorded in the main review.

## Backend: `backend/test/pipeline-audit.temp.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
const queue = vi.hoisted(() => ({ answers: [] as string[] }));
vi.mock('../src/engines/ollama.js', async (actual) => ({
  ...await actual<Record<string, unknown>>(),
  generate: async () => ({ text: queue.answers.shift() ?? '{"findings":[]}', model:'fixture', promptTokens:1, completionTokens:1, durationMs:1, fromCache:false, fromResume:false }),
}));
vi.mock('../src/read/index.js', async (actual) => ({
  ...await actual<Record<string, unknown>>(),
  readFramework: async (input: {instrumentId:number}, subject:string) => ({instrumentId:input.instrumentId,subject,failure:'framework engine failed',model:'fixture',promptTokens:0,completionTokens:0,durationMs:0}),
}));
vi.mock('../src/shortlist/index.js', async (actual) => ({...await actual<Record<string, unknown>>(), shortlistInstruments:async()=>[]}));
vi.mock('../src/retrieve/index.js', async (actual) => ({
  ...await actual<Record<string, unknown>>(),
  retrieveForIndicator:async (_db:unknown,i:{id:string})=>({indicatorId:i.id,economy:'SGP',queries:['fixture'],depth:24,surfaced:1,indexedSections:1,governing:[],perQueryDepth:40,sections:[{sectionId:1,documentId:1,instrumentId:1,instrumentTitle:'Example Act',headingPath:'1 Example',text:'Example provision',anchor:null,rank:1,channels:['dense'],found:[{channel:'dense',query:'fixture',rank:1,score:0.9}]}]}),
}));
import {openDb} from '../src/db/index.js';
import {openRun,recordPillarAnswer} from '../src/run/index.js';
import {answerPillar} from '../src/cell/index.js';
import {rescoreRun} from '../src/run/rescore.js';
import {readSection} from '../src/read/index.js';
import {loadRubric} from '../src/rubric/index.js';
import {decide,__rules} from '../src/decide/index.js';
import {moneyIn} from '../src/decide/currency.js';
import {questionFor} from '../src/read/question.js';
import {materialise} from '../src/discover/index.js';
import {loadProfile} from '../src/profile/index.js';
import {otherLanguageCopies} from '../src/retrieve/index.js';

function tinyStore() {
  const db=openDb(':memory:');
  db.exec(`INSERT INTO economy(code,name,official_languages) VALUES('SGP','Singapore','["en"]');
    INSERT INTO instrument(id,economy_code,title,kind,status,source_url,discovered_via,discovered_at) VALUES(1,'SGP','Example Act','act','in-force','https://sso.agc.gov.sg/example','portal','2026-09-19');
    INSERT INTO document(id,instrument_id,url,content_hash,media_type,bytes,http_status,fetched_at) VALUES(1,1,'https://sso.agc.gov.sg/example','hash','text/html',17,200,'2026-09-19');
    INSERT INTO document_text(document_id,text,parser,parsed_at) VALUES(1,'Example provision','fixture','2026-09-19');
    INSERT INTO section(id,document_id,ordinal,heading_path,label,text,char_start,char_end) VALUES(1,1,1,'1 Example','1','Example provision',0,17);`);
  return db;
}

describe('isolated audit probes: asserts observed defects, not desired behavior',()=>{
  it('real pillar flow converts failed framework reads into an absence on rescore',async()=>{
    const db=openDb(':memory:');
    db.exec(`INSERT INTO economy(code,name,official_languages) VALUES('SGP','Singapore','["en"]');
      INSERT INTO instrument(id,economy_code,title,kind,status,source_url,discovered_via,discovered_at) VALUES(1,'SGP','Example Act','act','in-force','https://sso.agc.gov.sg/example','portal','2026-09-19');
      INSERT INTO document(id,instrument_id,url,content_hash,media_type,bytes,http_status,fetched_at) VALUES(1,1,'https://sso.agc.gov.sg/example','hash','text/html',17,200,'2026-09-19');
      INSERT INTO document_text(document_id,text,parser,parsed_at) VALUES(1,'Example provision','fixture','2026-09-19');
      INSERT INTO section(id,document_id,ordinal,heading_path,label,text,char_start,char_end) VALUES(1,1,1,'1 Example','1','Example provision',0,17);`);
    const run=openRun(db,{economies:['SGP'],pillars:[7],model:'fixture'});
    const answer=await answerPillar(db,7,'SGP',{vectors:{ids:new Int32Array(),matrix:new Float32Array(),dims:0}});
    expect(answer.decisions.find(d=>d.indicatorId==='7.1')?.state).toBe('unresolved');
    recordPillarAnswer(run,answer);
    expect(db.prepare('SELECT count(*) n FROM framework_reading').get()).toEqual({n:0});
    rescoreRun(db,run.id);
    const after=db.prepare("SELECT state,score FROM cell JOIN cell_answer ON cell_id=cell.id WHERE indicator_id='7.1'").get();
    console.log('framework failure after real pillar/record/rescore',after);
    expect(after).toEqual({state:'no-restriction',score:1});
    db.close();
  });
  it('malformed finding remains a successful empty reading that can clear a cell',async()=>{
    queue.answers.push('{"findings":[{"note":"see the schedule"}]}');
    const indicator=loadRubric().indicators.find(i=>i.id==='7.3')!;
    const reading=await readSection({sectionId:1,instrumentTitle:'Example Act',headingPath:'1',text:'Records shall be kept for seven years.'},7,'Privacy',[indicator]);
    expect(reading.failure).toBeNull(); expect(reading.rejected).toHaveLength(1);
    const decision=decide({indicator,economy:'SGP',evidence:[],coverage:{sectionsRead:1,sectionsIndexed:1,instrumentsConsidered:1},surfaced:[{instrumentId:1,instrumentTitle:'Example Act',rank:1}]});
    expect(decision.state).toBe('no-restriction'); expect(decision.score).toBe(0);
  });
  it('retention mapped and scored without a specified duration',async()=>{
    const text='Every employer shall retain employee records for the prescribed period.';
    const raw={indicatorId:'7.3',measure:'minimum-retention',quote:text,dutyBearer:'Every employer',dutyAct:'shall retain employee records',dutyForce:'requires',mandatory:true,dutyBearerKind:'organisation',definingWords:'for the prescribed period',imposingWords:'shall retain employee records',subjectWords:'employee records',statedPeriod:null,requirement:'A duty to retain records.',sectorScope:'all',dataScope:'personal'};
    queue.answers.push(JSON.stringify({findings:[raw]}));
    const indicator=loadRubric().indicators.find(i=>i.id==='7.3')!;
    const reading=await readSection({sectionId:1,instrumentTitle:'Example Act',headingPath:'1',text},7,'Privacy',[indicator]);
    expect(reading.findings).toHaveLength(1);
    const decision=decide({indicator,economy:'SGP',evidence:[{finding:reading.findings[0]!,sectionId:1,instrumentId:1,instrumentTitle:'Example Act',headingPath:'1',citation:'https://sso.agc.gov.sg/example#s1',bindingness:'binding',instrumentStatus:'in-force'}],coverage:{sectionsRead:1,sectionsIndexed:1,instrumentsConsidered:1},surfaced:[{instrumentId:1,instrumentTitle:'Example Act',rank:1}]});
    console.log('unspecified retention duration',decision.state,decision.score);
    expect(decision.state).toBe('restricted'); expect(decision.score).toBe(1);
  });
  it('a section reference becomes the money amount used by 12.5',()=>{
    const words='Goods under section 3 with a value not exceeding S$400';
    expect(moneyIn(words,'SGP')).toMatchObject({amount:3,currency:'SGD'});
    const indicator=loadRubric().indicators.find(i=>i.id==='12.5')!;
    const rule=__rules['12.5']!;
    const out=rule(indicator,[{finding:{definingWords:words}} as never],{economy:'SGP',rates:{base:'USD',asOf:'2026-09-19',fetchedAt:'2026-09-19',source:'fixture',usdPer:{SGD:0.75}}});
    console.log('money extraction',out);
    expect(out.ordinal).toBe(2);
  });
  it('another model changes an already-scored run through the default rescore',async()=>{
    const db=tinyStore();
    const text='Every employer shall retain employee records for five years.';
    db.prepare('UPDATE section SET text=?,char_end=? WHERE id=1').run(text,text.length);
    db.prepare('UPDATE document_text SET text=? WHERE document_id=1').run(text);
    const finding={indicatorId:'7.3',measure:'minimum-retention',quote:text,dutyBearer:'Every employer',dutyAct:'shall retain employee records',dutyForce:'requires',mandatory:true,dutyBearerKind:'organisation',definingWords:'for five years',imposingWords:'shall retain employee records',subjectWords:'employee records',statedPeriod:'five years',requirement:'A duty to retain records.',sectorScope:'all',dataScope:'personal'};
    queue.answers.push(JSON.stringify({findings:[finding]}));
    const q=questionFor('7.3','minimum-retention');
    const insert=db.prepare('INSERT INTO measure_confirmation(section_id,indicator_id,measure,question,words,model,asked_at) VALUES(1,?,?,?, ?,?,?)');
    insert.run('7.3','minimum-retention',q,null,'fixture','2026-09-19');
    const run=openRun(db,{economies:['SGP'],pillars:[7],model:'fixture'});
    const answer=await answerPillar(db,7,'SGP',{model:'fixture',vectors:{ids:new Int32Array(),matrix:new Float32Array(),dims:0}});
    expect(answer.decisions.find(d=>d.indicatorId==='7.3')?.score).toBe(0);
    recordPillarAnswer(run,answer);
    insert.run('7.3','minimum-retention',q,'for five years','other-model','2026-09-19');
    rescoreRun(db,run.id);
    const after=db.prepare("SELECT state,score FROM cell JOIN cell_answer ON cell_id=cell.id WHERE indicator_id='7.3'").get();
    console.log('same run after another model confirms',after);
    expect(after).toEqual({state:'restricted',score:1});
    db.close();
  });
  it('a shortlisted unread document is skipped by the materialisation used by prepare',async()=>{
    const db=tinyStore();db.exec("DELETE FROM section; INSERT INTO unread_document(document_id,reason,detail,recorded_at) VALUES(1,'empty','temporary empty page','2026-09-19');");
    const fetch=vi.fn(()=>{throw new Error('should have retried');});
    const result=await materialise(db,loadProfile('SGP'),{fetch} as never,{instrumentIds:[1]});
    expect(fetch).not.toHaveBeenCalled();expect(result).toEqual([]);db.close();
  });
  it('identical section numbers in different structural locations are treated as translations',()=>{
    const db=tinyStore();
    db.exec("UPDATE section SET heading_path='Schedule 2 > 1 Fees',language='en' WHERE id=1; INSERT INTO section(id,document_id,ordinal,heading_path,label,text,char_start,char_end,language) VALUES(2,1,2,'Part I > 1 Duties','1','A different Malay provision',18,44,'ms');");
    expect([...otherLanguageCopies(db,'SGP')]).toEqual([2]);db.close();
  });
  it('unknown authorisation is treated as no court order',async()=>{
    const text='An authorised officer may require a provider to disclose personal data in accordance with section 9.';
    queue.answers.push(JSON.stringify({findings:[{indicatorId:'7.5',measure:'government-access',quote:text,dutyBearer:'An authorised officer',dutyAct:'may require a provider to disclose personal data',dutyForce:'permits',mandatory:false,dutyBearerKind:'government',definingWords:'may require a provider to disclose personal data',subjectWords:'personal data',authorisation:'unstated',authorisingWords:null,sectorScope:'all',dataScope:'personal'}]}));
    const indicator=loadRubric().indicators.find(i=>i.id==='7.5')!;
    const reading=await readSection({sectionId:1,instrumentTitle:'Example Act',headingPath:'1',text},7,'Privacy',[indicator]);
    expect(reading.findings).toHaveLength(1);
    const decision=decide({indicator,economy:'SGP',evidence:[{finding:reading.findings[0]!,sectionId:1,instrumentId:1,instrumentTitle:'Example Act',headingPath:'1',citation:'https://sso.agc.gov.sg/example#s1',bindingness:'binding',instrumentStatus:'in-force'}],coverage:{sectionsRead:1,sectionsIndexed:1,instrumentsConsidered:1}});
    console.log('unstated authorisation',decision.state,decision.score);
    expect(decision.score).toBe(1);
  });
  it('the first of two same-measure findings hides the second access power',async()=>{
    const db=tinyStore();
    const quotes=['The police may obtain personal data on a court order.','The police may obtain personal data without judicial approval in an emergency.'];
    const text=quotes.join(' ');db.prepare('UPDATE section SET text=?,char_end=?').run(text,text.length);db.prepare('UPDATE document_text SET text=?').run(text);
    const findings=quotes.map((quote,i)=>({indicatorId:'7.5',measure:'government-access',quote,dutyBearer:'The police',dutyAct:'may obtain personal data',dutyForce:'permits',mandatory:false,dutyBearerKind:'government',definingWords:'may obtain personal data',subjectWords:'personal data',authorisation:i?'none':'court-order',authorisingWords:i?'without judicial approval':'on a court order',sectorScope:'all',dataScope:'personal'}));
    queue.answers.push(JSON.stringify({findings}));
    const answer=await answerPillar(db,7,'SGP',{model:'fixture',vectors:{ids:new Int32Array(),matrix:new Float32Array(),dims:0}});
    expect(answer.readings[0]?.findings).toHaveLength(2);
    const result=answer.decisions.find(d=>d.indicatorId==='7.5')!;
    console.log('two access powers',result.score,result.held.map(h=>h.reason));
    expect(result.score).toBe(0);expect(result.held).toHaveLength(1);db.close();
  });
});
```

## Frontend: `frontend/lib/export/pipeline-audit.temp.test.ts`

```typescript
import {describe,it,expect,vi} from 'vitest';
import ExcelJS from 'exceljs';
const data=vi.hoisted(()=>({rows:[] as any[]}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/data',()=>({getEconomies:()=>[{code:'SGP',name:'Singapore'}],getExportRows:()=>data.rows,getRubric:()=>({pillars:[],indicators:[]}),getRuns:()=>[],getVerdicts:()=>[],compareIndicatorIds:(a:string,b:string)=>a.localeCompare(b)}));
vi.mock('@/lib/data/submission',()=>({getEngines:()=>[],documentsFetchedBy:()=>0,zeroFetchDemonstrated:()=>false}));
import {outputCsv,rowsFor} from './workbook';
import {compareProvisions,addEngineComparison} from './sheets';
const row=(id:number,indicatorId='6.2')=>({id,runId:'r',economy:'SGP',lawName:'Example Act',indicatorId,sectionId:1,article:'1',sourceUrl:'https://sso.agc.gov.sg/example#s1',verbatimSnippet:'Quote',lastAmendedOn:null,lastAmended:'Since January 2000',gates:[{gate:'quote-in-source',passed:false}],notes:null} as any);
describe('isolated export audit probes: observed behavior',()=>{
  it('a commencement date becomes a most-recent-amendment year',()=>{data.rows=[row(1)]; const csv=outputCsv({runId:'r'}); console.log('date CSV',csv); expect(csv).toContain('"2000"');});
  it('a gate-held row is submitted without review',()=>{data.rows=[row(1)]; expect(rowsFor({runId:'r'})).toHaveLength(1);});
  it('a second finding on the same section is omitted from the comparison',()=>{const a=[row(1),{...row(2,'6.4'),verbatimSnippet:'Extra finding'}],b=[row(3)];const diff=compareProvisions(a,b);console.log('comparison',diff);expect(diff).toHaveLength(1);expect(diff[0]?.howTheyDiffer).toBe('identical');});
  it('a nonexistent second pass is reported as meeting zero-fetch requirement',()=>{const book=new ExcelJS.Workbook();addEngineComparison(book,{run:null,rows:[],documentsFetched:0},{run:null,rows:[],documentsFetched:0});const values=JSON.stringify(book.getWorksheet('Engine Comparison')!.getSheetValues());expect(values).toContain('Engine B fetched 0 documents, as required');});
});
```

