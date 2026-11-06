const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const BASE='http://127.0.0.1:5174';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
function lh(url,out){return new Promise((res,rej)=>{const args=[path.join('node_modules','lighthouse','cli','index.js'),url,'--output','json','--output-path',out,'--chrome-flags','--headless=new --no-sandbox --disable-gpu','--chrome-path',CHROME,'--form-factor=mobile','--screenEmulation.mobile','--screenEmulation.width=390','--screenEmulation.height=844','--screenEmulation.deviceScaleFactor=2','--throttling-method=simulate','--throttling.rttMs=150','--throttling.throughputKbps=1638.4','--throttling.cpuSlowdownMultiplier=4','--quiet'];const p=spawn(process.execPath,args);p.on('close',c=>{try{res(JSON.parse(fs.readFileSync(out,'utf8')))}catch(e){rej(e)}});});}
(async()=>{
 for(const [name,url] of [['Home','/'],['Detail','/san-pham/ca-phe-sua']]){
  const a=await lh(BASE+url,path.join(os.tmpdir(),'x'+name+'.json'));
  console.log('=== '+name+' ===');
  console.log('LCP phases:',JSON.stringify(a.audits['lcp-breakdown-insight']?.details?.items?.[0]?.items||[]));
  console.log('render-blocking:',JSON.stringify(a.audits['render-blocking-resources']?.details?.items||[]).slice(0,500));
  console.log('font-display:',JSON.stringify(a.audits['font-display']?.details?.items||[]).slice(0,400));
  console.log('network deps:',JSON.stringify(a.audits['network-requests']?.details?.items?.filter(i=>i.resourceType==='Font'||i.resourceType==='Stylesheet').map(i=>({u:i.url.split('/').pop(),t:i.resourceType,st:i.startTime,d:i.endTime-i.startTime})||[]).slice(0,12)));
  console.log('diag:',JSON.stringify(a.audits['diagnostics']?.details?.items?.[0]?.numRequests));
 }
})();
