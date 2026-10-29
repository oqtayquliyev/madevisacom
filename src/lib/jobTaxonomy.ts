// Job categories for the /jobs "Category" filter: ~200 specific roles in
// ~30 groups, matched from the job title (and, when the title says
// nothing useful, the department the source gave).
//
// Rules are tried IN ORDER and the first match wins, so specific roles
// come before generic ones ("Sales Engineer" before "Engineer", "Data
// Engineer" before "Software Engineer", "Teaching Assistant" before
// "Teacher"). Every pattern is word-bounded where it matters, so "intern"
// never matches "international" and "pr" never matches "product".
// A job that matches nothing has no category — it still shows under
// "All categories" rather than being forced into a wrong one.

export type JobCategory = { label: string; group: string };

type Rule = readonly [label: string, group: string, pattern: RegExp];

const G = {
  software: 'Software & IT',
  data: 'Data & AI',
  product: 'Product & Design',
  eng: 'Engineering',
  science: 'Science & Research',
  health: 'Healthcare & Medical',
  finance: 'Finance & Accounting',
  sales: 'Sales & Business Development',
  support: 'Customer Service & Support',
  marketing: 'Marketing & Communications',
  hr: 'Human Resources',
  ops: 'Operations & Supply Chain',
  manufacturing: 'Manufacturing & Production',
  trades: 'Skilled Trades',
  construction: 'Construction & Architecture',
  hospitality: 'Hospitality & Tourism',
  education: 'Education & Training',
  legal: 'Legal',
  admin: 'Administration & Office',
  media: 'Media & Creative',
  public: 'Public Sector & Nonprofit',
  security: 'Security & Defence',
  consulting: 'Consulting & Management',
  energy: 'Energy & Environment',
  agriculture: 'Agriculture & Food',
  aviation: 'Aviation & Maritime',
  wellness: 'Beauty, Sports & Wellness',
  transport: 'Transport & Driving',
  realEstate: 'Real Estate',
  retail: 'Retail',
} as const;

const r = (label: string, group: string, pattern: string): Rule => [label, group, new RegExp(pattern, 'i')];

