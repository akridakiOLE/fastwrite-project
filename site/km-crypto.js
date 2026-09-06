// Kostometro — από τις 12 λέξεις στα κλειδιά (Brief Α, Α350 §9.8 Η.2)
// ---------------------------------------------------------------------------
// Καθαρό JS, καμία βιβλιοθήκη, μόνο WebCrypto του browser.
//
// ΤΙ ΚΑΝΕΙ:
//   kmNewWords()            -> 12 λέξεις (128 bits τυχαιότητα + έλεγχος BIP39)
//   kmCheckWords(s)         -> {ok, words, error} — πιάνει λάθος λέξη ΚΑΙ λάθος σειρά
//   kmDerive(words)         -> {folderId, authToken, key}  (αργό: PBKDF2)
//   kmSeal(key, bytes)      -> κρυπτογραφημένο μπλοκ (IV + AES-GCM)
//   kmOpen(key, blob)       -> τα αρχικά bytes, ή σφάλμα αν το κλειδί είναι λάθος
//
// ΓΙΑΤΙ ΤΡΙΑ ΞΕΧΩΡΙΣΤΑ ΠΡΑΓΜΑΤΑ ΑΠΟ ΤΙΣ ΙΔΙΕΣ ΛΕΞΕΙΣ:
//   folderId  — δημόσιο αναγνωριστικό, πάει στον server
//   authToken — κωδικός πρόσβασης, πάει στον server (που κρατά μόνο το sha256 του)
//   key       — ΤΟ ΚΛΕΙΔΙ ΚΡΥΠΤΟΓΡΑΦΗΣΗΣ. ⛔ ΔΕΝ ΦΕΥΓΕΙ ΠΟΤΕ ΑΠΟ ΤΗ ΣΥΣΚΕΥΗ.
//   Παράγονται με HKDF από τον ίδιο σπόρο, με διαφορετική ετικέτα το καθένα —
//   άρα από το folderId ή το authToken ΔΕΝ βγαίνει το κλειδί.
//
// Η λίστα λέξεων είναι η επίσημη αγγλική BIP39 (2048 λέξεις, sha256 της λίστας
// 2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda).
// Απόφαση Stavros 2/9/2026: αγγλική, όχι ελληνική — έχει ενσωματωμένο έλεγχο
// ορθότητας και δεν έχει τόνους/τελικό ς που σπάνε το ταίριασμα.
// ⚠ Η παραγωγή κλειδιού ΔΕΝ είναι συμβατή με πορτοφόλια BIP39 και δεν χρειάζεται
// να είναι: δανειζόμαστε μόνο τη λίστα και τον έλεγχο.
// ---------------------------------------------------------------------------

