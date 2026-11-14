(function(root){
"use strict";
function calculate(v){
const n=(k)=>Number(v[k]??0);
const outcomes=n("outcomes"), attempts=n("attempts"), margin=n("margin");
if(!Number.isFinite(outcomes)||outcomes<=0) throw new Error("Successful outcomes must be greater than zero.");
if(!Number.isFinite(attempts)||attempts<1) throw new Error("Attempts per successful outcome must be at least 1.");
if(!Number.isFinite(margin)||margin<=0||margin>=100) throw new Error("Margin must be between 0 and 100.");
const variable=(n("llm")+n("tools"))*attempts;
const human=n("minutes")/60*n("hourly");
const fixed=n("hosting")+n("maintenance");
const monthly=outcomes*(variable+human)+fixed;
const unit=monthly/outcomes;
const monthlyFloor=monthly/(1-margin/100);
const setupFee=n("setup")*n("hourly")/(1-margin/100);
return {variable_cost_per_outcome:variable,human_cost_per_outcome:human,fixed_monthly_cost:fixed,monthly_delivery_cost:monthly,cost_per_outcome:unit,suggested_monthly_floor:monthlyFloor,suggested_setup_fee:setupFee,suggested_price_per_outcome:monthlyFloor/outcomes};
}
const api={calculate}; if(typeof module!=="undefined"&&module.exports) module.exports=api; root.AgentMarginCalculator=api;
})(typeof globalThis!=="undefined"?globalThis:this);