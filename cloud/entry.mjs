import { createHandler } from './handler.mjs';
import { databaseClient } from './storage.mjs';
import { makeReplayVerifier } from './replay-verifier.mjs';
const projectUrl = Deno.env.get('SUPABASE_URL');
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const secret = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const publicKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'));
if (Deno.env.get('SUPABASE_ANON_KEY')) publicKeys.push(Deno.env.get('SUPABASE_ANON_KEY'));
if (!projectUrl || !secret || !publicKeys.length) throw new Error('Supabase environment unavailable');
const handle = createHandler(databaseClient(projectUrl, secret), makeReplayVerifier(secret));
const trustedProxyTokenHash = '__TRUSTED_PROXY_HASH__';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,apikey', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'no-store' };
export async function serve(request) {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (!publicKeys.includes(request.headers.get('apikey'))) return new Response(JSON.stringify({error:'Missing or invalid application API key'}),{status:401,headers:{...cors,'Content-Type':'application/json'}});
  const url = new URL(request.url);
  let forwardedIp = '';
  const proxyToken = request.headers.get('x-star-square-server-key') || '';
  if (proxyToken.length === 64) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proxyToken));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
    if (hash === trustedProxyTokenHash) forwardedIp = request.headers.get('x-star-square-client-ip') || '';
  }
  const pathname = url.pathname.replace(/^\/(?:functions\/v1\/)?star-square-api(?=\/|$)/,'') || '/';
  let status = 200, headers = {};
  const req = { url: pathname + url.search, method: request.method, headers: Object.fromEntries(request.headers),
    socket: { remoteAddress: request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || '' },
    async *[Symbol.asyncIterator]() {
      const reader=request.body?.getReader(); if(!reader)return;
      const decoder=new TextDecoder();
      try { while(true){const {done,value}=await reader.read();if(done)break;yield decoder.decode(value,{stream:true});} const tail=decoder.decode();if(tail)yield tail; }
      finally { reader.releaseLock(); }
    }
  };
  if (forwardedIp) req.headers['x-forwarded-for'] = forwardedIp;
  let result;
  await handle(req,{ writeHead(code,values){status=code;headers=values;},end(body){result=new Response(body,{status,headers:{...headers,...cors}});} });
  return result || new Response(JSON.stringify({error:'Server error'}),{status:500,headers:cors});
}
Deno.serve(serve);