var KM_WORDS = (
  "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antenna antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attitude attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base basic basket battle beach bean beauty because become beef before begin behave behind believe below belt bench benefit best betray better between beyond bicycle bid bike bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood blossom blouse blue blur blush board boat body boil bomb bone bonus book boost border boring borrow boss bottom bounce box boy bracket brain brand brass brave bread breeze brick bridge brief bright bring brisk broccoli broken bronze broom brother brown brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital captain car carbon card cargo carpet carry cart case cash casino castle casual cat catalog catch category cattle caught cause caution cave ceiling celery cement census century cereal certain chair chalk champion change chaos chapter charge chase chat cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify claw clay clean clerk clever click client cliff climb clinic clip clock clog close cloth cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect color column combine come comfort comic common company concert conduct confirm congress connect consider control convince cook cool copper copy coral core corn correct cost cotton couch country couple course cousin cover coyote crack cradle craft cram crane crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup cupboard curious current curtain curve cushion custom cute cycle dad damage damp dance danger daring dash daughter dawn day deal debate debris decade december decide decline decorate decrease deer defense define defy degree delay deliver demand demise denial dentist deny depart depend deposit depth deputy derive describe desert design desk despair destroy detail detect develop device devote diagram dial diamond diary dice diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree discover disease dish dismiss disorder display distance divert divide divorce dizzy doctor document dog doll dolphin domain donate donkey donor door dose double dove draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth easily east easy echo ecology economy edge edit educate effort egg eight either elbow elder electric elegant element elephant elevator elite else embark embody embrace emerge emotion employ empower empty enable enact end endless endorse enemy energy enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire entry envelope episode equal equip era erase erode erosion error erupt escape essay essence estate eternal ethics evidence evil evoke evolve exact example excess exchange excite exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand expect expire explain expose express extend extra eye eyebrow fabric face faculty fade faint faith fall false fame family famous fan fancy fantasy farm fashion fat fatal father fatigue fault favorite feature february federal fee feed feel female fence festival fetch fever few fiber fiction field figure file film filter final find fine finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor flee flight flip float flock floor flower fluid flush fly foam focus fog foil fold follow food foot force forest forget fork fortune forum forward fossil foster found fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit fuel fun funny furnace fury future gadget gain galaxy gallery game gap garage garbage garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass glide glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel gossip govern gown grab grace grain grant grape grass gravity great green grid grief grit grocery group grow grunt guard guess guide guilt guitar gun gym habit hair half hammer hamster hand happy harbor hard harsh harvest hat have hawk hazard head health heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness image imitate immense immune impact impose improve impulse inch include income increase index indicate indoor industry infant inflict inform inhale inherit initial inject injury inmate inner innocent input inquiry insane insect inside inspire install intact interest into invest invite involve iron island isolate issue item ivory jacket jaguar jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle junior junk just kangaroo keen keep ketchup key kick kid kidney kind kingdom kiss kit kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady lake lamp language laptop large later latin laugh laundry lava law lawn lawsuit layer lazy leader leaf learn leave lecture left leg legal legend leisure lemon lend length lens leopard lesson letter level liar liberty library license life lift light like limb limit link lion liquid list little live lizard load loan lobster local lock logic lonely long loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine mad magic magnet maid mail main major make mammal man manage mandate mango mansion manual maple marble march margin marine market marriage mask mass master match material math matrix matter maximum maze meadow mean measure meat mechanic medal media melody melt member memory mention menu mercy merge merit merry mesh message metal method middle midnight milk million mimic mind minimum minor minute miracle mirror misery miss mistake mix mixed mixture mobile model modify mom moment monitor monkey monster month moon moral more morning mosquito mother motion motor mountain mouse move movie much muffin mule multiply muscle museum mushroom music must mutual myself mystery myth naive name napkin narrow nasty nation nature near neck need negative neglect neither nephew nerve nest net network neutral never news next nice night noble noise nominee noodle normal north nose notable note nothing notice novel now nuclear number nurse nut oak obey object oblige obscure observe obtain obvious occur ocean october odor off offer office often oil okay old olive olympic omit once one onion online only open opera opinion oppose option orange orbit orchard order ordinary organ orient original orphan ostrich other outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle page pair palace palm panda panel panic panther paper parade parent park parrot party pass patch path patient patrol pattern pause pave payment peace peanut pear peasant pelican pen penalty pencil people pepper perfect permit person pet phone photo phrase physical piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza place planet plastic plate play please pledge pluck plug plunge poem poet point polar pole police pond pony pool popular portion position possible post potato pottery poverty powder power practice praise predict prefer prepare present pretty prevent price pride primary print priority prison private prize problem process produce profit program project promote proof property prosper protect proud provide public pudding pull pulp pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid quality quantum quarter question quick quit quiz quote rabbit raccoon race rack radar radio rail rain raise rally ramp ranch random range rapid rare rate rather raven raw razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect reform refuse region regret regular reject relax release relief rely remain remember remind remove render renew rent reopen repair repeat replace report require rescue resemble resist resource response result retire retreat return reunion reveal review reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring riot ripple risk ritual rival river road roast robot robust rocket romance roof rookie room rose rotate rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save say scale scan scare scatter scene scheme school science scissors scorpion scout scrap screen script scrub sea search season seat second secret section security seed seek segment select sell seminar senior sense sentence series service session settle setup seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick side siege sight sign silent silk silly silver similar simple since sing siren sister situate six size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow soap soccer social sock soda soft solar soldier solid solution solve someone song soon sorry sort soul sound soup source south space spare spatial spawn speak special speed spell spend sphere spice spider spike spin spirit split spoil sponsor spoon sport spot spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp stand start state stay steak steel stem step stereo stick still sting stock stomach stone stool story stove strategy street strike strong struggle student stuff stumble style subject submit subway success such sudden suffer sugar suggest suit summer sun sunny sunset super supply supreme sure surface surge surprise surround survey suspect sustain swallow swamp swap swarm swear sweet swift swim swing switch sword symbol symptom syrup system table tackle tag tail talent talk tank tape target task taste tattoo taxi teach team tell ten tenant tennis tent term test text thank that theme then theory there they thing this thought three thrive throw thumb thunder ticket tide tiger tilt timber time tiny tip tired tissue title toast tobacco today toddler toe together toilet token tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise toss total tourist toward tower town toy track trade traffic tragic train transfer trap trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble truck true truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle uncover under undo unfair unfold unhappy uniform unique unit universe unknown unlock until unusual unveil update upgrade uphold upon upper upset urban urge usage use used useful useless usual utility vacant vacuum vague valid valley valve van vanish vapor various vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran viable vibrant vicious victory video view village vintage violin virtual virus visa visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon wear weasel weather web wedding weekend weird welcome west wet whale what wheat wheel when where whip whisper wide width wife wild will win window wine wing wink winner winter wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo").split(" ");

