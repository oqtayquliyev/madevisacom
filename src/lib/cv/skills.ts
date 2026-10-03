// Skill dictionary for the CV match — the same list reads the CV and the job
// ad, so "K8s" in one and "Kubernetes" in the other are the same skill.
//
// One skill per entry: "Name|other spelling|other spelling". The first name
// is what the person sees. Add a line to teach the matcher a new skill.
//
// Markers after a spelling:
//   !  it is an ordinary word too (Go, R, Excel, PR) — only counts when
//      written with its capital letters.
//   ~  (on the name) a whole field rather than a skill (Sales, Research) —
//      a job only asks for it when it's the job's own field or said twice.
// Soft skills (communication, teamwork…) count for little: every ad lists
// them and every CV claims them.

export type SkillGroup =
  | 'Programming'
  | 'Web & mobile'
  | 'Data & AI'
  | 'Cloud & DevOps'
  | 'IT & security'
  | 'Product & design'
  | 'Engineering'
  | 'Finance'
  | 'Sales & marketing'
  | 'Business & operations'
  | 'People & legal'
  | 'Healthcare & science'
  | 'Hospitality & trades'
  | 'Education'
  | 'Soft skills';

export type Skill = {
  id: string;
  name: string;
  group: SkillGroup;
  /** Communication, teamwork… — counts for little. */
  soft: boolean;
  /** A whole field rather than a skill ("Sales", "Research") — see jobProfile.ts. */
  broad: boolean;
};

