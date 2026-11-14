# QA और Release Gates

यह दस्तावेज़ वर्तमान browser-only AgentMargin prototype के लिए operational acceptance criteria तय करता है। यह किसी पूर्ण audit या deployment का दावा नहीं करता।

## वर्तमान सत्यापित baseline

- GitHub main पर calculator और UI मौजूद हैं।
- Calculator suite में 16 automated tests हैं।
- GitHub Actions Run #4, commit 44c8e417, सफल रहा।
- Full v0.1.2 audited source archive का repository import अभी अपूर्ण है।
- Browser visual QA और production deployment अभी verified नहीं हैं।

## Gate A: Source integrity

- [ ] Full audited source package या उसके exact source files main में उपलब्ध हों।
- [ ] package.json version 0.1.2 हो।
- [ ] README, docs, state, agents, tests और site tree की completeness verify हो।
- [ ] Imported source पर remote CI pass हो।
- [ ] Archive checksum और imported source provenance दर्ज हों।

## Gate B: Browser functional QA

कम-से-कम Chromium और एक mobile viewport पर manually/automatically verify करें:

- [ ] Initial page load और default values।
- [ ] हर numeric input बदलने पर परिणाम तुरंत अपडेट हों।
- [ ] Invalid/empty/negative/NaN inputs स्पष्ट error दें, stale result को valid न दिखाएँ।
- [ ] CSV export में header, values और escaping सही हों।
- [ ] Print view में report readable हो।
- [ ] 320px, 375px, 768px और desktop widths पर horizontal overflow न हो।
- [ ] Keyboard-only navigation, visible focus और label association।
- [ ] Browser console में uncaught errors न हों।
- [ ] Network panel में third-party requests न हों।

## Gate C: Privacy and security

- [ ] कोई analytics, tracker, cookie, external script, network upload या persistent browser storage नहीं।
- [ ] CSV export local browser action रहे।
- [ ] कोई secret, API key या personal data repository में न हो।
- [ ] Static hosting पर HTTPS और correct content type verify हो।
- [ ] Dependency footprint न्यूनतम रहे; नई dependency के लिए स्पष्ट आवश्यकता और audit हो।

## Gate D: Production release

Production deployment तभी:
1. Gate A, B और C pass हों।
2. Exact deployed commit SHA दर्ज हो।
3. Public HTTPS URL से smoke test pass हो।
4. Rollback path और release note उपलब्ध हों।

## Release status vocabulary

- PASS: evidence उपलब्ध और acceptance criterion पूरा।
- FAIL: criterion test हुआ और असफल रहा।
- BLOCKED: आवश्यक access/tool/source उपलब्ध नहीं।
- NOT TESTED: अभी परीक्षण नहीं हुआ।

किसी भी NOT TESTED या BLOCKED item को PASS न दर्शाएँ।