var KM_KDF_SALT = "kostometro/v1";   // ⚠ ΜΗΝ ΤΟ ΑΛΛΑΞΕΙΣ ΠΟΤΕ — αλλάζει όλα τα κλειδιά όλων.
var KM_KDF_ITER = 210000;

function kmBytesToHex(b) {
  return Array.prototype.map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}

// ── 12 λέξεις ──────────────────────────────────────────────────────────────

async function kmSha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function kmBitsOf(bytes) {
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(2).padStart(8, "0");
  return s;
}

// 128 bits τυχαιότητα + 4 bits έλεγχος = 132 = 12 λέξεις × 11 bits.
async function kmNewWords() {
  var ent = new Uint8Array(16);
  crypto.getRandomValues(ent);
  var h = await kmSha256(ent);
  var bits = kmBitsOf(ent) + kmBitsOf(h.subarray(0, 1)).slice(0, 4);
  var out = [];
  for (var i = 0; i < 12; i++) out.push(KM_WORDS[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]);
  return out;
}

// Δέχεται ό,τι κι αν πληκτρολογήσει ο χρήστης: κεφαλαία, διπλά κενά, αλλαγές γραμμής.
function kmNormalize(input) {
  return String(input || "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ").filter(function (x) { return x; });
}

async function kmCheckWords(input) {
  var w = kmNormalize(input);
  if (w.length !== 12) return { ok: false, error: "Χρειάζονται ακριβώς 12 λέξεις — έδωσες " + w.length + "." };
  var bits = "";
  for (var i = 0; i < 12; i++) {
    var idx = KM_WORDS.indexOf(w[i]);
    if (idx < 0) return { ok: false, error: "Η λέξη " + (i + 1) + " («" + w[i] + "») δεν είναι στη λίστα.", badWord: i };
    bits += idx.toString(2).padStart(11, "0");
  }
  var entBits = bits.slice(0, 128), csBits = bits.slice(128);
  var ent = new Uint8Array(16);
  for (var j = 0; j < 16; j++) ent[j] = parseInt(entBits.slice(j * 8, j * 8 + 8), 2);
  var h = await kmSha256(ent);
  if (kmBitsOf(h.subarray(0, 1)).slice(0, 4) !== csBits) {
    return { ok: false, error: "Οι λέξεις είναι υπαρκτές αλλά ο συνδυασμός δεν είναι έγκυρος — κάποια είναι λάθος ή σε λάθος σειρά." };
  }
  return { ok: true, words: w };
}