const RAW: Record<SkillGroup, string> = {
  Programming: `
Python|python3
JavaScript|JS!|ecmascript|es6
TypeScript
Java|java se|java ee|j2ee|jdk
C#|c sharp|csharp
C++|cpp|c plus plus
C!|c language|c programming|ansi c|embedded c
Go!|golang
Rust!
Ruby
PHP
Swift!
Kotlin
Scala
R!|r programming|r language|rstudio
MATLAB|simulink
Perl
Bash|shell scripting|shell script|bash scripting|zsh|unix shell
PowerShell
SQL|t sql|tsql|pl sql|plsql
NoSQL
Dart
Elixir
Erlang
Haskell
Clojure
Lua
Groovy
Objective-C|objective c|objc
Assembly language|assembler|assembly programming
VBA|visual basic|vb.net
COBOL
Fortran
Solidity
ABAP
Apex
Object-oriented programming|oop|object oriented|object oriented design
Functional programming
Data structures|data structures and algorithms|algorithms
Design patterns
Microservices|micro services|microservice architecture
REST APIs|rest api|restful|restful api|rest services|restful apis
GraphQL
gRPC
WebSockets|websocket
API design|api development|apis
System design|systems design|distributed systems|software architecture
Test-driven development|tdd
Unit testing|unit tests|junit|pytest|jest|mocha|nunit|xunit|rspec
Test automation|automated testing|selenium|cypress|playwright|appium|robot framework
QA testing|quality assurance|manual testing|software testing|test cases|test plans
Code review|code reviews|peer review
Git|github|gitlab|bitbucket|version control|source control
Spring Boot|Spring!|spring framework|spring mvc|springboot
.NET|dotnet|.net core|asp.net|asp.net core|.net framework|entity framework
Node.js|nodejs|node js|express.js|expressjs|nestjs|nest.js
Django
Flask
FastAPI
Ruby on Rails|rails
Laravel|symfony
Hibernate|jpa
Kafka|apache kafka
RabbitMQ|message queues|activemq
Redis
Elasticsearch|elastic search|opensearch|ELK!|elk stack
PostgreSQL|postgres|psql
MySQL|mariadb
MongoDB|mongo
Oracle Database|oracle db|oracle sql
SQL Server|mssql|microsoft sql server|ms sql
Cassandra
DynamoDB
SQLite
Database design|data modeling|data modelling|database administration|dba|schema design
Embedded systems|embedded software|firmware|rtos|microcontrollers|embedded development
Linux|unix|ubuntu|debian|red hat|rhel|centos
Agile|agile methodologies|agile development
Scrum|scrum master|sprint planning|kanban
`,
  'Web & mobile': `
React|react.js|reactjs|react js
Next.js|nextjs
Vue|vue.js|vuejs|nuxt|nuxt.js
Angular|angularjs|angular js
Svelte|sveltekit
HTML|html5
CSS|css3|sass|scss
Tailwind CSS|tailwind|tailwindcss
Bootstrap
jQuery
Redux|zustand|mobx
Webpack|vite|rollup|babel
Front-end development|frontend|front end|frontend development
Back-end development|backend|back end|backend development
Full-stack development|full stack|fullstack
Responsive design|responsive web design|mobile first
Web accessibility|wcag|a11y|accessibility standards
SEO|search engine optimization|search engine optimisation
WordPress|woocommerce
Shopify|magento
iOS development|ios|swiftui|uikit|xcode
Android development|android|jetpack compose|android studio
React Native
Flutter
Xamarin|maui
Unity!|unity3d
Unreal Engine|unreal
`,
  'Data & AI': `
Machine learning|ML!|machine learning models
Deep learning|neural networks|cnn|rnn|transformers
Natural language processing|nlp
Computer vision|opencv|image processing
Large language models|llm|llms|generative ai|genai|gen ai|prompt engineering|RAG!
Artificial intelligence~|AI!
TensorFlow|keras
PyTorch
scikit-learn|sklearn|scikit learn
Pandas|numpy|scipy
Data analysis~|data analytics|analytics|data analyst
Data science|data scientist
Data engineering|data pipelines|etl|elt|data pipeline
Data visualization|data visualisation|dashboards|dashboarding
Power BI|powerbi|DAX!
Tableau
Looker|looker studio|google data studio
Qlik|qlikview|qlik sense
Excel!|microsoft excel|ms excel|advanced excel|pivot tables|vlookup|xlookup
Statistics|statistical analysis|statistical modelling|statistical modeling|regression analysis|hypothesis testing
A/B testing|ab testing|a b tests|a b test|ab tests|experimentation|split testing
Spark!|apache spark|pyspark
Hadoop|hive|hdfs
Airflow|apache airflow|dagster|prefect
dbt
Snowflake
BigQuery|big query
Redshift
Databricks
Data warehousing|data warehouse|data lake|lakehouse
Big data
Business intelligence|BI!
SAS!
SPSS|stata
MLOps|model deployment|mlflow|kubeflow
Forecasting|time series|predictive modelling|predictive modeling|predictive analytics
Data governance|data quality|master data management|mdm
`,
  'Cloud & DevOps': `
AWS|amazon web services|ec2|s3|lambda|cloudformation|eks|ecs
Azure|microsoft azure|azure devops|aks
Google Cloud|gcp|google cloud platform|gke
Docker|containers|containerization|containerisation
Kubernetes|k8s|helm|openshift
Terraform|infrastructure as code|iac|pulumi
Ansible|puppet
CI/CD|ci cd|continuous integration|continuous delivery|continuous deployment|jenkins|github actions|gitlab ci|circleci|teamcity|argo cd|argocd
DevOps|devsecops|platform engineering
Site reliability engineering|sre|reliability engineering
Monitoring~|observability|prometheus|grafana|datadog|new relic|splunk|kibana
Cloud architecture|cloud computing|cloud infrastructure|cloud native|serverless
Networking~|tcp ip|tcp/ip|dns|vpn|load balancing|routing and switching|lan wan
Nginx|apache http server|apache tomcat|tomcat
Virtualization|virtualisation|vmware|hyper v|vsphere
Incident management|on call|incident response|root cause analysis|rca
`,
  'IT & security': `
Cybersecurity|cyber security|information security|infosec|it security
Penetration testing|pentest|pen testing|ethical hacking|vulnerability assessment
SIEM|security operations center|security operations|threat detection|threat hunting
Identity and access management|iam|active directory|okta|sso|single sign on|azure ad|entra id
ISO 27001|soc 2|soc2|nist|pci dss
Network security|firewalls|firewall|ids ips|zero trust
Application security|appsec|owasp|secure coding
Cryptography|encryption|pki
IT support|helpdesk|help desk|service desk|technical support|desktop support|it helpdesk
ITIL|itsm
ServiceNow
Windows Server|windows administration
System administration|sysadmin|systems administration|it administration
Microsoft 365|office 365|o365|sharepoint|microsoft teams|exchange online
Microsoft Office|ms office|office suite
SAP!|sap erp|sap s/4hana|s4hana|sap hana|sap fico|sap mm|sap sd
Oracle ERP|oracle e business suite|oracle fusion
NetSuite|oracle netsuite
Salesforce|sfdc|salesforce crm
Microsoft Dynamics|dynamics 365|d365|navision|dynamics nav
ERP|erp systems
Workday
Cisco|ccna|ccnp
Troubleshooting|problem diagnosis
`,
  'Product & design': `
Product management|product manager|product owner|product ownership
Product strategy|product roadmap|roadmapping
User research|ux research|usability testing|user interviews|user testing
UX design|user experience|UX!|interaction design
UI design|user interface design|UI!|visual design
Figma
Sketch!|adobe xd|invision
Adobe Creative Suite|adobe creative cloud|photoshop|illustrator|indesign
Wireframing|wireframes|prototyping|prototypes|mockups
Design systems|design system
Graphic design|branding|brand design|typography
Motion design|after effects|motion graphics
Video editing|premiere pro|final cut|davinci resolve
3D modeling|3d modelling|blender|autodesk maya|3ds max|cinema 4d
Product analytics|amplitude|mixpanel|google analytics|ga4
Requirements gathering|requirements analysis|user stories|business requirements|functional specifications
Jira|confluence|atlassian
Backlog management|backlog grooming|backlog refinement
Go-to-market|gtm|product launch|go to market strategy
Copywriting|content writing|ux writing|technical writing|content creation
Photography|photo editing|lightroom
`,
  Engineering: `
Mechanical engineering|mechanical design|mechanical engineer
Electrical engineering|electrical design|electrical engineer
Electronics|pcb design|circuit design|analog design|altium|schematic design
Civil engineering|structural engineering|structural analysis|civil engineer
Chemical engineering|process engineering|process engineer
Industrial engineering|manufacturing engineering
Automation~|plc|plc programming|scada|siemens tia|allen bradley|industrial automation
Robotics|ROS!
CAD|autocad|computer aided design
SolidWorks
CATIA|siemens nx|creo|autodesk inventor
Revit|bim|building information modeling|building information modelling
FEA|finite element analysis|ansys|abaqus|cfd|computational fluid dynamics
GD&T|geometric dimensioning|technical drawings|engineering drawings|blueprint reading
Lean manufacturing|lean!|kaizen|5s|continuous improvement
Six Sigma|green belt|black belt|dmaic
Quality control|quality management|iso 9001|qms|quality inspection|quality assurance engineering
Root cause analysis|8d|fmea|failure analysis
Maintenance~|preventive maintenance|predictive maintenance|equipment maintenance|tpm
HVAC|heating ventilation|refrigeration
Welding|mig welding|tig welding|fabrication
CNC machining|cnc|machining|cnc programming
Supply chain engineering|production planning|capacity planning
Health and safety|hse|ehs|osha|occupational safety|nebosh|risk assessment
Renewable energy|solar|photovoltaics|wind energy|energy systems
Power systems|high voltage|substations|power electronics
Automotive|iso 26262|autosar|can bus|adas
Aerospace|avionics|do 178
Telecommunications|5g|lte|rf engineering|radio frequency
Semiconductor|vlsi|fpga|verilog|vhdl|asic
Construction management|site management|site supervision|construction supervision
Quantity surveying|cost estimation|bill of quantities|estimating
Land surveying|gis|arcgis|qgis
Commissioning|testing and commissioning
Technical documentation|technical specifications
`,
  Finance: `
Accounting|bookkeeping|general ledger|buchhaltung|finanzbuchhaltung|comptabilité|contabilidad
Financial reporting|financial statements|month end close|month end|year end close|monatsabschluss|jahresabschluss|monatsabschlüsse|jahresabschlüsse|monats und jahresabschlüssen
IFRS|gaap|us gaap|local gaap|hgb
Accounts payable|accounts receivable|ap ar|invoice processing|credit control|kreditorenbuchhaltung|debitorenbuchhaltung|kreditoren|debitoren
Financial analysis|financial analyst|fp&a|financial planning and analysis|financial planning
Financial modeling|financial modelling|valuation|dcf
Budgeting|forecasting and budgeting|budget management|cost control|budget planning
Auditing~|audit|internal audit|external audit|sox|sarbanes oxley
Tax~|taxation|vat|umsatzsteuer|umsatzsteuervoranmeldungen|steuern|corporate tax|tax compliance|tax returns
Payroll|payroll processing
Treasury|cash management|cash flow|liquidity management
Risk management|credit risk|market risk|operational risk
Compliance~|regulatory compliance|aml|kyc|anti money laundering
Investment banking|m&a|mergers and acquisitions|due diligence|private equity|venture capital
Asset management|portfolio management|wealth management
Banking~|retail banking|corporate banking|lending|credit analysis|underwriting
Insurance~|actuarial|claims handling
Controlling|management accounting|cost accounting|management reporting
ACCA|cpa|cfa|cima|chartered accountant
QuickBooks|xero|sage 50|sage accounting|datev|1c accounting
Bloomberg|reuters eikon
Procurement|purchasing|sourcing|strategic sourcing|vendor management|supplier management
Consolidation|group reporting|intercompany
Reconciliation|bank reconciliation|account reconciliation|reconciliations
`,
  'Sales & marketing': `
Sales~|b2b sales|b2c sales|inside sales|field sales|direct sales
Business development|bizdev|new business|lead generation|prospecting|cold calling|outbound
Account management|key account management|client management|customer relationship management|client relationships
Customer success|customer retention|customer onboarding|renewals|upselling
Negotiation|contract negotiation|negotiating
CRM|hubspot|pipedrive|zoho|crm systems
Sales operations|sales forecasting|pipeline management|sales pipeline
Solution selling|consultative selling|enterprise sales|saas sales
Pre-sales|presales|sales engineering|technical sales|solution consulting
Digital marketing|online marketing|performance marketing|growth marketing
Content marketing|content strategy|blogging|editorial
Social media marketing|social media|social media management|community management
Email marketing|marketing automation|mailchimp|marketo|pardot|klaviyo
Paid advertising|ppc|google ads|adwords|facebook ads|meta ads|search engine marketing|paid social|paid search
Marketing strategy~|marketing campaigns|campaign management|integrated marketing
Brand management|brand strategy|brand marketing
Market research|competitive analysis|market analysis|consumer insights
Public relations|PR!|media relations|press releases|corporate communications
Event management|event planning|trade shows
E-commerce|ecommerce|online retail|marketplace management|amazon seller
Product marketing
Affiliate marketing|influencer marketing|partner management
Customer service~|customer support|client service|customer care|customer experience
Call center|call centre|contact center|contact centre
Retail~|merchandising|visual merchandising|store management|point of sale|POS!
Telesales|telemarketing
Conversion rate optimization|conversion rate optimisation|conversion optimisation
`,
  'Business & operations': `
Project management~|project manager|project planning|project delivery|project coordination
PMP|prince2|pmi|project management professional
Program management|programme management|portfolio management office|pmo
Operations management~|operations|business operations|operational excellence
Process improvement|process optimization|process optimisation|business process improvement|bpm|process mapping
Change management|organisational change|organizational change
Stakeholder management|stakeholder engagement|stakeholder communication
Strategy~|strategic planning|business strategy|corporate strategy
Business analysis|business analyst|gap analysis
Management consulting~|consulting
Supply chain management|supply chain|scm
Logistics~|freight|shipping|transportation|distribution|freight forwarding
Warehouse management|warehousing|wms|inventory management|inventory control|stock control
Import/export|customs|customs clearance|incoterms|trade compliance
Demand planning|s&op|sales and operations planning
Fleet management|route planning|dispatch
Forklift|forklift operation|forklift license|reach truck
Office administration|administrative support|office management|clerical|administrative tasks|administrative duties
Data entry|record keeping
Calendar management|diary management|travel arrangements
Executive assistance|executive assistant|personal assistant
Reporting~|kpi reporting|kpis|performance reporting|management information
Contract management|tendering|rfp|rfps|bid management
Facilities management|facility management|property management
Team leadership~|people management|team management|line management|managing teams|leading teams
Coaching|mentoring|staff development
Budget ownership|p&l|profit and loss|p&l management
Presentation skills|presentations|powerpoint|public speaking
Driving licence|driver's license|drivers license|driving license|category b|class b|cdl|category c|category ce
Real estate|leasing|property valuation
`,
  'People & legal': `
Recruitment~|recruiting|talent acquisition|sourcing candidates|headhunting|interviewing candidates
HR management|human resources|hr generalist|hr business partner|hrbp|hr operations
Employee relations|labour relations|labor relations|industrial relations
Employee onboarding|new hire onboarding|offboarding
Compensation and benefits|comp & ben|rewards|total rewards
Learning and development|l&d|training and development|training delivery|instructional design
Performance management|talent management|succession planning
HRIS|sap successfactors|successfactors|bamboohr|personio|hr systems
Employment law|labour law|labor law
Employer branding
Legal research|legal drafting|legal writing|contract drafting|drafting contracts
Contract law|commercial law|corporate law
Litigation|dispute resolution|arbitration
Intellectual property|ip law|patents|trademarks
Data protection|gdpr|data privacy|privacy law
Paralegal|legal assistant|legal support
Immigration law|visa applications|global mobility
Company secretarial|corporate governance
`,
  'Healthcare & science': `
Nursing|registered nurse|RN!|patient care|nursing care|staff nurse
Clinical experience|clinical practice|clinical skills|clinical assessment
Medicine|physician|medical doctor|general practice|internal medicine
Surgery|surgical|operating theatre|operating room
Emergency care|emergency medicine|a&e|icu|intensive care|critical care
Elderly care|geriatric care|care assistant|caregiving|home care|social care|personal care
Midwifery|obstetrics|maternity
Pharmacy|pharmacist|dispensing|pharmacology
Physiotherapy|physical therapy|rehabilitation|occupational therapy
Dentistry|dental|dental nursing
Radiology|radiography|mri|ct scan|ultrasound|x ray
Laboratory skills|lab techniques|laboratory techniques|wet lab|pipetting|sample preparation
PCR|qpcr|elisa|western blot|cell culture|flow cytometry
Molecular biology|microbiology|biochemistry|genetics|immunology
HPLC|chromatography|mass spectrometry|gc ms|lc ms|spectroscopy
Clinical trials|clinical research|good clinical practice|clinical research associate
GMP|good manufacturing practice|glp|gxp
Regulatory affairs|fda|ema|ce marking|mdr
Pharmacovigilance|drug safety
Medical devices|iso 13485
Bioinformatics|genomics|ngs
Public health|epidemiology|health policy
Mental health|psychology|counselling|counseling|psychotherapy
First aid|cpr|bls|acls|basic life support
Medical records|ehr|emr|medical coding|medical terminology
Veterinary|animal care
Research~|scientific research|academic research|r&d|research and development
Scientific writing|publications|grant writing|peer reviewed
Chemistry|organic chemistry|analytical chemistry
Physics|optics|photonics
Biology|life sciences
Mathematics|applied mathematics|mathematical modelling|mathematical modeling
Food safety|haccp|food hygiene
`,
  'Hospitality & trades': `
Cooking|chef|culinary|food preparation|line cook|commis|sous chef
Baking|pastry|patisserie
Bartending|barista|mixology|cocktails
Waiting tables|waiter|waitress|table service|food service|food and beverage|f&b
Hotel operations|front desk|front office|reception|guest relations|concierge|opera pms
Housekeeping|room attendant|janitorial|cleaner
Reservations|booking systems|amadeus|sabre|galileo
Tourism|tour guiding|travel consulting|travel agency
Cabin crew|flight attendant|ground handling|airport operations
Plumbing|pipefitting|pipe fitting
Electrical installation|electrician|wiring|electrical maintenance
Carpentry|joinery|woodworking
Painting and decorating|painting|plastering|tiling
Bricklaying|masonry|concrete work|formwork|scaffolding
Roofing|insulation
Heavy equipment operation|excavator|crane operation|plant operator
Truck driving|hgv|lorry driver|truck driver|heavy vehicle|bus driver
Delivery driving|delivery driver|courier|last mile
Auto mechanics|vehicle maintenance|car mechanic|diesel mechanic|automotive repair
Machine operation|machine operator|production line|assembly line|packing|picking and packing
Farming|agriculture|harvesting|greenhouse|horticulture|livestock
Butchery|meat processing|fish processing|food production
Gardening|landscaping|groundskeeping
Security guarding|security officer|surveillance|cctv
Childcare|nanny|au pair|babysitting|early years
Beauty therapy|hairdressing|barbering|nail technician|massage
Fitness training|personal training|sports coaching
Tailoring|sewing|garment production
Cash handling|cashier|till operation
`,
  Education: `
Teaching~|teacher|classroom teaching|lecturing|tutoring|classroom management
Curriculum development|lesson planning|curriculum design|course design
TEFL|tesol|celta|esl|english teaching|efl
Special education|special needs|sen
Early childhood education|preschool|kindergarten|montessori
E-learning|elearning|lms|moodle|online teaching
Student assessment|marking and grading
Academic advising|student support|pastoral care
Translation|translating|interpreting|localization|localisation|proofreading
`,
  'Soft skills': `
Communication|communication skills|verbal communication|written communication|interpersonal skills
Teamwork|team player|collaboration|collaborative|cross functional|cross functional collaboration
Problem solving|problem solver|analytical thinking|analytical skills|critical thinking
Leadership|leadership skills
Time management|organisational skills|organizational skills|organised|organized|multitasking|prioritising|prioritizing
Adaptability|adaptable|fast learner|quick learner
Attention to detail|detail oriented|meticulous
Creativity|creative thinking
Self-motivation|self motivated|proactive|self starter|independent working|work independently
Customer focus|customer oriented|client focus|customer centric
Decision making|judgement|judgment
Work under pressure|working under pressure|resilience|deadline driven|meeting deadlines
`,
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, '-')
    .replace(/^-|-$/g, '');