/** Ordered: specific before generic. */
const RULES: Rule[] = [
  // ---- Leadership that would otherwise be caught by a function word ----
  r('Engineering Manager', G.software, '\\b(?:engineering manager|head of engineering|director of engineering|engineering director|vp,? (?:of )?engineering|cto\\b|chief technology officer)'),
  r('IT Manager', G.software, '\\b(?:it (?:manager|director|lead|leiter)|head of it\\b|cio\\b|chief information officer|it-leiter)'),
  r('Product Manager', G.product, '\\b(?:product (?:manager|owner|lead|director)|head of product|vp,? (?:of )?product|chief product officer|produktmanager|chef de produit)'),
  r('Product Marketing', G.marketing, '\\bproduct marketing'),

  // ---- Sales roles with technical words in them ----
  r('Sales Engineer', G.sales, '\\b(?:sales engineer|pre-?sales|solutions? (?:engineer|consultant)|technical sales|field application engineer)'),
  r('Customer Success', G.support, '\\b(?:customer success|client success|onboarding (?:specialist|manager)|implementation (?:consultant|manager|specialist))'),
  r('Technical Support', G.support, '\\b(?:technical support|support engineer|application support|product support|tech support|1st level|2nd level|first[- ]line support|second[- ]line support)'),

  // ---- Data & AI ----
  r('Machine Learning Engineer', G.data, '\\b(?:machine learning|ml (?:engineer|ops|scientist)|mlops|deep learning|computer vision|nlp\\b|natural language|llm|genai|generative ai|ai (?:engineer|developer|researcher|scientist|specialist|architect)|artificial intelligence|kuenstliche intelligenz|künstliche intelligenz)'),
  r('Data Scientist', G.data, '\\bdata scien'),
  r('Data Engineer', G.data, '\\b(?:data (?:engineer|platform|architect|warehouse|ops)|analytics engineer|etl\\b|big data|databricks|snowflake|dbt\\b)'),
  r('Data Analyst', G.data, '\\b(?:data analy|bi (?:analyst|developer|engineer|consultant)|business intelligence|power ?bi|tableau|reporting analyst|insights analyst|datenanalyst)'),
  r('Database Administrator', G.data, '\\b(?:database|dba\\b|sql (?:server|developer|dba)|oracle dba|postgres)'),
  r('Statistician', G.data, '\\b(?:statistic|biostatistic|statistical programmer)'),
  r('Bioinformatics', G.data, '\\b(?:bioinformatic|computational biolog)'),

  // ---- Software & IT (specific first) ----
  r('Cybersecurity', G.software, '\\b(?:cyber|infosec|information security|it security|security (?:engineer|analyst|architect|operations|consultant|specialist|researcher|manager)|soc (?:analyst|engineer)|penetration|pentest|appsec|devsecops|iam\\b|identity (?:and|&) access|threat|vulnerability|incident response|informationssicherheit)'),
  r('DevOps & SRE', G.software, '\\b(?:devops|site reliability|sre\\b|platform engineer|infrastructure engineer|kubernetes|build engineer|release engineer|ci/?cd)'),
  r('Cloud Engineer', G.software, '\\b(?:cloud (?:engineer|architect|consultant|developer|specialist|administrator)|aws\\b|azure\\b|gcp\\b|google cloud)'),
  r('Solutions Architect', G.software, '\\b(?:solutions? architect|enterprise architect|software architect|technical architect|it architect|application architect|integration architect)'),
  r('QA & Testing', G.software, '\\b(?:sdet|qa\\b|quality assurance (?:engineer|analyst|tester)|test (?:automation|engineer|analyst|manager|lead)|automation tester|software test|tester\\b|testing|testautomat)'),
  r('Mobile Developer', G.software, '\\b(?:ios|android|mobile (?:developer|engineer|app)|flutter|react native|swift developer|kotlin)'),
  r('Frontend Developer', G.software, '\\b(?:front[- ]?end|react(?:\\.js|js)?\\b|angular|vue(?:\\.js)?\\b|ui (?:developer|engineer)|web developer|webentwickler|javascript|typescript)'),
  r('Full Stack Developer', G.software, '\\bfull[- ]?stack'),
  r('Backend Developer', G.software, '\\b(?:back[- ]?end|java\\b|\\.net\\b|c#|golang|go developer|node(?:\\.js|js)?\\b|php\\b|ruby|python (?:developer|engineer)|django|spring boot|scala\\b|rust (?:developer|engineer)|api (?:developer|engineer)|c\\+\\+)'),
  r('Embedded & Firmware', G.software, '\\b(?:embedded|firmware|fpga|rtos|autosar|bsp\\b|device driver)'),
  r('Game Developer', G.software, '\\b(?:game (?:developer|designer|programmer|engineer|artist|producer)|gameplay|unity (?:developer|engineer)|unreal)'),
  r('Blockchain Developer', G.software, '\\b(?:blockchain|web3|solidity|smart contract|crypto (?:engineer|developer))'),
  r('ERP & CRM Consultant', G.software, '\\b(?:sap\\b|erp\\b|salesforce|servicenow|dynamics 365|microsoft dynamics|oracle (?:fusion|ebs|cloud)|workday (?:consultant|analyst|specialist)|netsuite|hubspot (?:admin|developer)|crm (?:developer|consultant|administrator))'),
  r('Network Engineer', G.software, '\\b(?:network (?:engineer|administrator|architect|technician|specialist|security)|netzwerk|cisco|ccna|ccnp|telecom(?:munications)? engineer|voip)'),
  r('System Administrator', G.software, '\\b(?:system(?:s)? (?:administrator|admin|engineer)|sysadmin|linux (?:admin|engineer)|windows (?:admin|engineer)|systemadministrator|systemingenieur|it (?:administrator|systems)|m365|microsoft 365|active directory|vmware|(?:windows |linux )?server (?:administrator|admin|engineer|specialist))'),
  r('IT Support & Helpdesk', G.software, '\\b(?:help ?desk|service ?desk|it (?:support|technician|specialist|analyst|coordinator)|desktop support|end user support|it-support|deskside|workplace support|field technician|informatiker)'),
  r('IT Project Manager', G.software, '\\b(?:scrum master|agile coach|technical program manager|it project manager|delivery manager|release manager|it projektleiter|product delivery)'),
  r('Technical Writer', G.software, '\\b(?:technical writer|documentation (?:specialist|engineer)|technical author|technischer redakteur)'),
  r('UX & UI Designer', G.product, '\\b(?:ux|ui\\b|ui/ux|user experience|user interface|product designer|interaction designer|service designer|design system)'),
  r('IT Consultant', G.software, '\\b(?:it[- ]consultant|technology consultant|it-berater|consultant it|digital consultant)'),
  r('Software Engineer', G.software, '\\b(?:software|developer|programmer|programmierer|coder\\b|entwickler|développeur|developpeur|desarrollador|ontwikkelaar|sviluppatore|application engineer|web engineer|engineer,? (?:backend|frontend|platform))'),

  // ---- Product & Design ----
  r('UX Researcher', G.product, '\\b(?:ux research|user research|design research)'),
  r('Graphic Designer', G.product, '\\b(?:graphic|grafik|visual designer|brand designer|communication designer|kommunikationsdesign|mediengestalter|layout|dtp\\b|packaging design)'),
  r('Motion & 3D Designer', G.product, '\\b(?:motion (?:designer|graphics)|animator|animation|3d (?:artist|designer|modeler|generalist)|vfx|cgi\\b|visual effects)'),
  r('Industrial Designer', G.product, '\\b(?:industrial design|product design engineer|industriedesign)'),
  r('Interior Designer', G.product, '\\binterior (?:design|architect)|innenarchitekt'),
  r('Fashion Designer', G.product, '\\b(?:fashion|textile design|apparel|garment|pattern maker|modedesign)'),
  r('Creative Director', G.product, '\\b(?:creative director|art director|design director|head of design|design lead|creative lead)'),

  // ---- Science & Research (before healthcare / engineering) ----
  r('Clinical Research', G.science, '\\b(?:clinical (?:research|trial|study|operations|data|project)|cra\\b|clinical scientist|site monitor|study (?:manager|coordinator)|pharmacovigilance|drug safety|klinische)'),
  r('Medical Affairs', G.science, '\\b(?:medical (?:science liaison|affairs|advisor|adviser|writer|information)|msl\\b|medical scientific)'),
  r('Regulatory Affairs', G.science, '\\b(?:regulatory|zulassung|registration specialist)'),
  r('Chemist', G.science, '\\b(?:chemist|chemie|chimiste|analytical (?:scientist|chemistry|development)|formulation)'),
  r('Biologist & Lab Scientist', G.science, '\\b(?:biolog|microbiolog|molecular|cell (?:culture|biology)|immunolog|genomic|laborator|lab (?:technician|assistant|scientist|manager|analyst)|labor(?:ant|techniker)|biotech|virolog|protein)'),
  r('Pharmaceutical Scientist', G.science, '\\b(?:pharmaceutical|drug (?:development|discovery)|medicinal chem|pharmacolog|toxicolog|dmpk|cmc\\b)'),
  r('Physicist & Mathematician', G.science, '\\b(?:physicist|physik|mathematician|mathematiker|optics|photonics|quantum)'),
  r('Research Scientist', G.science, '\\b(?:scientist|researcher|research (?:associate|fellow|assistant|scientist)|postdoc|post-doc|phd|doktorand|wissenschaftl|chercheur|investigador)'),

  // ---- Healthcare & Medical ----
  r('Doctor & Physician', G.health, '\\b(?:physician|doctor|surgeon|anaesthe|anesthe|radiologist|psychiatrist|paediatric|pediatric|cardiolog|oncolog|neurolog|dermatolog|general practitioner|gp\\b|hospitalist|resident physician|consultant physician|medical (?:doctor|officer|director)|(?:fach|ober|assistenz|chef)?ärzt|arzt\\b|médecin|medico|médico|internist|urolog|gynaecolog|gynecolog|obstetric|ophthalmolog)'),
  r('Nurse Practitioner & Midwife', G.health, '\\b(?:nurse practitioner|midwi|hebamme|advanced practice|physician assistant)'),
  r('Nurse', G.health, '\\b(?:nurse|nursing|rn\\b|lpn\\b|pflegefach|krankenpfleg|gesundheits- und krankenpfleg|pflegekraft|infirmi|enfermer|verpleegkundige|infermier)'),
  r('Pharmacist', G.health, '\\b(?:pharmacist|pharmacy|apothek|pharmacien|farmac)'),
  r('Dentist & Dental', G.health, '\\b(?:dentist|dental|orthodont|zahn|dentiste)'),
  r('Physiotherapist & Therapist', G.health, '\\b(?:physiotherap|physical therap|occupational therap|speech (?:therap|language)|respiratory therap|ergotherap|logopäd|kinésithérap|rehabilitation|chiropract|osteopath)'),
  r('Psychologist & Counsellor', G.health, '\\b(?:psycholog|psychotherap|counsell?or|mental health|behavioral health|behavioural health|(?<!massage )therapist)'),
  r('Radiographer & Medical Technologist', G.health, '\\b(?:radiograph|sonograph|ultrasound|mri\\b|ct technolog|x-ray|imaging technolog|medical technolog|mta\\b|phlebotom|dialysis|cardiac technician|perfusion)'),
  r('Paramedic & Emergency', G.health, '\\b(?:paramedic|emt\\b|emergency medical|ambulance|notfallsanitäter|rettungs)'),
  r('Care Worker', G.health, '\\b(?:caregiver|care (?:assistant|worker|aide|giver)|carer|support worker|home health|nursing assistant|cna\\b|healthcare assistant|pflegehelfer|pflegeassistent|altenpfleg|aide-soignant|personal care)'),
  r('Veterinarian', G.health, '\\b(?:veterinar|vet (?:tech|nurse|surgeon)|tierarzt|tiermedizin|animal (?:care|health))'),
  r('Dietitian & Nutritionist', G.health, '\\b(?:dietitian|dietician|nutrition|ernährung)'),
  r('Optometrist & Optician', G.health, '\\b(?:optometr|optician|augenoptik|audiolog|hearing aid)'),
  r('Healthcare Administration', G.health, '\\b(?:medical (?:assistant|secretary|receptionist|coder|coding|billing|records)|patient (?:coordinator|services|access|care coordinator)|practice manager|health information|mfa\\b|medizinische fachangestellte|healthcare administrat|hospital administrat|clinic (?:manager|coordinator))'),

  // ---- Finance & Accounting ----
  r('Actuary', G.finance, '\\bactuar|aktuar'),
  r('Quantitative Analyst', G.finance, '\\b(?:quant\\b|quantitative (?:analyst|researcher|developer|trader)|algorithmic trading)'),
  r('Trader', G.finance, '\\b(?:trader|trading (?:analyst|desk|operations)|sales ?& ?trading|energy trading)'),
  r('Investment Banking & M&A', G.finance, '\\b(?:investment bank|m&a|mergers|capital markets|corporate finance|private equity|venture capital|leveraged finance|debt capital|equity capital|deal advisory|transaction services)'),
  r('Asset & Wealth Management', G.finance, '\\b(?:portfolio manager|asset management|wealth|fund (?:manager|accountant|administrator|operations)|investment (?:analyst|manager|associate|specialist)|equity research|private bank|family office|financial advisor|financial adviser|financial planner)'),
  r('Risk Management', G.finance, '\\b(?:risk (?:analyst|manager|management|officer|modell|specialist)|credit risk|market risk|operational risk|risikomanag)'),
  r('Compliance & AML', G.finance, '\\b(?:compliance|aml\\b|anti-money|money laundering|kyc\\b|financial crime|sanctions|fraud)'),
  r('Auditor', G.finance, '\\b(?:audit|auditor|wirtschaftsprüf|prüfungsassistent|revision|commissaire aux comptes)'),
  r('Tax Specialist', G.finance, '\\b(?:tax\\b|taxation|steuer|fiscal|fiscalist|transfer pricing|vat\\b)'),
  r('Payroll', G.finance, '\\b(?:payroll|lohnbuchhalt|entgeltabrechnung|gehaltsabrechnung|paie\\b)'),
  r('Treasury', G.finance, '\\b(?:treasury|cash management|treasurer)'),
  r('Financial Controller', G.finance, '\\b(?:controller|controlling|financial reporting|consolidation|fp&a|financial planning|budget analyst)'),
  r('Financial Analyst', G.finance, '\\b(?:financial analyst|finance analyst|finanzanalyst|investment analyst|valuation|credit analyst|finance business partner)'),
  r('Accountant', G.finance, '\\b(?:accountant|accounting|accounts (?:payable|receivable)|bookkeep|buchhalt|finanzbuchhalt|bilanzbuchhalt|general ledger|comptab|contable|contador|boekhoud|billing specialist|invoic|credit control|collections)'),
  r('Insurance & Claims', G.finance, '\\b(?:insurance|underwrit|claims|versicherung|schadenregul|insurance broker)'),
  r('Banking', G.finance, '\\b(?:bank(?:er|ing)?\\b|teller|loan (?:officer|processor)|mortgage|lending|relationship manager|branch manager|kundenberater|firmenkunden|privatkunden)'),
  r('Finance Manager & CFO', G.finance, '\\b(?:finance (?:manager|director|lead|officer)|director of finance|vp,? (?:of )?finance|head of finance|cfo\\b|chief financial officer|finanzleiter|kaufmännische leitung)'),

  // ---- Sales & Business Development ----
  r('Account Executive', G.sales, '\\b(?:account executive|ae\\b|new business)'),
  r('Key Account Manager', G.sales, '\\b(?:key account|account manager|client manager|account director|global account|strategic account|national account)'),
  r('Business Development', G.sales, '\\b(?:business development|bdr\\b|sdr\\b|sales development|partnerships?\\b|partner manager|alliances|channel (?:manager|sales)|lead generation|geschäftsentwicklung)'),
  r('Sales Manager', G.sales, '\\b(?:sales (?:manager|director|lead|leader|head)|head of sales|director of sales|vp,? (?:of )?sales|chief (?:revenue|commercial) officer|cro\\b|regional sales|area sales|vertriebsleiter|verkaufsleiter|directeur commercial)'),
  r('Medical & Pharma Sales', G.sales, '\\b(?:medical sales|pharma(?:ceutical)? sales|medical representative|pharmareferent|clinical specialist|territory manager)'),
  r('Sales Representative', G.sales, '\\b(?:sales|inside sales|field sales|outside sales|vertrieb|verkäufer|verkaufsberater|außendienst|aussendienst|vendedor|vendeur|telesales|account representative|sales representative)'),

  // ---- Customer service ----
  r('Call Centre Agent', G.support, '\\b(?:call (?:center|centre)|contact (?:center|centre)|telephon|customer (?:care )?agent|kundenservice ?mitarbeiter|hotline)'),
  r('Customer Service', G.support, '\\b(?:customer (?:service|support|care|experience|relations|operations)|client (?:service|support)|kundenservice|kundendienst|kundenbetreuung|service client|atención al cliente|guest (?:relations|services)|support (?:specialist|agent|associate|representative))'),

  // ---- Marketing & Communications ----
  r('SEO & SEM', G.marketing, '\\b(?:seo\\b|sem\\b|search engine|ppc\\b|paid search|google ads)'),
  r('Digital & Performance Marketing', G.marketing, '\\b(?:digital marketing|performance marketing|online marketing|paid (?:social|media)|growth (?:marketing|manager|hacker)|marketing automation|email marketing|crm (?:manager|marketing|specialist)|e-?commerce (?:manager|marketing)|affiliate|programmatic|user acquisition)'),
  r('Social Media & Community', G.marketing, '\\b(?:social media|community manager|influencer|tiktok|content creator)'),
  r('Content & Copywriting', G.marketing, '\\b(?:content (?:writer|manager|strategist|marketing|editor|specialist|designer)|copywrit|texter|ghostwriter|blog)'),
  r('Brand Marketing', G.marketing, '\\b(?:brand (?:manager|marketing|strategist|director|ambassador)|markenmanag)'),
  r('Market Research & Insights', G.marketing, '\\b(?:market research|marktforsch|consumer insights|marketing analy|customer insights|research analyst)'),
  r('Public Relations & Communications', G.marketing, '\\b(?:public relations|pr\\b|press|media relations|communications?\\b|corporate affairs|spokesperson|kommunikation|öffentlichkeitsarbeit|internal comms)'),
  r('Events', G.marketing, '\\b(?:events?\\b|event (?:manager|coordinator|planner)|conference|exhibition|veranstaltung|wedding planner)'),
  r('Marketing Manager', G.marketing, '\\b(?:marketing|marketeer|marketer)'),

  // ---- Human Resources ----
  r('Recruiter & Talent Acquisition', G.hr, '\\b(?:recruit|talent (?:acquisition|partner|sourcer|scout)|sourcer|headhunter|personalbeschaffung|reclut|recrutement|reclutamiento)'),
  r('HR Business Partner', G.hr, '\\b(?:hr business partner|hrbp|people partner|business partner hr|personalreferent)'),
  r('Compensation & Benefits', G.hr, '\\b(?:compensation|benefits|total rewards?|reward (?:manager|analyst|specialist)|vergütung)'),
  r('Learning & Development', G.hr, '\\b(?:learning (?:and|&) development|l&d\\b|training (?:manager|specialist|coordinator|consultant|designer)|instructional design|trainer\\b|talent development|organi[sz]ational development|personalentwicklung|e-?learning)'),
  r('HR Generalist & Manager', G.hr, '\\b(?:human resources|hr\\b|people (?:operations|ops|team|manager|lead|director)|head of (?:people|hr|talent|human resources)|chief people officer|personal(?:abteilung|leiter|sachbearbeiter|wesen)|ressources humaines|recursos humanos|employee relations|hris\\b|workforce)'),

  // ---- Legal ----
  r('Paralegal & Legal Assistant', G.legal, '\\b(?:paralegal|legal (?:assistant|secretary|clerk)|rechtsanwaltsfachangestellte|reno\\b|notarfachangestellte)'),
  r('Intellectual Property', G.legal, '\\b(?:patent|intellectual property|trademark|ip (?:counsel|attorney|manager))'),
  r('Lawyer & Counsel', G.legal, '\\b(?:lawyer|attorney|solicitor|barrister|counsel|rechtsanwalt|anwalt|syndikus|jurist|avocat|abogad|advocaat|avvocato|general counsel|legal (?:counsel|advisor|adviser|director))'),
  r('Contracts & Legal Operations', G.legal, '\\b(?:contract (?:manager|specialist|administrator|negotiator)|legal (?:operations|manager|officer|specialist|analyst)|legal\\b|vertragsmanag|recht\\b)'),

  // ---- Operations, supply chain ----
  r('Procurement & Purchasing', G.ops, '\\b(?:procurement|purchas|buyer|sourcing|category manager|einkauf|einkäufer|beschaffung|acheteur|comprador|inkoper|vendor manag)'),
  r('Supply Chain & Planning', G.ops, '\\b(?:supply chain|demand plan|supply plan|material(?:s)? plan|production plan|s&op|inventory|disponent|mrp\\b|planner\\b|planning (?:analyst|manager|specialist))'),
  r('Logistics & Shipping', G.ops, '\\b(?:logistic|logistik|freight|shipping|transport (?:planner|manager|coordinator)|dispatch|customs|zoll|(?:import|export)(?:er|s)?\\b|spedition|forwarding|fleet)'),
  r('Warehouse Worker', G.ops, '\\b(?:warehouse|lager|forklift|stapler|picker|packer|order pick|fulfil?ment|stock (?:associate|clerk|controller)|inventory associate|material handler|magazijn|entrepôt|preparador|kommissionier)'),
  r('Project Manager', G.ops, '\\b(?:project (?:manager|coordinator|lead|director|engineer|officer|controller)|programme? manager|pmo\\b|projektleiter|projektmanager|chef de projet|jefe de proyecto|projectleider)'),
  r('Facilities & Cleaning', G.ops, '\\b(?:facilit(?:y|ies)|building (?:manager|services)|janitor|cleaner|cleaning|custodian|housekeep|reinigung|hausmeister|gebäudemanag|caretaker|groundskeeper)'),
  r('Operations Manager', G.ops, '\\b(?:operations?\\b|head of operations|coo\\b|chief operating officer|betriebsleiter|business operations|operaciones)'),

  // ---- Manufacturing & Production ----
  r('Quality Control & Assurance', G.manufacturing, '\\b(?:quality|qualität|qualitäts|qc\\b|inspector|inspection|qualité|calidad|kwaliteit|gmp\\b|validation (?:engineer|specialist))'),
  r('CNC & Machine Operator', G.manufacturing, '\\b(?:cnc|machine operator|maschinenführer|machine setter|einrichter|press operator|operator\\b|operador|opérateur)'),
  r('Assembly & Production Worker', G.manufacturing, '\\b(?:assembl|production (?:worker|associate|operator|employee|technician)|produktionsmitarbeiter|produktionshelfer|factory|manufacturing (?:associate|operator|technician)|line worker|montage|packaging operator)'),
  r('Production Manager & Supervisor', G.manufacturing, '\\b(?:production (?:manager|supervisor|lead|planner)|plant manager|manufacturing manager|shift (?:supervisor|leader|manager)|schichtleiter|werkleiter|produktionsleiter|meister\\b|foreman)'),
  r('Lean & Continuous Improvement', G.manufacturing, '\\b(?:lean\\b|six sigma|continuous improvement|operational excellence|kaizen)'),

  // ---- Engineering (non-software) ----
  r('Robotics & Automation Engineer', G.eng, '\\b(?:robot|automation engineer|automatisierung|plc\\b|sps\\b|scada|controls? engineer|control systems|mechatron|instrumentation)'),
  r('Aerospace Engineer', G.eng, '\\b(?:aerospace|aeronaut|avionic|aircraft|flight (?:test|control)|satellite|spacecraft|space systems|propulsion|luft- und raumfahrt)'),
  r('Automotive Engineer', G.eng, '\\b(?:automotive|vehicle|powertrain|adas\\b|autonomous driving|chassis|fahrzeug|kfz-?ingenieur|e-?mobility|ev (?:engineer|charging))'),
  r('Hardware & Electronics Engineer', G.eng, '\\b(?:hardware|pcb\\b|asic\\b|chip design|semiconductor|silicon|vlsi|analog (?:design|engineer)|rf (?:engineer|design)|electronics? (?:engineer|design|developer)|elektronik|layout engineer|test engineer)'),
  r('Electrical Engineer', G.eng, '\\b(?:electrical (?:engineer|design)|elektroingenieur|elektrotechnik|power (?:systems|electronics|engineer)|high voltage|substation|ingénieur électrique|ingeniero eléctrico)'),
  r('Mechanical Engineer', G.eng, '\\b(?:mechanical|maschinenbau|konstrukteur|design engineer|cad (?:designer|engineer)|solidworks|catia|hvac engineer|thermal engineer|stress engineer|ingénieur mécanique|ingeniero mecánico)'),
  r('Civil & Structural Engineer', G.eng, '\\b(?:civil engineer|structural|geotechnic|bauingenieur|tragwerk|highway|bridge|hydraulic engineer|transport(?:ation)? engineer|génie civil|ingeniero civil)'),
  r('Chemical & Process Engineer', G.eng, '\\b(?:chemical engineer|process engineer|verfahrenstechn|prozessingenieur|process development)'),
  r('Manufacturing Engineer', G.eng, '\\b(?:manufacturing engineer|production engineer|industrial engineer|fertigungsingenieur|produktionsingenieur|npi\\b|industrialization)'),
  r('Biomedical Engineer', G.eng, '\\b(?:biomedical|medical device|medizintechnik|clinical engineer)'),
  r('Materials Engineer', G.eng, '\\b(?:materials? (?:engineer|scientist)|metallurg|polymer|composite|werkstoff)'),
  r('Maintenance Engineer', G.eng, '\\b(?:maintenance|instandhaltung|reliability engineer|servicetechniker|wartung|mantenimiento|maintenance technician)'),
  r('Field Service Engineer', G.eng, '\\b(?:field service|service engineer|service technician|commissioning|inbetriebnahme|servicetechniker|kundendiensttechniker)'),
  r('Systems Engineer', G.eng, '\\b(?:systems engineer|systems engineering|system engineer|systemingenieur)'),

  // ---- Energy & Environment ----
  r('Renewable Energy', G.energy, '\\b(?:renewable|solar|photovolta|pv\\b|wind (?:energy|turbine|farm|technician)|battery|hydrogen|energy storage|erneuerbare|windkraft)'),
  r('Oil, Gas & Mining', G.energy, '\\b(?:oil|gas\\b|petroleum|drilling|reservoir|subsurface|geolog|geophysic|mining|mine\\b|offshore|refinery|pipeline)'),
  r('Nuclear & Power Plant', G.energy, '\\b(?:nuclear|power plant|kraftwerk|utility|utilities|grid\\b|energy (?:engineer|analyst|manager|consultant))'),
  r('Environment & Sustainability', G.energy, '\\b(?:sustainab|environmental|esg\\b|climate|ecolog|conservation|carbon|decarboni|waste|recycling|umwelt|nachhaltig|circular economy|water (?:engineer|treatment|resources))'),
  r('Health & Safety (HSE)', G.energy, '\\b(?:health (?:and|&) safety|hse\\b|ehs\\b|safety (?:officer|manager|engineer|specialist|advisor|coordinator)|arbeitssicherheit|fachkraft für arbeitssicherheit|occupational safety)'),

  // ---- Construction & Architecture ----
  r('Architect', G.construction, '\\b(?:architect|architekt|architecte|arquitect|urban (?:planner|design)|landscape architect|town planner|stadtplan)'),
  r('Site & Construction Manager', G.construction, '\\b(?:site manager|construction (?:manager|project manager|supervisor|superintendent|director)|superintendent|bauleiter|polier|chef de chantier|jefe de obra|project engineer)'),
  r('Surveyor & Estimator', G.construction, '\\b(?:surveyor|estimator|cost (?:engineer|estimator|manager|consultant)|vermess|kalkulator|quantity)'),
  r('BIM & Drafting', G.construction, '\\b(?:bim\\b|drafts?(?:man|person)|draughts?(?:man|person)|autocad|revit|technischer zeichner|bauzeichner|dessinateur|cad technician)'),
  r('Construction Worker', G.construction, '\\b(?:construction|labou?rer|builder|bricklay|mason|roofer|scaffold|concrete|tiler|plasterer|drywall|painter and decorator|maurer|bauhelfer|dachdecker|gerüstbauer|trockenbau|fliesenleger|albañil|maçon)'),

  // ---- Skilled trades ----
  r('Electrician', G.trades, '\\b(?:electrician|elektriker|elektroniker|elektroinstallateur|électricien|electricista|elektromonteur|electrical (?:technician|fitter|installer))'),
  r('Plumber & HVAC Technician', G.trades, '\\b(?:plumb|hvac|heating|ventilation|refrigeration|air condition|pipefitter|pipe fitter|gas engineer|sanitär|anlagenmechaniker|kältetechnik|heizung|klima|plombier|fontanero|chauffagiste)'),
  r('Welder & Metalworker', G.trades, '\\b(?:weld|schweiß|schweiss|soudeur|soldador|fabricator|metal ?work|sheet metal|steel ?work|boilermaker|blacksmith|metallbauer|schlosser)'),
  r('Machinist & Toolmaker', G.trades, '\\b(?:machinist|toolmaker|tool maker|zerspanungs|werkzeugmechaniker|industriemechaniker|feinwerkmechaniker|tourneur|fraiseur)'),
  r('Carpenter & Joiner', G.trades, '\\b(?:carpent|joiner|tischler|schreiner|zimmer(?:er|mann)|woodwork|cabinet maker|menuisier|charpentier|carpintero)'),
  r('Mechanic', G.trades, '\\b(?:mechanic|mechaniker|kfz|mécanicien|mecánico|monteur|diesel technician|automotive technician|auto technician|vehicle technician|heavy equipment)'),
  r('Painter & Decorator', G.trades, '\\b(?:painter|maler|lackierer|decorator|peintre|pintor)'),
  r('Technician', G.trades, '\\b(?:technician|techniker|technicien|técnico|technicus|tecnico|technologist)'),

  // ---- Hospitality & tourism ----
  r('Chef & Cook', G.hospitality, '\\b(?:chef|cook|koch|köchin|cuisinier|cocinero|kitchen|sous|pastry|patissier|baker|bäcker|boulanger|culinary|commis)'),
  r('Waiter & Bartender', G.hospitality, '\\b(?:waiter|waitress|(?:restaurant|banquet|cocktail|food) server|^server\\b|bartender|barista|kellner|servicekraft|serveur|camarero|mesero|food (?:and|&) beverage|f&b|sommelier|host(?:ess)?\\b|runner)'),
  r('Hotel & Front Desk', G.hospitality, '\\b(?:hotel|front (?:desk|office)|receptionist|concierge|reception|rezeption|night audit|guest service|room attendant|réceptionniste|recepcionista|resort)'),
  r('Restaurant & Catering Manager', G.hospitality, '\\b(?:restaurant|catering|hospitality|food service|gastronomie|canteen|cafeteria)'),
  r('Travel & Tourism', G.hospitality, '\\b(?:travel (?:agent|consultant|advisor|designer)|tour (?:guide|operator|leader)|touris|reisebüro|reiseberater|destination manager)'),
  r('Cabin Crew', G.hospitality, '\\b(?:cabin crew|flight attendant|steward|flugbegleiter|ground staff|airport (?:agent|staff)|check-in agent|passenger service)'),

  // ---- Education ----
  r('Teaching Assistant & Special Needs', G.education, '\\b(?:teaching assistant|learning support|classroom assistant|special (?:education|needs)|sen\\b|sonderpädagog|inclusion|learning mentor)'),
  r('Early Childhood Educator', G.education, '\\b(?:early (?:childhood|years)|nursery|kindergarten|preschool|pre-school|childcare|child care|nanny|au pair|erzieher|kita\\b|daycare|day care|educateur de jeunes enfants|educadora infantil)'),
  r('Language Teacher', G.education, '\\b(?:english teacher|esl\\b|tefl|tesol|celta|language (?:teacher|instructor|tutor)|sprachlehrer|deutschlehrer|daf\\b|spanish teacher|french teacher|german teacher)'),
  r('Professor & Lecturer', G.education, '\\b(?:professor|lecturer|faculty|dozent|academic (?:staff|position)|assistant professor|associate professor|maître de conférences|reader in)'),
  r('Teacher', G.education, '\\b(?:teacher|teaching|lehrer|lehrkraft|educator|tutor|(?<!flight |ski |swim |fitness |yoga |driving )instructor|enseignant|profesor|docent|insegnante|maestr|pädagog|pedagog)'),
  r('Education Administration', G.education, '\\b(?:admissions|registrar|student (?:services|affairs|advisor|success)|school (?:administrator|manager|director)|principal|headteacher|head teacher|dean\\b|university administrat|academic (?:advisor|coordinator)|study advisor)'),

  // ---- Administration & office ----
  r('Executive Assistant', G.admin, '\\b(?:executive assistant|personal assistant|pa to|assistant to the|chief of staff|assistenz der geschäftsführung|vorstandsassistenz|office manager)'),
  r('Translator & Interpreter', G.admin, '\\b(?:translat|interpret|übersetz|dolmetsch|traduct|localization|localisation)'),
  r('Data Entry & Clerk', G.admin, '\\b(?:data entry|clerk|typist|filing|mailroom|document controller|records (?:clerk|officer)|datenerfassung)'),
  r('Administrative Assistant', G.admin, '\\b(?:administrative|admin assistant|administrator|administration|office (?:assistant|administrator|coordinator)|secretary|sekretär|sachbearbeit|kaufmann(?! im einzelhandel)|kauffrau(?! im einzelhandel)|bürokaufm|verwaltung|back office|assistant administratif|administrativo|receptie|assistant\\b|assistenz)'),

  // ---- Media & creative ----
  r('Journalist & Editor', G.media, '\\b(?:journalist|reporter|(?<!video |film |photo )editor|redakteur|redaktion|correspondent|news|periodista|journaliste|columnist|proofread)'),
  r('Photographer & Videographer', G.media, '\\b(?:photograph|fotograf|videograph|video (?:editor|producer|creator)|camera|film|cinematograph|editor video|cutter)'),
  r('Producer & Broadcasting', G.media, '\\b(?:producer|broadcast|radio|television|tv\\b|production assistant|post-production|sound (?:engineer|designer)|audio engineer|podcast)'),
  r('Artist & Illustrator', G.media, '\\b(?:illustrat|(?<!makeup |make-up |nail )artist|concept art|tattoo|sculpt|künstler)'),
  r('Musician & Performer', G.media, '\\b(?:musician|music|actor|actress|performer|dancer|singer|entertainer|dj\\b|choreograph)'),
  r('Writer & Author', G.media, '\\b(?:writer|author|autor|scriptwriter|screenwriter|storyteller)'),

  // ---- Public sector & nonprofit ----
  r('Social Worker', G.public, '\\b(?:social work|sozialarbeit|sozialpädagog|case (?:manager|worker)|youth worker|community (?:worker|outreach|development)|travailleur social|trabajador social|family support|child protection|welfare)'),
  r('Nonprofit & NGO', G.public, '\\b(?:ngo\\b|nonprofit|non-profit|humanitarian|fundrais|grant (?:writer|manager)|development officer|volunteer (?:coordinator|manager)|program(?:me)? officer|charity|advocacy)'),
  r('Government & Policy', G.public, '\\b(?:policy|government|public (?:sector|affairs|administration|service)|civil serv|diplomat|embassy|consulate|ministry|municipal|beamte|verwaltungsfachangestellte|public official|parliament)'),

  // ---- Security & defence ----
  r('Security Guard', G.security, '\\b(?:security (?:guard|officer|agent|supervisor)|guard\\b|bodyguard|doorman|sicherheitsmitarbeiter|wachmann|vigilante|agent de sécurité|loss prevention)'),
  r('Police & Firefighter', G.security, '\\b(?:police|polizei|law enforcement|detective|corrections officer|prison officer|firefight|feuerwehr|pompier|bombero)'),
  r('Military & Defence', G.security, '\\b(?:military|defen[cs]e|army|navy|air force|bundeswehr|soldier|armed forces|veteran)'),

  // ---- Aviation & maritime ----
  r('Pilot', G.aviation, '\\b(?:pilot|first officer|airline captain|flight instructor|pilote|piloto)'),
  r('Aircraft Maintenance', G.aviation, '\\b(?:aircraft (?:mechanic|maintenance|technician)|b1\\b|b2\\b|licensed aircraft|avionics technician|fluggerätmechaniker|part[- ]66|ame\\b)'),
  r('Air Traffic & Airport Operations', G.aviation, '\\b(?:air traffic|airport|aviation|dispatcher (?:flight)|ramp agent|flight operations)'),
  r('Maritime & Seafarer', G.aviation, '\\b(?:seafarer|deck (?:officer|hand|cadet)|marine engineer|ship|vessel|maritime|port\\b|sailor|able seaman|bosun|master mariner|yacht|stevedore)'),

  // ---- Transport & driving ----
  r('Truck & Delivery Driver', G.transport, '\\b(?:truck driver|lorry|hgv|lkw|cdl\\b|berufskraftfahrer|delivery (?:driver|associate)|courier|van driver|kurierfahrer|livreur|repartidor)'),
  r('Driver', G.transport, '\\b(?:driver|fahrer|chauffeur|conductor|bus driver|busfahrer|taxi|rideshare|train driver|lokführer|motorista)'),

  // ---- Agriculture & food ----
  r('Agriculture & Farming', G.agriculture, '\\b(?:agricult|farm|agronom|horticult|landwirt|gärtner|gardener|crop|livestock|forestry|forst|fisher|vineyard|winzer|greenhouse|dairy|landscap)'),
  r('Food Science & Technology', G.agriculture, '\\b(?:food (?:scientist|technolog|safety|quality)|lebensmittel|brewer|brauer|butcher|metzger|fleischer)'),

  // ---- Beauty, sports & wellness ----
  r('Hairdresser & Beauty', G.wellness, '\\b(?:hair ?(?:dresser|stylist)|barber|beaut|cosmetolog|nail (?:tech|artist)|esthetician|aesthetician|make-?up|friseur|kosmetik|spa\\b|massage|therapeute|coiffeu)'),
  r('Fitness & Sports', G.wellness, '\\b(?:fitness|personal trainer|coach\\b|sport|gym\\b|athlet|yoga|pilates|lifeguard|swim (?:teacher|instructor)|ski instructor|trainer (?:fitness|sport))'),

  // ---- Real estate & retail ----
  r('Real Estate Agent & Property Manager', G.realEstate, '\\b(?:real estate|property (?:manager|agent|management|consultant)|leasing (?:agent|consultant)|realtor|estate agent|immobilien|makler|asset manager real|facility manager real|letting)'),
  r('Store Manager', G.retail, '\\b(?:store (?:manager|director|lead)|shop manager|retail manager|filialleit|marktleiter|branch manager retail|assistant store manager|district manager|area manager retail)'),
  r('Retail Sales Associate', G.retail, '\\b(?:retail|store (?:associate|assistant|employee|clerk)|shop assistant|sales assistant|cashier|kassierer|verkäuferin|merchandis|visual merchandis|stock ?room|einzelhandel|vendeur en magasin|dependiente)'),

  // ---- Consulting, strategy & general management ----
  r('Business Analyst', G.consulting, '\\b(?:business analy|business process|process analyst|requirements (?:engineer|analyst)|functional analyst|systems analyst)'),
  r('Strategy & Transformation', G.consulting, '\\b(?:strategy|strategic|transformation|change manag|corporate development|business planning|innovation manager)'),
  r('Management Consultant', G.consulting, '\\b(?:consultant|consulting|berater|beratung|advisory|conseil|consultor|adviseur|advisor|adviser)'),
  r('Executive & General Management', G.consulting, '\\b(?:ceo\\b|chief executive|managing director|general manager|country manager|geschäftsführ|head of|director|vice president|vp\\b|chief\\b|president|partner\\b|leiter|directeur|director general|gerente)'),

  // ---- Generic fallbacks (last) ----
  r('Engineer (other)', G.eng, '\\b(?:engineer|engineering|ingenieur|ingénieur|ingeniero|ingegnere)'),
  r('Finance (other)', G.finance, '\\b(?:finance|financial|finanz|finances)'),
  r('Analyst (other)', G.consulting, '\\banalyst'),
  r('Manager (other)', G.consulting, '\\b(?:manager|management|supervisor|team lead|teamleiter|coordinator|koordinator)'),
];

