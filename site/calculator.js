(function(root){
"use strict";
function calculate(v){
const fields=["outcomes","llm","tools","attempts","hosting","maintenance","minutes","hourly","margin","setup"];
const n={};
for(const key of fields){
  n[key]=Number(v[key]??0);
  if(!Number.isFinite(n[key])) throw new Error(key+" must be a finite number.");
}
if(n.outcomes<=0) throw new Error("Successful outcomes must be greater than zero.");
for(const key of ["llm","tools","hosting","maintenance","minutes","hourly","setup"]){
  if(n[key]<0) throw new Error(key+" cannot be negative.");
}
if(n.attempts<1) throw new Error("Attempts per successful outcome must be at least 1.");
if(n.margin<=0||n.margin>=95) throw new Error("Margin must be greater than 0 and below 95.");
const variable=(n.llm+n.tools)*n.attempts;
const human=n.minutes/60*n.hourly;
const fixed=n.hosting+n.maintenance;
const monthly=n.outcomes*(variable+human)+fixed;
const unit=monthly/n.outcomes;
const monthlyFloor=monthly/(1-n.margin/100);
const setupFee=n.setup*n.hourly/(1-n.margin/100);
return {
 variable_cost_per_outcome:variable,
 human_cost_per_outcome:human,
 fixed_monthly_cost:fixed,
 monthly_delivery_cost:monthly,
 cost_per_outcome:unit,
 suggested_monthly_floor:monthlyFloor,
 suggested_setup_fee:setupFee,
 suggested_price_per_outcome:monthlyFloor/n.outcomes
};
}
const api={calculate};
if(typeof module!=="undefined"&&module.exports) module.exports=api;
root.AgentMarginCalculator=api;
})(typeof globalThis!=="undefined"?globalThis:this);
