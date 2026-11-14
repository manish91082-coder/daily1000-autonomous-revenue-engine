(function(){
"use strict";
const form=document.getElementById("model");let latest=null;
const money=n=>"₹"+Number(n).toLocaleString("en-IN",{maximumFractionDigits:2});
function values(){return Object.fromEntries(new FormData(form).entries());}
function render(){
try{latest=AgentMarginCalculator.calculate(values());
document.getElementById("unit").textContent=money(latest.cost_per_outcome);
document.getElementById("monthly").textContent=money(latest.monthly_delivery_cost);
document.getElementById("price").textContent=money(latest.suggested_monthly_floor);
document.getElementById("setupFee").textContent=money(latest.suggested_setup_fee);
document.getElementById("perOutcome").textContent=money(latest.suggested_price_per_outcome);
document.getElementById("warning").textContent="Planning estimate only. Compare with real invoices, production logs and client acceptance data.";
}catch(e){document.getElementById("warning").textContent=e.message;latest=null;}
}
form.addEventListener("submit",e=>{e.preventDefault();render();});
form.addEventListener("input",render);
document.getElementById("csv").addEventListener("click",()=>{
if(!latest)render();if(!latest)return;
const rows=[["Metric","Value"],...Object.entries(latest)];
const csv=rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(",")).join("\n");
const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="agentmargin-unit-economics.csv";a.click();URL.revokeObjectURL(url);
});
render();
})();