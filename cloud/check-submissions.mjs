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
async function submit(value){let status,result;await handle({url:'/api/scores',method:'POST',headers:{host:'localhost'},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield JSON.stringify({score:value});}},{writeHead(s){status=s},end(s){result=JSON.parse(s)}});return {status,result};}
let response=await submit(score);assert.equal(response.status,201);assert.equal(response.result.ranked,true);assert(response.result.id);assert.equal(state.scores.length,1);
response=await submit(score);assert.equal(response.status,200);assert.equal(response.result.duplicate,true);assert.equal(state.scores.length,1);
response=await submit({...score,id:'sd-on',mods:{...score.mods,SD:true}});assert.equal(response.status,201);
response=await submit({...score,id:'bad-replay',replay:{ticks:2,runs:[[1,0]]}});assert.equal(response.status,400);
response=await submit({...score,id:'bad-mod',mods:{SD:'yes'}});assert.equal(response.status,400);
console.log('PASS ranked SD-off and SD-on submissions accepted immediately; retries deduplicate; malformed data rejected.');