// ── από τις λέξεις στα κλειδιά ─────────────────────────────────────────────

async function kmHkdf(seedKey, label, bits) {
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("kostometro/" + label) },
    seedKey, bits
  );
}

// ⚠ Αργό επίτηδες (PBKDF2 210.000 επαναλήψεις): αν κλαπεί ο φάκελος από τον
// server, κάθε δοκιμή του κλέφτη κοστίζει. Τρέχει ΜΙΑ φορά, στην είσοδο.
async function kmDerive(words) {
  var phrase = (Array.isArray(words) ? words : kmNormalize(words)).join(" ");
  var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveBits"]);
  var seed = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(KM_KDF_SALT), iterations: KM_KDF_ITER, hash: "SHA-256" },
    base, 256
  );
  var seedKey = await crypto.subtle.importKey("raw", seed, "HKDF", false, ["deriveBits"]);
  var folderBits = await kmHkdf(seedKey, "folder", 256);
  var authBits = await kmHkdf(seedKey, "auth", 256);
  var encBits = await kmHkdf(seedKey, "enc", 256);
  var key = await crypto.subtle.importKey("raw", encBits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return { folderId: kmBytesToHex(folderBits), authToken: kmBytesToHex(authBits), key: key };
}

// ── σφράγισμα / άνοιγμα ────────────────────────────────────────────────────

// Μπροστά μπαίνει τυχαίο IV 12 bytes. Κάθε σφράγισμα δίνει άλλα bytes, ακόμα
// και για τα ίδια δεδομένα — έτσι ο server δεν βλέπει ούτε αν κάτι άλλαξε.
async function kmSeal(key, bytes) {
  var iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes);
  var out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return out;
}

async function kmOpen(key, blob) {
  var b = new Uint8Array(blob);
  if (b.length < 13) throw new Error("Ο φάκελος είναι πολύ μικρός για να είναι αληθινός.");
  var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.subarray(0, 12) }, key, b.subarray(12));
  return new Uint8Array(plain);
}

// ── Η.13 · Η ΝΕΑ ΒΑΣΗ Κ (Brief Γ, 6/9/2026) ────────────────────────────────
// Ως τη v46: λέξεις → κλειδί δεδομένων. Άρα αλλαγή λέξεων = ξανακρυπτογράφηση
// των πάντων (αδύνατη σε κινητό που από τη v40 δεν έχει καν τις φωτογραφίες).
// Από εδώ: τα δεδομένα κρυπτογραφούνται με ΤΥΧΑΙΟ κλειδί Κ που δεν βγαίνει
// από λέξεις. Οι 12 λέξεις παράγουν ΜΟΝΟ μια «κλειδαριά»:
//   lockId    — δημόσιο αναγνωριστικό της κλειδαριάς (πάει στον server)
//   authToken — κωδικός πρόσβασης της κλειδαριάς (ο server κρατά sha256)
//   kek       — κλειδί που ΚΛΕΙΔΩΝΕΙ το Κ. ⛔ ΔΕΝ ΦΕΥΓΕΙ ΠΟΤΕ ΑΠΟ ΤΗ ΣΥΣΚΕΥΗ.
// Στον server ζει το Κ κλειδωμένο με το kek (~60 bytes). Αλλαγή λέξεων =
// νέα κλειδαριά με το ΙΔΙΟ Κ, μηδέν ξανακρυπτογράφηση. Η ίδια δομή σηκώνει
// το backup ανάκτησης (δύο μισά) και τις προσκλήσεις του PRO.
// Οι παλιές συναρτήσεις (kmDerive) ΜΕΝΟΥΝ: τις χρειάζεται η μετανάστευση
// του ενός υπάρχοντος λογαριασμού και ο κώδικας v46 μέχρι τη v47.
// Ετικέτες HKDF ΔΙΑΦΟΡΕΤΙΚΕΣ από τις παλιές («folder»/«auth»/«enc»), ώστε
// τίποτα από το παλιό σχήμα να μη γίνεται μυστικό του νέου.

