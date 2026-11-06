const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const BASE='http://127.0.0.1:5174';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
function lh(url,out){return new Promise((res,rej)=>{const args=[path.join('node_modules','lighthouse','cli','index.js'),url,'--output','json','--output-path',out,'--chrome-flags','--headless=new --no-sandbox --disable-gpu','--chrome-path',CHROME,'--form-factor=mobile','--screenEmulation.mobile','--screenEmulation.width=390','--screenEmulation.height=844','--screenEmulation.deviceScaleFactor=2','--throttling-method=simulate','--throttling.rttMs=150','--throttling.throughputKbps=1638.4','--throttling.cpuSlowdownMultiplier=4','--quiet'];const p=spawn(process.execPath,args);p.on('close',c=>{try{res(JSON.parse(fs.readFileSync(out,'utf8')))}catch(e){rej(e)}});});}
(async()=>{
 const a=await lh(BASE+'/san-pham/ca-phe-sua',path.join(os.tmpdir(),'d.json'));
 console.log('--- DETAIL a11y fails ---');
 for(const k of Object.keys(a.audits)){const au=a.audits[k];if(au.score!==null&&au.score<1&&a.categories.accessibility.auditRefs.some(x=>x.id===k))console.log(k,'::',(au.title||''),'::',(au.displayValue||''),'::',JSON.stringify((au.details&&au.details.items||[]).slice(0,3)).slice(0,400));}
 const b=await lh(BASE+'/thanh-toan',path.join(os.tmpdir(),'c.json'));
 console.log('--- CHECKOUT seo fails ---');
 for(const k of Object.keys(b.audits)){const au=b.audits[k];if(au.score!==null&&au.score<1&&b.categories.seo.auditRefs.some(x=>x.id===k))console.log(k,'::',(au.title||''),'::',(au.displayValue||''));}
 console.log('--- CHECKOUT LCP element ---');
 console.log(JSON.stringify(b.audits['largest-contentful-paint-element']&&b.audits['largest-contentful-paint-element'].details).slice(0,600));
 console.log('--- HOME render blocking ---');
 const c=await lh(BASE+'/',path.join(os.tmpdir(),'h.json'));
 console.log(JSON.stringify(c.audits['render-blocking-resources']&&c.audits['render-blocking-resources'].details).slice(0,700));
 console.log('HOME LCP elem:',JSON.stringify(c.audits['largest-contentful-paint-element']&&c.audits['largest-contentful-paint-element'].details).slice(0,600));
 console.log('HOME LCP phases:',JSON.stringify(c.audits['lcp-breakdown-insight']&&c.audits['lcp-breakdown-insight'].details).slice(0,600));
})();
