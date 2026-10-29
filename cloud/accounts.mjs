// Username/password accounts use Supabase Auth's password hashing and sessions.
// Synthetic addresses are internal identifiers; the product requires no email.
export function accountApi({database, projectUrl, secret, publicKey}) {
 const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
 async function auth(path,body,token,admin=false){
  const response=await fetch(projectUrl+'/auth/v1/'+path,{method:body?'POST':'GET',headers:{apikey:admin?secret:publicKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();if(!response.ok)fail(admin?'Username unavailable or account creation failed':value.msg||value.error_description||'Sign-in failed',response.status===429?429:400);return value;
 }
 async function identity(request){
  const token=request.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return null;
  const response=await fetch(projectUrl+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:'Bearer '+token}});
  if(!response.ok)fail('Session expired. Sign in again.',401);
  const user=await response.json(),rows=await database('game_accounts?user_id=eq.'+encodeURIComponent(user.id)+'&select=*');
  if(!rows[0])fail('Account unavailable',401);return rows[0];
 }
 async function limited(bucket,max,seconds){if(!await database('rpc/game_rate_limit',{method:'POST',body:JSON.stringify({bucket,max_count:max,window_seconds:seconds})}))fail('Too many requests. Please wait and retry.',429)}
 async function read(request){const raw=await request.text();if(raw.length>12000000)fail('Save too large',413);try{return JSON.parse(raw)}catch{fail('Invalid JSON')}}
 const publicAccount=a=>({id:a.user_id,username:a.username,save:a.save,revision:a.revision,playSeconds:a.play_seconds});
 async function route(request,path){
  try{
   if(path==='/api/account/login'||path==='/api/account/register'){
    const input=await read(request),username=String(input.username||'').trim().toLowerCase(),password=String(input.password||'');
    if(!/^[a-z0-9_]{3,20}$/.test(username)||password.length<10||password.length>128)fail('Use a 3–20 character username (letters, numbers, underscore) and a 10–128 character password.');
    const ip=request.headers.get('x-real-ip')||request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')||'unknown';
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret+ip));const bucket=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
    await limited('auth:'+bucket,20,60);
    const email=username+'@players.star-square.invalid';
    if(path.endsWith('/register')){
     await limited('register:'+bucket,3,3600);
     const claims=await database('rpc/game_claim_username',{method:'POST',body:JSON.stringify({requested:username})});
     if(!claims)fail('That username is already taken. Choose another.',409);
     let user;try{user=await auth('admin/users',{email,password,email_confirm:true},null,true)}catch(error){await database('game_usernames?username=eq.'+encodeURIComponent(username),{method:'DELETE'});throw error}
     try{await database('game_accounts',{method:'POST',body:JSON.stringify({user_id:user.id,username})})}catch(error){await auth('admin/users/'+user.id,null,null,true);await database('game_usernames?username=eq.'+encodeURIComponent(username),{method:'DELETE'});throw error}
    }
    const session=await auth('token?grant_type=password',{email,password});
    const rows=await database('game_accounts?user_id=eq.'+session.user.id+'&select=*');
    return json(200,{session:{access_token:session.access_token,refresh_token:session.refresh_token,expires_at:Math.floor(Date.now()/1000)+session.expires_in},account:publicAccount(rows[0])});
   }
   if(path==='/api/account/refresh'){
    const input=await read(request),s=await auth('token?grant_type=refresh_token',{refresh_token:input.refresh_token});
    return json(200,{access_token:s.access_token,refresh_token:s.refresh_token,expires_at:Math.floor(Date.now()/1000)+s.expires_in});
   }
   if(path==='/api/chat'&&request.method==='GET'){
    const rows=await database('game_chat?select=id,username,message,created_at&order=id.desc&limit=80');return json(200,rows.reverse());
   }
   if(path==='/api/account'&&request.method==='POST')fail('Choose a new username. Existing account usernames cannot be renamed.',405);
   const account=await identity(request);
   if(!account)fail('Sign in to use this feature',401);
   if(path==='/api/account/logout'){
    await fetch(projectUrl+'/auth/v1/logout',{method:'POST',headers:{apikey:publicKey,Authorization:request.headers.get('authorization')}});return json(200,{ok:true});
   }
   if(path==='/api/account'&&request.method==='GET')return json(200,publicAccount(account));
   if(path==='/api/account/save'&&request.method==='POST'){
    const input=await read(request),save=input.save;
    if(!save||typeof save!=='object'||Array.isArray(save)||!Array.isArray(save.scores)||!Array.isArray(save.customLevels)||!save.upgrades)fail('Invalid save');
    save.profileId=account.user_id;save.profileName=account.username;
    const rows=await database('rpc/game_save_account',{method:'POST',body:JSON.stringify({account_id:account.user_id,expected_revision:Number(input.revision),next_save:save,active_seconds:Math.round(Number(input.activeSeconds)||0)})});
    if(!rows.length)return json(409,{error:'Cloud save changed on another device. Reload the cloud save before continuing.'});
    return json(200,{revision:rows[0].revision,playSeconds:rows[0].play_seconds});
   }
   if(path==='/api/chat'&&request.method==='POST'){
    await limited('chat:'+account.user_id,1,3);const input=await read(request),message=String(input.message||'').trim();
    if(!message||message.length>300||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(message))fail('Message must contain 1–300 characters.');
    const rows=await database('game_chat?select=id,username,message,created_at',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:account.user_id,username:account.username,message})});return json(201,rows[0]||{ok:true});
   }
   return json(404,{error:'Not found'});
  }catch(error){return json(error.status||500,{error:error.status?error.message:'Account service unavailable. Please retry.'})}
 }
 // Account identities cannot be overwritten by guest /sync or score uploads.
 async function protect(request,path,input){
  const id=path==='/api/scores'?input.score?.profileId:path==='/api/sync'?input.id:null;
  if(!id)return;
  const account=await identity(request);
  const owners=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)?await database('game_accounts?user_id=eq.'+encodeURIComponent(id)+'&select=user_id,username'):[];
  if(owners.length&&account?.user_id!==id)fail('Sign in to submit scores for this account',403);
  if(account){if(id!==account.user_id)fail('Score belongs to a different profile',403);if(input.score)input.score.profileName=account.username;else input.name=account.username}
 }
 return {route,protect};
}