/** Punctuation to spaces — but "c++", "c#", ".net" and "node.js" survive. Keeps capitals. */
function clean(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[^A-Za-z0-9+#.&'\u00c0-\u024f\u0400-\u04ff]+/g, ' ')
    .replace(/(^|\s)['.&]+(?=[^A-Za-z0-9]|$)|['.&]+(?=\s|$)/g, ' ')
    .replace(/(^|\s)'+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lower-case form used for matching. */
export const normalize = (text: string): string => clean(text).toLowerCase();

export const SKILLS: Skill[] = [];
export const SKILL_BY_ID = new Map<string, Skill>();
/** normalized phrase → skill id. */
const PHRASES = new Map<string, string>();
/** Spellings that are ordinary words too: matched on the original text, capitals and all. */
const STRICT: { id: string; key: string; re: RegExp }[] = [];
let MAX_WORDS = 1;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One-letter languages need a list around them: "Python, R, SQL" — not "John R. Smith".
const LIST_BEFORE = '(?:^|[,;/(|•·:]\\s*|\\b(?:and|or|in|with|using|und|et)\\s+)';
const LIST_AFTER = '(?=\\s*(?:[,;/)|•·]|$|\\b(?:and|or|programming|language|und|et)\\b))';

for (const [group, block] of Object.entries(RAW) as [SkillGroup, string][]) {
  for (const line of block.split('\n')) {
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const name = parts[0].replace(/[!~]+$/, '');
    const id = slug(name);
    if (SKILL_BY_ID.has(id)) continue;
    const skill: Skill = { id, name, group, soft: group === 'Soft skills', broad: parts[0].includes('~') };
    SKILLS.push(skill);
    SKILL_BY_ID.set(id, skill);
    for (const p of parts) {
      const alias = p.replace(/[!~]+$/, '');
      if (p.replace(/~$/, '').endsWith('!')) {
        const source = alias.length === 1 ? `${LIST_BEFORE}${esc(alias)}${LIST_AFTER}` : `(?<![A-Za-z0-9+#.])${esc(alias)}(?![A-Za-z0-9+#]|\\.[A-Za-z])`;
        STRICT.push({ id, key: alias.toLowerCase(), re: new RegExp(source, 'gm') });
        continue;
      }
      const key = normalize(alias);
      if (!key || PHRASES.has(key)) continue;
      PHRASES.set(key, id);
      MAX_WORDS = Math.max(MAX_WORDS, key.split(' ').length);
    }
  }
}

// "Go to market", "Excel at", "Spring 2024" and friends are not skills.
const STRICT_BLOCK: Record<string, RegExp> = {
  go: /^Go(?:\s+(?:to|live|ahead|beyond|above|for|and|on)\b|-to-|\s*\/\s*no)/,
  excel: /^Excel\s+(?:at|in|as)\b/,
  swift: /^SWIFT\s+(?:code|payment|transfer|message)/i,
  spark: /^Spark\s+(?:joy|interest|ideas?)/,
  unity: /^Unity\s+(?:of|in)\b/,
  rust: /^Rust\s+(?:belt|removal|protection)/i,
  sketch: /^Sketch\s+(?:out|of|a|the)\b/,
  sas: /^SAS\s+(?:drive|disk|storage|hba)/i,
  lean: /^Lean\s+(?:on|into|towards?)\b/,
  spring: /^Spring\s+(?:\d{4}|semester|term|break|season|of|and|\/|\u2013|-)/,
  ai: /^AI\s*\/\s*AN\b/,
};

/** `as`: how the text itself spells it ("K8s", "NetSuite"). */
export type FoundSkill = { id: string; count: number; first: number; as: string };

/** Every dictionary skill mentioned in `text`, with how often and where first (0–1 through the text). */
export function findSkills(text: string): Map<string, FoundSkill> {
  const found = new Map<string, FoundSkill>();
  const hit = (id: string, pos: number, as: string) => {
    const f = found.get(id);
    if (f) f.count += 1;
    else found.set(id, { id, count: 1, first: pos, as });
  };

  const original = clean(text).split(' ');
  const words = original.map((w) => w.toLowerCase());
  const total = Math.max(1, words.length);
  for (let i = 0; i < words.length; i += 1) {
    // Longest phrase first, so "machine learning models" isn't also read as something shorter.
    for (let n = Math.min(MAX_WORDS, words.length - i); n >= 1; n -= 1) {
      const id = PHRASES.get(n === 1 ? words[i] : words.slice(i, i + n).join(' '));
      if (id) {
        hit(id, i / total, original.slice(i, i + n).join(' '));
        i += n - 1;
        break;
      }
    }
  }

  for (const { id, key, re } of STRICT) {
    const block = STRICT_BLOCK[key];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const at = m.index + m[0].toLowerCase().lastIndexOf(key);
      if (block && block.test(text.slice(at, at + 28))) continue;
      hit(id, at / Math.max(1, text.length), text.slice(at, at + key.length));
    }
  }
  return found;
}

export const skillName = (id: string) => SKILL_BY_ID.get(id)?.name ?? id;