function kmRandomHex(n) {
  var a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return kmBytesToHex(a);
}

// Το Κ: 32 τυχαία bytes. Γεννιέται ΜΙΑ φορά ανά φάκελο, στη συσκευή.
function kmNewK() {
  var k = new Uint8Array(32);
  crypto.getRandomValues(k);
  return k;
}

// Το folder_id δεν βγαίνει πια από λέξεις: τυχαίο, μόνιμο.
function kmNewFolderId() { return kmRandomHex(32); }

// Από τα 32 bytes του Κ στο κλειδί AES που ανοίγει/σφραγίζει τα δεδομένα.
async function kmImportK(rawK) {
  return crypto.subtle.importKey("raw", rawK, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// Από τις 12 λέξεις στην κλειδαριά. Ίδιο PBKDF2 (αργό επίτηδες), άλλες ετικέτες.
async function kmDeriveLock(words) {
  var phrase = (Array.isArray(words) ? words : kmNormalize(words)).join(" ");
  var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveBits"]);
  var seed = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(KM_KDF_SALT), iterations: KM_KDF_ITER, hash: "SHA-256" },
    base, 256
  );
  var seedKey = await crypto.subtle.importKey("raw", seed, "HKDF", false, ["deriveBits"]);
  var lockBits = await kmHkdf(seedKey, "lock", 256);
  var authBits = await kmHkdf(seedKey, "lock-auth", 256);
  var kekBits = await kmHkdf(seedKey, "kek", 256);
  var kek = await crypto.subtle.importKey("raw", kekBits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return { lockId: kmBytesToHex(lockBits), authToken: kmBytesToHex(authBits), kek: kek };
}

// Κλείδωμα του Κ: IV(12) + AES-GCM(32 + 16 tag) = 60 bytes. Επιστρέφει hex.
async function kmWrapK(kek, rawK) {
  if (!(rawK instanceof Uint8Array) || rawK.length !== 32) throw new Error("Το Κ πρέπει να είναι 32 bytes.");
  return kmBytesToHex(await kmSeal(kek, rawK));
}

// Ξεκλείδωμα: hex → 32 bytes Κ. Με λάθος λέξεις πετάει σφάλμα, δεν δίνει σκουπίδια.
async function kmUnwrapK(kek, wrappedHex) {
  if (!/^[0-9a-f]{120}$/.test(wrappedHex || "")) throw new Error("Η κλειδαριά έχει λάθος μορφή.");
  var b = new Uint8Array(60);
  for (var i = 0; i < 60; i++) b[i] = parseInt(wrappedHex.substr(i * 2, 2), 16);
  var k = await kmOpen(kek, b);
  if (k.length !== 32) throw new Error("Η κλειδαριά άνοιξε αλλά δεν περιείχε κλειδί.");
  return k;
}

// Από hex σε bytes — για το Κ που ζει αποθηκευμένο ως 64 hex στη συσκευή.
// ⚠ Αυστηρό: ό,τι δεν είναι ακριβώς hex πετάει σφάλμα αντί να δώσει σκουπίδια,
// γιατί «κλειδί από σκουπίδια» σημαίνει δεδομένα που δεν ανοίγουν ποτέ ξανά.
function kmHexToBytes(hex) {
  var s = String(hex || "");
  if (s.length % 2 !== 0 || !/^[0-9a-f]*$/.test(s)) throw new Error("Δεν είναι hex.");
  var out = new Uint8Array(s.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}
