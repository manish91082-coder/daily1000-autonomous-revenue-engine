const test=require("node:test");const assert=require("node:assert/strict");const {calculate}=require("../site/calculator.js");
const base={outcomes:500,llm:.8,tools:.2,attempts:1.25,hosting:1500,maintenance:3000,minutes:2,hourly:300,margin:60,setup:8};
test("calculates monthly and unit cost with retries, fixed cost and review",()=>{const r=calculate(base);assert.equal(r.variable_cost_per_outcome,1.25);assert.equal(r.human_cost_per_outcome,10);assert.equal(r.fixed_monthly_cost,4500);assert.equal(r.monthly_delivery_cost,10125);assert.equal(r.cost_per_outcome,20.25);});
test("applies target gross margin to monthly floor",()=>{const r=calculate(base);assert.equal(r.suggested_monthly_floor,25312.5);assert.equal(r.suggested_price_per_outcome,50.625);});
test("rejects zero outcomes",()=>assert.throws(()=>calculate({...base,outcomes:0})));
test("rejects attempts below one",()=>assert.throws(()=>calculate({...base,attempts:.5})));
test("rejects invalid margin",()=>assert.throws(()=>calculate({...base,margin:100})));