export const CATEGORY_GROUPS: string[] = [...new Set(RULES.map((x) => x[1]))];

/** Every category, grouped, in display order. */
export const CATEGORIES_BY_GROUP: { group: string; labels: string[] }[] = CATEGORY_GROUPS.map((group) => ({
  group,
  labels: [...new Set(RULES.filter((x) => x[1] === group).map((x) => x[0]))].sort((a, b) => a.localeCompare(b)),
}));

const GROUP_OF = new Map(RULES.map((x) => [x[0], x[1]]));
export const categoryGroup = (label: string): string | undefined => GROUP_OF.get(label);

function match(text: string): JobCategory | null {
  if (!text) return null;
  for (const [label, group, re] of RULES) if (re.test(text)) return { label, group };
  return null;
}

const cache = new Map<string, JobCategory | null>();

/**
 * The job's category: from its title first; if the title matches nothing
 * (or only a generic "(other)" bucket), the department the source gave.
 */
export function classifyJob(title: string, department?: string | null): JobCategory | null {
  const key = `${title}\u0000${department ?? ''}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const byTitle = match(title);
  let result = byTitle;
  if (!byTitle || byTitle.label.endsWith('(other)')) {
    const dept = department && !/^(?:other|all|any|various|n\/?a|none|-)$/i.test(department.trim()) ? match(department) : null;
    if (dept && !dept.label.endsWith('(other)')) result = dept;
  }
  if (cache.size > 50_000) cache.clear();
  cache.set(key, result);
  return result;
}

/** Filter value → does this category match it? A value is a category label or "group:<Group name>". */
export function categoryMatches(cat: JobCategory | null, value: string): boolean {
  if (!cat) return false;
  if (value.startsWith('group:')) return cat.group === value.slice(6);
  return cat.label === value;
}

export const categoryValueLabel = (value: string): string => (value.startsWith('group:') ? `All ${value.slice(6)}` : value);

/**
 * Plain words a category's title rule looks for ("police", "law enforcement", "firefight"),
 * so the server can be asked for a category's jobs (title contains any of them). The page
 * then applies the exact rule. `value` is a label or "group:<group>".
 */
export function categorySearchTerms(value: string, max = 40): string[] {
  const rules = value.startsWith('group:') ? RULES.filter((x) => x[1] === value.slice('group:'.length)) : RULES.filter((x) => x[0] === value);
  const out = new Set<string>();
  for (const [, , re] of rules) {
    const src = re.source.replace(/^\\b/, '').replace(/^\(\?:/, '').replace(/\)$/, '');
    for (const alt of src.split('|')) {
      // Keep only the literal start of each alternative ("aircraft (?:mechanic|…" → "aircraft").
      const lit = alt
        .replace(/\\b/g, '')
        .split(/[\\()[\]?*+{}^$]/)[0]
        .replace(/[^\p{L}\p{N} &'-]/gu, '')
        .trim();
      if (lit.length >= 3) out.add(lit.toLowerCase());
      if (out.size >= max) break;
    }
  }
  return [...out].slice(0, max);
}
