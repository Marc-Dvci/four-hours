import {describe,it,expect} from 'vitest';
import {makeIncident} from '../src/demo/bank';
import {sign,recordSubmission,verify,append,type RecordState} from '../src/core/ledger';
import {clocks} from '../src/core/clocks';
import {updateContext} from '../src/core/context';
import {reportFields} from '../src/core/reports';
import {recurring} from '../src/core/recurrence';

const create=():RecordState=>({incident:makeIncident({criticalFunction:true,economicImpact:200000,memberStates:['FR','DE']}),signature:null,receipts:[],revisions:[]});
const classify=()=>sign(create(),'officer','The service and impact evidence supports major classification.','2026-10-29T11:00:00Z');
describe('jury audit regressions',()=>{
 it('does not export an old signed verdict against changed evidence',async()=>{
   const s=await classify();s.incident=makeIncident();
   expect(reportFields(s,'initial').find(f=>f.code==='classification')?.value).not.toBe('MAJOR');
 });
 it('rejects malformed revision timestamps without crashing',async()=>{
   const entries=await append([],'officer','test',{},'2026-10-29T11:00:00Z');
   entries[0]!.at='not-a-date';
   expect(await verify(entries)).toBe(false);
 });
 it('allows recording an actual submission that preceded a later evidence review',async()=>{
   let s=await classify();
   s=await updateContext(s,{...s.incident,rootCause:'Root cause refined'},'officer','2026-10-29T12:00:00Z');
   s=await sign(s,'officer','Updated root cause reviewed against the same major incident.','2026-10-29T12:00:00Z');
   await expect(recordSubmission(s,{kind:'initial',submittedAt:'2026-10-29T11:30:00Z',reference:'NCA-actual-receipt'},'officer','2026-10-29T12:30:00Z')).resolves.toHaveProperty('receipts');
 });
 it('never moves an established initial deadline later after awareness correction',async()=>{
   const s0=create();s0.incident.occurredAt='2026-10-28T05:00:00Z';s0.incident.awarenessAt='2026-10-28T08:00:00Z';s0.incident.assessedAt='2026-10-29T07:00:00Z';
   for(const f of Object.values(s0.incident.facts))f.observedAt=s0.incident.assessedAt;
   let s=await sign(s0,'officer','Major incident evidence assessed.','2026-10-29T07:00:00Z');
   const original=clocks(s.incident,s.signature,[],'2026-10-29T07:00:00Z')[0]!.dueAt;
   s=await updateContext(s,{...s.incident,awarenessAt:'2026-10-28T06:00:00Z'},'officer','2026-10-29T07:10:00Z');
   expect(Date.parse(clocks(s.incident,s.signature,[],'2026-10-29T07:10:00Z')[0]!.dueAt!)).toBeLessThanOrEqual(Date.parse(original!));
 });
 it('looks across services for the same apparent root cause',()=>{
   const a=makeIncident({criticalFunction:true,economicImpact:60000,memberStates:['FR','DE']},{id:'FH-2'});
   const b=makeIncident({criticalFunction:true,economicImpact:60000,memberStates:['FR','DE']},{id:'FH-1',serviceId:'another-service',occurredAt:'2026-08-01T08:00:00Z',awarenessAt:'2026-08-01T09:00:00Z'});
   expect(recurring(a,[b]).assessment?.verdict).toBe('MAJOR');
 });
 it('does not permit revising a finalised incident',async()=>{
   let s=await classify();
   for(const [kind,reference] of [['initial','NCA-1'],['intermediate','NCA-2'],['final','NCA-3']] as const)s=await recordSubmission(s,{kind,reference,submittedAt:'2026-10-29T11:00:00Z'},'officer','2026-10-29T11:00:00Z');
   await expect(updateContext(s,{...s.incident,rootCause:'Changed after final report'},'officer','2026-10-29T12:00:00Z')).rejects.toThrow(/final|closed/i);
 });
});
