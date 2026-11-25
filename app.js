"use strict";
const endpoint = "https://zstdtbqqrxaaqjuxpjtk.supabase.co/functions/v1/rider-coach";
const el = id => document.getElementById(id);
let session;
try { session = JSON.parse(sessionStorage.getItem("coach.account")); } catch {}
let registering = false, pending = null;
function note(message) { el("state").textContent = message; }
function signedOut() {
  session = pending = null;
  sessionStorage.removeItem("coach.account");
  el("auth").reset(); el("ask").reset(); el("activate").reset();
  el("answer").hidden = true; el("answer").textContent = "";
  el("account").hidden = true; el("access").hidden = false;
}
function mode(create) {
  registering = create; note("");
  el("signin").setAttribute("aria-pressed",String(!create)); el("signup").setAttribute("aria-pressed",String(create));
  el("invited").hidden = !create; el("invite").required = create; el("password").minLength = create ? 12 : 1;
  el("password").autocomplete = create ? "new-password" : "current-password"; el("submit").textContent = create ? "注册并登录" : "登录";
}
async function api(action, data = {}) {
  const current = session;
  const r = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",...(current ? {Authorization:"Bearer "+current.token}:{})},body:JSON.stringify({action,...data})});
  if (current !== session) throw Error("账号已切换。");
  const result = await r.json();
  if (!r.ok) {
    if (current && r.status === 401) signedOut();
    const e = new Error(result.error || "服务暂时不可用。"); e.retrySame = result.retrySame; throw e;
  }
  return result;
}
async function updateQuota() {
  const {quota:q, available} = await api("quota");
  el("identity").textContent = session.email; el("access").hidden = true; el("account").hidden = false;
  el("activate").hidden = Boolean(q); el("meter").hidden = !q; el("ask").hidden = !q;
  if (!q) { note("输入专属邀请码即可开通共享额度。"); return; }
  const remaining = Math.max(0,q.limit-q.used);
  el("remaining").textContent = remaining; el("limit").textContent = q.limit;
  el("bar").max = q.limit || 1; el("bar").value = remaining;
  el("reset").textContent = "北京时间 "+new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(q.resetsAt))+" 重置";
  el("send").disabled = !available || !remaining;
  if (!available) note("共享模型待管理员启用，额度已保留。");
  else if (!remaining) note("今日额度已用完。");
}
el("signin").onclick = () => mode(false); el("signup").onclick = () => mode(true);
el("auth").onsubmit = async e => {
  e.preventDefault(); el("submit").disabled = true; note("正在验证账号…");
  try { session = await api(registering ? "signup":"login",{email:el("email").value,password:el("password").value,invite:el("invite").value.trim()});
    sessionStorage.setItem("coach.account",JSON.stringify(session)); el("auth").reset(); note(""); await updateQuota();
  } catch(e) { note(e.message); } finally { el("submit").disabled = false; }
};
el("activate").onsubmit = async e => {
  e.preventDefault(); try { await api("activate",{invite:el("code").value.trim()}); el("activate").reset(); note(""); await updateQuota(); } catch(e) { note(e.message); }
};
el("logout").onclick = async () => { try { await api("logout"); } finally { signedOut(); note("已退出此设备。"); } };
el("ask").onsubmit = async e => {
  e.preventDefault(); const question = el("question").value.trim(); if (!question || el("send").disabled) return;
  if (!pending || pending.question !== question) pending = {requestId:crypto.randomUUID(),question};
  const current = session;
  el("send").disabled = true; note("教练正在分析…");
  try {
    const result = await api("ask",pending); el("answer").textContent = result.answer;
    el("answer").hidden = false; el("ask").reset(); pending = null; note("");
  } catch(e) { if (e.retrySame === false) pending = null; note(e.message); }
  finally { if (session && session === current) { el("send").disabled = false; try { await updateQuota(); } catch(e) { note(e.message); } } }
};
mode(false);
if (session && session.expiresAt*1000>Date.now()) updateQuota().catch(e=>note(e.message)); else signedOut();
