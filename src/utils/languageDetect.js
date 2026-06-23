'use strict';

// ─── Artist → Language maps ───────────────────────────────────────────────────

const PUNJABI_ARTISTS = new Set([
  'diljit dosanjh','ap dhillon','sidhu moosewala','shubh','karan aujla',
  'guru randhawa','parmish verma','jass manak','gippy grewal','amrit maan',
  'mankirt aulakh','harf cheema','kulwinder billa','ninja','sukh-e','sukhe',
  'bohemia','deep jandu','surjit bhullar','jassi gill','kanwar grewal',
  'nachhatar gill','miss pooja','sunanda sharma','kaur b','shipra goyal',
  'hardy sandhu','harrdy sandhu','prabh gill','bilal saeed','garry sandhu',
  'the prophe c','prophe c','talha anjum','talhah anjum','young stunners',
  'talha yunus','imran khan','ali zafar','ali sethi','satinder sartaaj',
  'gurdas maan','harbhajan mann','sukhwinder singh','labh janjua',
  'master saleem','hans raj hans','tarsem jassar','ammy virk','dilpreet dhillon',
  'korala maan','gurnam bhullar','varinder brar','sharry maan','feroz khan',
  'g deep','mannat noor','pavvan','g khan','simran sethi',
]);

const HINDI_ARTISTS = new Set([
  'arijit singh','shreya ghoshal','sonu nigam','udit narayan','lata mangeshkar',
  'kishore kumar','mukesh','mohd rafi','md rafi','asha bhosle','alka yagnik',
  'kumar sanu','sunidhi chauhan','shaan','kk','k.k','jubin nautiyal',
  'neha kakkar','tony kakkar','atif aslam','pritam','anu malik',
  'vishal shekhar','amit trivedi','shankar ehsaan loy','armaan malik',
  'darshan raval','palak mucchal','jonita gandhi','javed ali',
  'rahat fateh ali khan','ustad nusrat fateh ali khan','himesh reshammiya',
  'yo yo honey singh','badshah','raftaar','divine','naezy','mc stan',
  'seedhe maut','ritviz','prateek kuhad','nucleya','papon','ankit tiwari',
  'mohit chauhan','harshdeep kaur','a. r. rahman','ar rahman',
  'vishal dadlani','shankar mahadevan','sachet tandon','parampara thakur',
  'jasleen royal','b praak','asees kaur','raj barman','dhvani bhanushali',
  'tulsi kumar','monali thakur','ash king','benny dayal','shilpa rao',
  'clinton cerejo','usha uthup','rekha bhardwaj','swanand kirkire',
  'sukhwinder singh','kavita krishnamurthy','vinod rathod','abhijeet',
]);

const BHOJPURI_ARTISTS = new Set([
  'pawan singh','khesari lal yadav','pramod premi','dinesh lal yadav',
  'ritesh pandey','samar singh','manoj tiwari','ravi kishan',
  'sharda sinha','malini awasthi','kalpana','indu sonali','anupama yadav',
  'neelkamal singh','awadhesh premi','gunjan singh','yamini singh',
  'arvind akela','kallu','trisha kar madhu',
]);

const TAMIL_ARTISTS = new Set([
  'anirudh ravichander','anirudh','sid sriram','harris jayaraj',
  'yuvan shankar raja','devi sri prasad','g.v. prakash kumar','gv prakash',
  'sean roldan','santhosh narayanan','hip hop tamizha','d. imman','d imman',
  'james vasanthan','vijay antony','chinmayi','andrea jeremiah',
  'sp balasubrahmanyam','spb','k. j. yesudas','haricharan',
]);

const TELUGU_ARTISTS = new Set([
  'ss thaman','thaman s','mani sharma','mickey j meyer','anup rubens',
  'kaala bhairava','rahul sipligunj','anurag kulkarni','geetha madhuri','sunitha',
]);

// ─── Title keyword scoring ────────────────────────────────────────────────────

const PUNJABI_WORDS = [
  'jatt','jatti','punjabi','pind','bhangra','kudiye','sardar','chandigarh',
  'ludhiana','amritsar','kudi','munde','yaari','pagg','gabru','waheguru',
  'nakhre','nakhra','jutti','rabb','sat sri akal','paranda','tikka',
];

const HINDI_WORDS = [
  'dil','pyaar','ishq','mohabbat','teri','mera','zindagi','duniya',
  'intezaar','kasam','wada','khwaab','sapna','raat','subah','yaar',
  'hum','tum','mujhe','tujhe','guzara','bharosa','dhoka','dard','aansu',
  'nachaoge','nachna','bolna','jaana','aana','sona','dono','koi',
];

const BHOJPURI_WORDS = [
  'bhojpuri','bol bam','sawan','devghar','bihar','bhojpur','piya',
  'sajanwa','sasariya','maai','bhaiya','bhabhi','tohar','hamar','rauwa',
  'balamua','lalanwa',
];

