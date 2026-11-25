"use strict";
const native = location.hostname === "127.0.0.1";
const endpoint = native ? "request" : "https://zstdtbqqrxaaqjuxpjtk.supabase.co/functions/v1/rider-coach";
const publicKey = "sb_publishable_HisIQuBo8Xy11NNBEAFHfQ_gGEuDnUc";
const el = id => document.getElementById(id);
const note = msg => { el("state").textContent = msg; };
const hex = data => Array.from(new Uint8Array(data), b=>b.toString(16).padStart(2,"0")).join("");
let device, token, expires = 0, pending;
async function storageDevice(value) {
  if (native) {
    const opts=value ? {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)} : {};
    const r=await fetch("device",opts);
    if (!r.ok) throw Error("无法保存或读取本机激活凭证。");
    return r.json();
  }
  if(value) localStorage.setItem("coach.pass.device",JSON.stringify(value));
  return JSON.parse(localStorage.getItem("coach.pass.device"));
}
async function api(action,data={},bearer=token) {
  const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+(bearer || publicKey)},
    body:JSON.stringify({action,...data})});
  const out=await r.json();
  if(!r.ok) { const e=Error(out.error || "连接失败，请重试。"); e.status=r.status; e.retrySame=out.retrySame; throw e; }
  return out;
}
function remember(s){token=s.token;expires=s.expiresAt*1000;}
async function login(){remember(await api("login",device,publicKey));}
async function authorized(action,data) {
  if(!token || Date.now()+30000>=expires) await login();
  try {return await api(action,data);}catch(e){if(e.status!==401) throw e; await login();return api(action,data);}
}
function activation(message){
  token=null; el("account").hidden=true; el("access").hidden=false; note(message);
}
async function quota() {
  const {quota:q,available}=await authorized("quota");
  if(!q){activation("此设备的共享权限已撤销。如需继续，请输入新的邀请码。");return;}
  el("access").hidden=true;el("account").hidden=false;
  const remaining=Math.max(0,q.limit-q.used);
  el("remaining").textContent=remaining;el("limit").textContent=q.limit;el("bar").max=q.limit || 1;el("bar").value=remaining;
  el("reset").textContent="北京时间 "+new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(q.resetsAt))+" 重置";
  el("send").disabled=!remaining || !available;
  if(!available) note("设备已激活。共享模型待管理员启用。");else if(!remaining) note("今日额度已用完。");
}
async function restore() {
  el("retry").hidden=true;note("正在检查设备…");
  try {device=await storageDevice(); if(!device){activation("");return;} await login();note("");await quota();}
  catch(e){if(e.status===401){activation("请输入尚未使用的邀请码。");}else{note("暂时无法验证设备，请重新连接。");el("retry").hidden=false;}}
}
async function redeem(){
  const invite=el("code").value.trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(invite)){note("邀请码格式有误，请完整复制。");return;}
  el("redeem").disabled=true;note("正在验证邀请码…");
  try{
    const digest=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(invite)));
    const email="r."+digest.slice(0,56)+"@invite.invalid";
    // Persist the independent device password before submitting. A lost success
    // response can then be recovered by logging in without redeeming twice.
    device=await storageDevice();
    if(device?.email!==email) {
      const next={email,password:hex(crypto.getRandomValues(new Uint8Array(32)))};
      await storageDevice(next);device=next;
    }
    try {remember(await api("signup",{...device,invite},publicKey));}
    catch(e){
      if([400,403,409].includes(e.status)){
        throw Error("邀请码无效、已过期或已使用。已在本机激活过，可点击重新连接。");
      }else{throw e;}
    }
    el("code").value="";note("设备已激活。");await quota();
  }catch(e){note(e.message);el("retry").hidden=false;}finally{el("redeem").disabled=false;}
}
el("activate").onsubmit=async e=>{
  e.preventDefault();if(el("redeem").disabled)return;
  if(navigator.locks) await navigator.locks.request("wilson-pass-activation",redeem);
  else await redeem();
};
if(native) el("return").hidden=false;
el("ask").onsubmit=async e=>{
  e.preventDefault();const question=el("question").value.trim();if(!question||el("send").disabled)return;
  if(!pending||pending.question!==question)pending={requestId:crypto.randomUUID(),question};
  el("send").disabled=true;note("教练正在分析…");
  try{const out=await authorized("ask",pending);el("answer").textContent=out.answer;el("answer").hidden=false;pending=null;el("ask").reset();note("");}
  catch(e){if(e.retrySame===false)pending=null;note(e.message);}
  finally{try{await quota();}catch{el("retry").hidden=false;}}
};
el("retry").onclick=restore;restore();
