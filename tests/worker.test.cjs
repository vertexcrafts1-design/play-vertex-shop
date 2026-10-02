const test = require('node:test');
const assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const worker = import(pathToFileURL(path.join(__dirname,'../integration/worker.mjs')).href).then(module=>module.default);
const env={STRIPE_WEBHOOK_SECRET:'fixture-only-webhook-secret',ORIGIN_MANAGE_TOKEN:'fixture-only-origin-token',SESSION_SECRET:'fixture-only-session-secret'};
function signed(event,age=0) {
  const body=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000)-age;
  const signature=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
  return new Request('https://worker.example/stripe/webhook',{method:'POST',body,headers:{'stripe-signature':`t=${timestamp},v1=${signature}`}});
}
function event(type='checkout.session.completed',payment_status='paid',name='.Gamefly') {
  return {id:'evt_fixture',type,data:{object:{id:'cs_fixture',payment_link:'plink_1UDA0f1Gvri1WvgPvYreyWXi',payment_status,amount_total:499,currency:'eur',custom_fields:[{key:'minecraft_name',text:{value:name}}]}}};
}
async function call(request,status=200) {
  const original=global.fetch,calls=[];
  global.fetch=async (url,options)=>{calls.push({url,options});return new Response(JSON.stringify({ok:true}),{status,headers:{'Content-Type':'application/json'}});};
  try {const response=await (await worker).fetch(request,env);return {response,body:await response.json(),calls};}finally{global.fetch=original;}
}
test('paid signed delivery preserves link, session, name and origin authentication',async()=>{
  const result=await call(signed(event()));
  assert.equal(result.response.status,200);assert.equal(result.body.fulfilled,true);assert.equal(result.calls.length,1);
  const request=result.calls[0]; assert.ok(request.url.endsWith('/api/shop/fulfill'));
  assert.equal(request.options.headers.Authorization,'Bearer '+env.ORIGIN_MANAGE_TOKEN);
  const payload=JSON.parse(request.options.body);
  assert.equal(payload.player,'.Gamefly');assert.equal(payload.sessionId,'cs_fixture');assert.equal(payload.paymentLink,'plink_1UDA0f1Gvri1WvgPvYreyWXi');
});
test('an unpaid completed session is never delivered',async()=>{
  const result=await call(signed(event('checkout.session.completed','unpaid')));
  assert.equal(result.body.waiting,true);assert.equal(result.calls.length,0);
});
test('async success must also carry paid status before delivery',async()=>{
  const result=await call(signed(event('checkout.session.async_payment_succeeded','unpaid')));
  assert.equal(result.body.waiting,true);assert.equal(result.calls.length,0);
});
test('invalid player characters never reach command fulfillment',async()=>{
  for(const name of ['Player op Admin','<script>','../admin']) {
    const result=await call(signed(event('checkout.session.completed','paid',name)));
    assert.equal(result.response.status,422);assert.equal(result.calls.length,0);
  }
});
test('forged and expired signatures cannot trigger delivery',async()=>{
  let result=await call(new Request('https://worker.example/stripe/webhook',{method:'POST',body:JSON.stringify(event()),headers:{'stripe-signature':'t=1,v1=bad'}}));
  assert.equal(result.response.status,400);assert.equal(result.calls.length,0);
  result=await call(signed(event(),600));assert.equal(result.response.status,400);assert.equal(result.calls.length,0);
});
test('origin failure is retried and never reported as fulfilled',async()=>{
  const result=await call(signed(event()),503);
  assert.equal(result.response.status,502);assert.equal(result.body.fulfilled,undefined);
});
test('public stats remain readable while management requires authentication',async()=>{
  let result=await call(new Request('https://worker.example/api/public/stats?sort=balance&limit=100'));
  assert.equal(result.response.status,200);assert.equal(result.calls.length,1);
  result=await call(new Request('https://worker.example/manage/unban',{method:'POST',body:'{}'}));
  assert.equal(result.response.status,401);assert.equal(result.calls.length,0);
});
