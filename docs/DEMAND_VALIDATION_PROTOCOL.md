# AgentMargin Workbench: Demand Validation Protocol

## 1. उद्देश्य

यह पता लगाना कि AI automation consultants, छोटे agencies और agent builders को accepted outcome के आधार पर workflow cost और client pricing समझने की वास्तविक समस्या है या नहीं।

यह protocol market demand का प्रमाण नहीं है। परिणाम आने तक product hypothesis unvalidated रहेगा।

## 2. Hypothesis

Target user को इन लागतों का संयुक्त हिसाब रखने में कठिनाई होती है:
- LLM और tool usage प्रति attempt
- retries और unsuccessful attempts
- hosting/monitoring/maintenance
- human review और exception handling
- setup effort
- target gross margin के आधार पर quote floor

AgentMargin एक browser-only calculator के माध्यम से इन inputs को transparent unit economics में बदलता है।

## 3. अभी क्या सत्यापित है

- Browser-only calculator उपलब्ध है।
- Inputs में outcomes, LLM cost, tool cost, attempts, hosting, maintenance, human review, hourly cost, margin और setup effort शामिल हैं।
- Output में cost per outcome, monthly delivery cost, monthly floor, setup fee और per-outcome price शामिल हैं।
- Current code automated tests से covered है।

## 4. अभी क्या सत्यापित नहीं है

- कितने target users इस समस्या का सामना करते हैं।
- मौजूदा विकल्पों से dissatisfaction कितना है।
- User calculator पर भरोसा करता है या नहीं।
- कोई user भुगतान करेगा या नहीं।
- ₹999, ₹1,499 या US$19 pricing willingness-to-pay दर्शाती है या नहीं।
- कोई conversion rate, acquisition cost या recurring revenue सिद्ध नहीं है।

## 5. Low-cost validation sequence

### Stage 1: Problem interviews
कम-से-कम 10 वास्तविक target users से बातचीत करें। Product pitch देने से पहले पूछें:
1. हाल में किस AI workflow/service को deliver किया?
2. Cost और retries अभी कैसे track करते हैं?
3. Human review और maintenance cost कैसे जोड़ते हैं?
4. Client pricing तय करते समय सबसे बड़ी uncertainty क्या है?
5. पिछली बार गलत estimate से क्या परिणाम हुआ?

Evidence log में anonymized role, exact problem statement, current workaround और concrete recent example दर्ज करें। केवल “अच्छा idea है” को demand न मानें।

### Stage 2: Usability test
5 target users को बिना निर्देश दिए calculator इस्तेमाल करने दें। Observe करें:
- क्या वे input fields समझते हैं?
- क्या वे accepted outcome बनाम attempt का अंतर समझते हैं?
- क्या output उनके वास्तविक invoice/logs से reconcile होता है?
- कहाँ गलतफहमी या missing cost आती है?

### Stage 3: Behavioral signal
एक स्पष्ट landing page/demo और non-binding “request access” action के माध्यम से वास्तविक intent मापें। Fake scarcity, fabricated testimonials या unverified claims न हों।

### Stage 4: Paid validation
केवल तब test करें जब users समस्या और output usefulness की पुष्टि करें। Pricing को experiment label दें; भुगतान, refund और platform rules की पुष्टि के बिना checkout launch न करें।

## 6. Evidence standards

हर observation को इन categories में रखें:
- Direct evidence: user की वास्तविक घटना, invoice/log या observed task।
- Behavioral evidence: demo completion, repeat use, qualified request।
- Commercial evidence: वास्तविक भुगतान, refund/chargeback के बाद net amount।
- Weak signal: compliments, hypothetical interest, survey-only intent।

Revenue केवल cleared, evidenced sale से count होगा। Gross checkout amount को net revenue न कहें।

## 7. Stop / iterate criteria

- यदि users cost problem पहचानते हैं पर calculator नहीं समझते: UX सुधारें।
- यदि वे पहले से spreadsheet से संतुष्ट हैं: differentiation स्पष्ट करें या hypothesis बदलें।
- यदि वास्तविक cost inputs उपलब्ध नहीं: data capture workflow की आवश्यकता जाँचें।
- यदि repeated use नहीं: subscription hypothesis को रोकें।
- यदि paid intent नहीं: payment integration पर समय/पैसा खर्च न करें।

## 8. Reporting

हर experiment के साथ तारीख, sample size, recruitment method, raw notes reference, exclusions, observed results और limitations दर्ज करें। छोटे convenience sample से पूरे बाजार पर निष्कर्ष न निकालें।

वर्तमान verified revenue: ₹0.
वर्तमान demand status: UNVALIDATED.
