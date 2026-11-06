const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const BASE='http://127.0.0.1:4173';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
function lh(url,out){return new Promise((res,rej)=>{const args=[path.join('node_modules','lighthouse','cli','index.js'),url,'--output','json','--output-path',out,'--chrome-flags','--headless=new --no-sandbox --disable-gpu','--chrome-path',CHROME,'--form-factor=mobile','--screenEmulation.mobile','--screenEmulation.width=390','--screenEmulation.height=844','--screenEmulation.deviceScaleFactor=2','--throttling-method=simulate','--throttling.rttMs=150','--throttling.throughputKbps=1638.4','--throttling.cpuSlowdownMultiplier=4','--quiet'];const p=spawn(process.execPath,args);p.on('close',c=>{try{res(JSON.parse(fs.readFileSync(out,'utf8')))}catch(e){rej(e)}});});}
(async()=>{
 const a=await lh(BASE+'/',path.join(os.tmpdir(),'z.json'));
 const L=a.audits['largest-contentful-paint'];
 console.log('LCP numeric:',L.numericValue);
 console.log('LCP elem:',JSON.stringify(a.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items||[]).slice(0,400));
 console.log('phases:',JSON.stringify(a.audits['largest-contentful-paint-element']?.details?.items?.[1]?.items||[]));
 console.log('insight:',JSON.stringify(a.audits['lcp-breakdown-insight']?.details?.items||[]).slice(0,500));
 console.log('render-blocking:',JSON.stringify(a.audits['render-blocking-resources']?.details?.items||[]).slice(0,400));
 console.log('bootup:',JSON.stringify(a.audits['bootup-time']?.details?.items||[]).slice(0,600));
 const nr=a.audits['network-requests']?.details?.items||[];
 console.log('reqs:',nr.map(i=>(i.url.split('/').pop()+' t='+Math.round(i.startTime)+' sz='+(i.transferSize||0))).join('\n  '));
})();