const TAMIL_WORDS = [
  'tamil','kollywood','enna','kadhal','nee','naan','unna','enakku',
  'sollathey','vaadi','kanne','kanmani',
];

const TELUGU_WORDS = [
  'telugu','tollywood','andhra','hyderabad','nenu','ninnu','prema',
  'nuvvu','meeru','babu','anna','akka','okka',
];

// ─── Vibe keyword maps ────────────────────────────────────────────────────────

const VIBE_KEYWORDS = {
  chill: [
    'chill','relax','calm','peaceful','acoustic','soft','slow','gentle','mellow',
    'night drive','late night','lounge','smooth','soothing','ambient','dreamy',
    'breezy','sunset','summer','indie','folk',
  ],
  lofi: [
    'lo-fi','lofi','lo fi','beats to study','study music','sleep music','rain',
    'café','coffee','chillhop','hip hop beats','rainy','bedroom',
  ],
  party: [
    'party','dance','club','dj','dhol','bang','banger','wedding','shaadi',
    'celebration','remix','mashup','anthem','festival','bass','edm','rave',
    'floor','hits','bhangra','garba','dandiya','navratri','holi','beats',
    'bounce','jump','vibe','turn up','lit','banger',
  ],
  sad: [
    'sad','dard','dil toota','broken','breakup','judai','judaai','aansu',
    'tears','cry','pain','hurt','lonely','alone','heartbreak','miss',
    'tanhaai','tanha','intezaar','wait','yaad','bhool','bhulay',
    'farewell','goodbye','distance','apart','empty',
  ],
  romantic: [
    'love','romantic','pyaar','ishq','mohabbat','romance','couple',
    'valentine','anniversary','crush','first','forever',
  ],
  devotional: [
    'bhajan','aarti','kirtan','mantra','bhakti','puja','hanuman',
    'shiva','rama','krishna','guru','waheguru','gurbani','path','chalisa',
  ],
};

// ─── Main detectors ───────────────────────────────────────────────────────────

/**
 * Detect the language of a track from its title + artist.
 * Returns one of: 'Punjabi' | 'Hindi' | 'Bhojpuri' | 'Tamil' | 'Telugu' | 'English'
 */
function detectLanguage(title = '', artist = '') {
  const a = artist.toLowerCase().replace(/\s*-\s*topic\s*$/i, '').trim();
  const t = title.toLowerCase();

  // Priority: artist exact-match (most reliable)
  for (const name of PUNJABI_ARTISTS)  if (a.includes(name)) return 'Punjabi';
  for (const name of BHOJPURI_ARTISTS) if (a.includes(name)) return 'Bhojpuri';
  for (const name of TAMIL_ARTISTS)    if (a.includes(name)) return 'Tamil';
  for (const name of TELUGU_ARTISTS)   if (a.includes(name)) return 'Telugu';
  for (const name of HINDI_ARTISTS)    if (a.includes(name)) return 'Hindi';

  // Title keyword scoring
  const scores = { Punjabi: 0, Hindi: 0, Bhojpuri: 0, Tamil: 0, Telugu: 0 };
  for (const w of PUNJABI_WORDS)  if (t.includes(w)) scores.Punjabi  += 2;
  for (const w of HINDI_WORDS)    if (t.includes(w)) scores.Hindi    += 1;
  for (const w of BHOJPURI_WORDS) if (t.includes(w)) scores.Bhojpuri += 3;
  for (const w of TAMIL_WORDS)    if (t.includes(w)) scores.Tamil    += 3;
  for (const w of TELUGU_WORDS)   if (t.includes(w)) scores.Telugu   += 3;

  const max = Math.max(...Object.values(scores));
  if (max >= 2) return Object.keys(scores).find(k => scores[k] === max);

  // Unicode heuristic: Devanagari script → Hindi
  if (/[\u0900-\u097F]/.test(title)) return 'Hindi';
  // Gurmukhi → Punjabi
  if (/[\u0A00-\u0A7F]/.test(title)) return 'Punjabi';

  return 'English';
}

/**
 * Detect the primary vibe/genre of a track.
 * Returns one of: 'chill' | 'lofi' | 'party' | 'sad' | 'romantic' | 'devotional' | 'mixed'
 */
function detectVibe(title = '', artist = '') {
  const combined = `${title} ${artist}`.toLowerCase();
  const scores = {};
  for (const [vibe, keywords] of Object.entries(VIBE_KEYWORDS)) {
    scores[vibe] = keywords.filter(kw => combined.includes(kw)).length;
  }
  const max = Math.max(...Object.values(scores));
  if (max >= 1) return Object.keys(scores).find(k => scores[k] === max);
  return 'mixed';
}

module.exports = { detectLanguage, detectVibe };
