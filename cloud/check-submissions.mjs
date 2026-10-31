import assert from 'node:assert/strict';
import {createHandler} from '../dist/edge/handler.mjs';
let state={scores:[],profiles:{},maps:[]};
const database=async(route,options={})=>{
 if(route.startsWith('app_state?'))return Object.entries(state).map(([key,value])=>({key,value:structuredClone(value),updated_at:'version'}));
 if(route==='rpc/game_state_commit'){Object.assign(state,JSON.parse(options.body).new_values);return true;}
 throw Error('Unexpected database route '+route);
};
const handle=createHandler(database);
const score={id:'check-score',profileId:'check-user',levelId:'entry',title:'First Note',ranked:true,passed:true,pp:10,accuracy:100,score:100,hits:0,bombs:0,stars:1,rank:0,mods:{HD:false,DT:false,HR:false,SD:false},replay:{ticks:1,runs:[[1,0]],seed:1}};
async function request(url,value){let status,result;await handle({url,method:'POST',headers:{host:'localhost'},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield JSON.stringify(value);}},{writeHead(s){status=s},end(s){result=JSON.parse(s)}});return {status,result};}
async function submit(value){return request('/api/scores',{score:value})}
let response=await submit(score);assert.equal(response.status,201);assert.equal(response.result.ranked,true);assert(response.result.id);assert.equal(state.scores.length,1);
response=await submit(score);assert.equal(response.status,200);assert.equal(response.result.duplicate,true);assert.equal(state.scores.length,1);
response=await submit({...score,id:'sd-on',mods:{...score.mods,SD:true}});assert.equal(response.status,201);
response=await submit({...score,id:'ln-ranked-client',levelId:'ln4-0-0',ranked:true});assert.equal(response.status,201);assert.equal(response.result.ranked,false);assert(!state.profiles['check-user'].bestScores['ln4-0-0']);assert(state.profiles['check-user'].unrankedBestScores['ln4-0-0']);
state.scores.push({...score,id:'legacy-ln',clientId:'legacy-ln',levelId:'ln7-4-1',ranked:true});state.profiles['check-user'].bestScores['ln7-4-1']={levelId:'ln7-4-1',pp:15,score:15,accuracy:100};
state.profiles['legacy-user']={id:'legacy-user',name:'Old LN player',bestScores:{'ln7-9-0':{levelId:'ln7-9-0',pp:150,score:150,accuracy:100}},unrankedBestScores:{},rankedPP:150,unrankedPP:0,rankHistory:[]};
response=await request('/api/sync',{id:'check-user',name:'Square'});assert.equal(response.status,200);assert.equal(state.scores.find(run=>run.clientId==='legacy-ln').ranked,false);assert(!state.profiles['check-user'].bestScores['ln7-4-1']);assert(state.profiles['check-user'].unrankedBestScores['ln7-4-1']);
assert.equal(state.profiles['check-user'].rankedPP,10);assert.equal(state.profiles['legacy-user'].rankedPP,0);assert(state.profiles['legacy-user'].unrankedBestScores['ln7-9-0']);
response=await submit({...score,id:'bad-replay',replay:{ticks:2,runs:[[1,0]]}});assert.equal(response.status,400);
response=await submit({...score,id:'bad-mod',mods:{SD:'yes'}});assert.equal(response.status,400);
console.log('PASS ranked SD-off/SD-on submissions accepted; LN scores forced unranked; retries deduplicate; malformed data rejected.');
