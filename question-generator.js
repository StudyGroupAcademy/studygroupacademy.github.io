// Original, parameterised GCSE-style practice question generation. No external API required.
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (items) => items[rnd(0, items.length - 1)];
const shuffle = (items) => [...items].map(value => ({ value, sort: Math.random() })).sort((a,b)=>a.sort-b.sort).map(x=>x.value);
const normalise = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[−–]/g,"-").replace(/×/g,"*").replace(/÷/g,"/").replace(/\s+/g,"").replace(/[£$,]/g,"").replace(/%/g,"%").replace(/\.0+(?=%|$)/g,"").replace(/\u00a0/g,"");
const closeNumber = (raw, expected, tolerance = 1e-8) => {
  const text = String(raw).trim().replace(/[£$,]/g,"").replace(/%$/," ").trim();
  if (!text) return false;
  if (/^-?\d+(?:\.\d+)?(?:\/\d+)?$/.test(text)) {
    const n = text.includes("/") ? Number(text.split("/")[0]) / Number(text.split("/")[1]) : Number(text);
    return Number.isFinite(n) && Math.abs(n - expected) <= tolerance;
  }
  return false;
};

function parseLinearExpression(raw) {
  const source = String(raw || "").toLowerCase().replace(/\s+/g, "").replace(/−/g, "-").replace(/\*/g, "");
  if (!source || !/^[+-]?(?:\d*\.?\d*x|\d+\.?\d*|x)(?:[+-](?:\d*\.?\d*x|\d+\.?\d*|x))*$/.test(source)) return null;
  const terms = source.match(/[+-]?[^+-]+/g) || [];
  let x = 0, constant = 0;
  for (const term of terms) {
    if (term.includes("x")) {
      const coefficient = term.replace("x", "");
      x += coefficient === "" || coefficient === "+" ? 1 : coefficient === "-" ? -1 : Number(coefficient);
    } else constant += Number(term);
  }
  return Number.isFinite(x) && Number.isFinite(constant) ? { x, constant } : null;
}

