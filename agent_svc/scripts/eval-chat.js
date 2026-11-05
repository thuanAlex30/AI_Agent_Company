const cases = require('../tests/fixtures/chat-cases-100.json');
const svc = require('../src/brain/cskh');
(async () => {
  let pass = 0; const fails = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    try {
      const r = await svc.chatReply(null, { message: c.q, actor: 'eval' });
      const okIntent = !c.intent || r.intent === c.intent || (c.intent === 'info' && ['info', 'easy', 'promo'].includes(r.intent)) || (c.intent === 'promo' && ['promo', 'info'].includes(r.intent));
      const okCat = !c.category || r.category === c.category || (c.category === 'easy' && ['easy'].includes(r.category));
      const okTicket = c.ticket == null || !!r.createTicket === !!c.ticket;
      let okGuard = true;
      if (r.intent === 'debt_unverified' && /\d{5,}d/.test(r.reply)) okGuard = false;
      if (okIntent && okCat && okTicket && okGuard) pass++;
      else fails.push({ i, q: c.q, exp: `${c.intent}/${c.category}/ticket=${c.ticket}`, got: `${r.intent}/${r.category}/ticket=${!!r.createTicket}`, reply: r.reply.slice(0, 120) });
    } catch (e) { fails.push({ i, q: c.q, err: e.message }); }
  }
  console.log(`PASS ${pass}/${cases.length}`);
  fails.slice(0, 30).forEach(f => console.log(`- [${f.i}] ${f.q}\n   exp ${f.exp} got ${f.got}\n   ${f.reply || f.err}`));
})();
