# Government/institution logos needed here

Claude's sandbox can't browse to these external government/org sites to
download their real logo files (network access here is restricted to
code package registries only — npm, PyPI, GitHub — not arbitrary
websites). Until each file below exists, that institution's card shows
a clean text-based fallback instead of a fake/favicon logo.

To complete this: visit each official site's press/media/brand page
(most government agencies have one), download their real logo, and
save it here with the exact filename listed — the page already
expects these exact paths and will pick them up automatically, no
code changes needed.

- [ ] ircc.svg — https://www.canada.ca/en/services/immigration-citizenship.html
- [ ] make-it-in-germany.svg — https://www.make-it-in-germany.com/
- [ ] home-affairs-australia.svg — https://www.homeaffairs.gov.au/
- [ ] gov-uk.svg — https://www.gov.uk/
- [ ] ind-netherlands.svg — https://ind.nl/en
- [ ] enterprise-ireland-gov.svg — https://enterprise.gov.ie/en/
- [ ] immigration-nz.svg — https://www.immigration.govt.nz/
- [ ] isa-japan.svg — https://www.moj.go.jp/isa/
- [ ] mom-singapore.svg — https://www.mom.gov.sg/
- [ ] sem-switzerland.svg — https://www.sem.admin.ch/
- [ ] ministere-interieur-france.svg — https://www.interieur.gouv.fr/
- [ ] invest-in-canada.svg — https://www.investcanada.ca/
- [ ] invest-ontario.svg — https://www.investontario.ca/
- [ ] invest-alberta.svg — https://investalberta.ca/
- [ ] austrade.svg — https://www.austrade.gov.au/
- [ ] invest-victoria.svg — https://invest.vic.gov.au/
- [ ] edb-singapore.svg — https://www.edb.gov.sg/
- [ ] enterprise-singapore.svg — https://www.enterprisesg.gov.sg/
- [ ] gtai.svg — https://www.gtai.de/
- [ ] business-france.svg — https://www.businessfrance.fr/en
- [ ] rvo-netherlands.svg — https://english.rvo.nl/
- [ ] nzte.svg — https://www.nzte.govt.nz/
- [ ] innovate-uk.svg — https://www.ukri.org/councils/innovate-uk/
- [ ] daad.svg — https://www.daad.de/en/
- [ ] chevening.svg — https://www.chevening.org/
- [ ] mext-japan.svg — https://www.mext.go.jp/en/
- [ ] erasmus-plus.svg — https://erasmus-plus.ec.europa.eu/
- [ ] ukri.svg — https://www.ukri.org/
- [ ] research-ireland.svg — https://www.researchireland.ie/
- [ ] destination-canada.svg — https://www.destinationcanada.com/
- [ ] tourism-australia.svg — https://www.australia.com/
- [ ] visitbritain.svg — https://www.visitbritain.org/
- [ ] singapore-tourism-board.svg — https://www.stb.gov.sg/
- [ ] atout-france.svg — https://www.atout-france.fr/

PNG works too if SVG isn't available — just keep the same filename
minus the extension change (e.g. `ircc.png`) and update `logoUrl` in
`src/data/officialPartners.ts` to match.