function generateMathQuestion(tier, index) {
  const level = tier === "Higher" ? 1 : 0;
  const kind = pick(["equation","equation","percentage","gradient","expand","simplify","ratio","fraction"]);
  if (kind === "equation") {
    const a = rnd(2, 5 + level * 5), x = rnd(-8, 12), b = rnd(-12, 15), c = a*x+b;
    const sign = b < 0 ? "−" : "+";
    return { topic:"Algebra", prompt:`Solve ${a}x ${sign} ${Math.abs(b)} = ${c}.`, answer:`x = ${x}`, accepts:[String(x),`x=${x}`], numeric:x, marks:2, steps:[`Undo ${sign === "+" ? "addition" : "subtraction"} by doing the opposite to both sides: ${a}x = ${c-b}.`,`Divide both sides by ${a}: x = ${x}.`,`Check: ${a} × ${x} ${sign} ${Math.abs(b)} = ${c}.`], hint:"Keep the equation balanced: do the same operation to both sides." };
  }
  if (kind === "percentage") {
    const original = pick([40,60,80,120,150,200,240,320]); const pct = pick([5,10,12,15,20,25,30,level?35:20]); const increase = Math.random() > .5; const change = original*pct/100; const answer = increase ? original+change : original-change;
    return { topic:"Ratio and proportion", prompt:`A price of £${original} ${increase?"increases":"decreases"} by ${pct}%. Find the new price.`, answer:`£${answer.toFixed(2).replace(/\.00$/,"")}`, accepts:[String(answer),`£${answer}`,answer.toFixed(2)], numeric:answer, marks:2, steps:[`Find ${pct}% of £${original}: ${pct}/100 × ${original} = £${change}.`,`Since the price ${increase?"increases":"decreases"}, ${increase?"add":"subtract"} the change.`,`New price = £${answer}.`], hint:"Work out the percentage change using the original price, then add or subtract it." };
  }
  if (kind === "gradient") {
    const x1=rnd(-3,3), x2=x1+rnd(2,6), y1=rnd(-4,4), m=rnd(-3,4)||2, y2=y1+m*(x2-x1);
    return { topic:"Graphs", prompt:`Find the gradient of the straight line through (${x1}, ${y1}) and (${x2}, ${y2}).`, answer:String(m), accepts:[String(m),`gradient=${m}`], numeric:m, marks:2, steps:[`Change in y = ${y2} − (${y1}) = ${y2-y1}.`,`Change in x = ${x2} − (${x1}) = ${x2-x1}.`,`Gradient = change in y ÷ change in x = ${y2-y1} ÷ ${x2-x1} = ${m}.`], hint:"Gradient = vertical change ÷ horizontal change. Keep negative signs." };
  }
  if (kind === "expand") {
    const a=rnd(2,5), b=rnd(1,9), c=rnd(-6,8), constant=a*c;
    return { topic:"Algebra", prompt:`Expand and simplify ${a}(x ${c<0?"−":"+"} ${Math.abs(c)}).`, answer:`${a}x ${constant<0?"−":"+"} ${Math.abs(constant)}`, accepts:[`${a}x${constant<0?"-":"+"}${Math.abs(constant)}`,`${a}x${constant<0?"":"+"}${constant}`], linear:{x:a,constant}, marks:2, steps:[`Multiply ${a} by x to get ${a}x.`,`Multiply ${a} by ${c} to get ${constant}.`,`Write the result: ${a}x ${constant<0?"−":"+"} ${Math.abs(constant)}.`], hint:"Multiply every term inside the bracket by the number outside." };
  }
  if (kind === "simplify") {
    const a=rnd(2,9), b=rnd(2,9), c=rnd(1,9); let d=rnd(1,9); while (d===b) d=rnd(1,9);
    return { topic:"Algebra", prompt:`Simplify ${a}x + ${b} + ${c}x − ${d}.`, answer:`${a+c}x ${b-d<0?"−":"+"} ${Math.abs(b-d)}`, accepts:[`${a+c}x${b-d<0?"-":"+"}${Math.abs(b-d)}`], linear:{x:a+c,constant:b-d}, marks:2, steps:[`Collect the x terms: ${a}x + ${c}x = ${a+c}x.`,`Collect the constants: ${b} − ${d} = ${b-d}.`,`Final expression: ${a+c}x ${b-d<0?"−":"+"} ${Math.abs(b-d)}.`], hint:"Collect like terms. Terms containing x and constants are different types." };
  }
  if (kind === "ratio") {
    const a=rnd(2,5), b=rnd(2,6), multiplier=rnd(2,8), total=(a+b)*multiplier;
    return { topic:"Ratio", prompt:`Share £${total} in the ratio ${a}:${b}. How much does the first person receive?`, answer:`£${a*multiplier}`, accepts:[String(a*multiplier),`£${a*multiplier}`], numeric:a*multiplier, marks:2, steps:[`Total parts = ${a} + ${b} = ${a+b}.`,`One part = £${total} ÷ ${a+b} = £${multiplier}.`,`First share = ${a} × £${multiplier} = £${a*multiplier}.`], hint:"Add the ratio parts first, then divide the total by that number." };
  }
  const denominator=pick([4,5,6,8,10,12]), n1=rnd(1,denominator-1), n2=rnd(1,denominator-1), sum=n1+n2;
  const gcd=(a,b)=>b?gcd(b,a%b):a; const g=gcd(sum,denominator);
  return { topic:"Number", prompt:`Calculate ${n1}/${denominator} + ${n2}/${denominator}. Give your answer in its simplest form.`, answer:`${sum/g}/${denominator/g}`, accepts:[`${sum/g}/${denominator/g}`,`${sum/denominator}`], marks:2, steps:[`The denominators are already equal, so add the numerators: ${n1} + ${n2} = ${sum}.`,`The fraction is ${sum}/${denominator}.`,`Divide numerator and denominator by ${g}: ${sum/g}/${denominator/g}.`], hint:"With equal denominators, add the numerators and simplify." };
}


export { closeNumber, generateMathQuestion, parseLinearExpression, shuffle };
