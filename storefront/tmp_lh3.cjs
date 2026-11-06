const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const BASE='http://127.0.0.1:5174';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
function lh(url,out){return new Promise((res,rej)=>{const args=[path.join('node_modules','lighthouse','cli','index.js'),url,'--output','json','--output-path',out,'--chrome-flags','--headless=new --no-sandbox --disable-gpu','--chrome-path',CHROME,'--form-factor=mobile','--screenEmulation.mobile','--screenEmulation.width=390','--screenEmulation.height=844','--screenEmulation.deviceScaleFactor=2','--throttling-method=simulate','--throttling.rttMs=150','--throttling.throughputKbps=1638.4','--throttling.cpuSlowdownMultiplier=4','--quiet'];const p=spawn(process.execPath,args);p.on('close',c=>{try{res(JSON.parse(fs.readFileSync(out,'utf8')))}catch(e){rej(e)}});});}
(async()=>{
 const a=await lh(BASE+'/',path.join(os.tmpdir(),'y.json'));
 console.log('mainthread:',JSON.stringify(a.audits['mainthread-work-breakdown']?.details?.items||[]).slice(0,700));
 console.log('bootup:',JSON.stringify(a.audits['bootup-time']?.details?.items||[]).slice(0,500));
 console.log('unused-js:',JSON.stringify(a.audits['unused-javascript']?.details?.items||[]).slice(0,600));
 console.log('crit chain:',JSON.stringify(a.audits['critical-request-chains']?.details?.items||[]).slice(0,800));
 console.log('LCP elem:',JSON.stringify(a.audits['largest-contentful-paint-element']?.details?.items?.[1]?.items||[]).slice(0,400));
 console.log('server resp:',a.audits['server-response-time']?.numericValue,' redirect:',a.audits['redirects']?.numericValue);
})();
