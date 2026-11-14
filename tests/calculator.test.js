const test=require("node:test");
const assert=require("node:assert/strict");
const {calculate}=require("../site/calculator.js");
const base={outcomes:500,llm:.8,tools:.2,attempts:1.25,hosting:1500,maintenance:3000,minutes:2,hourly:300,margin:60,setup:8};

test("calculates variable cost including retry attempts",()=>{
 const r=calculate(base); assert.equal(r.variable_cost_per_outcome,1.25);
});
test("calculates human review cost per accepted outcome",()=>{
 const r=calculate(base); assert.equal(r.human_cost_per_outcome,10);
});
test("calculates monthly fixed costs",()=>{
 const r=calculate(base); assert.equal(r.fixed_monthly_cost,4500);
});
test("calculates monthly delivery cost",()=>{
 const r=calculate(base); assert.equal(r.monthly_delivery_cost,10125);
});
test("calculates fully loaded cost per outcome",()=>{
 const r=calculate(base); assert.equal(r.cost_per_outcome,20.25);
});
test("applies gross margin to monthly price floor",()=>{
 const r=calculate(base); assert.equal(r.suggested_monthly_floor,25312.5);
});
test("calculates per-outcome client price",()=>{
 const r=calculate(base); assert.equal(r.suggested_price_per_outcome,50.625);
});
test("calculates setup fee using target margin",()=>{
 const r=calculate(base); assert.equal(r.suggested_setup_fee,6000);
});
test("rejects zero successful outcomes",()=>assert.throws(()=>calculate({...base,outcomes:0})));
test("rejects attempts below one",()=>assert.throws(()=>calculate({...base,attempts:.5})));
test("rejects margin at or above 95 percent",()=>assert.throws(()=>calculate({...base,margin:95})));
test("rejects negative variable costs",()=>assert.throws(()=>calculate({...base,llm:-.01})));
test("rejects negative fixed costs",()=>assert.throws(()=>calculate({...base,hosting:-1})));
test("rejects negative human review time",()=>assert.throws(()=>calculate({...base,minutes:-1})));
test("rejects non-finite numeric input",()=>assert.throws(()=>calculate({...base,llm:"not-a-number"})));
test("zero-cost workflow can be calculated without division errors",()=>{
 const r=calculate({...base,llm:0,tools:0,hosting:0,maintenance:0,minutes:0,hourly:0,setup:0});
 assert.equal(r.monthly_delivery_cost,0); assert.equal(r.cost_per_outcome,0);
});
