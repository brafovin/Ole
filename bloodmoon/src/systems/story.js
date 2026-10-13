/**
 * Story content for Chapter I — "The Forgotten Night": speakers, readable notes and records,
 * dialogue scripts (with choices) and endings. All writing is original.
 */
export const SPEAKERS = {
  narrator: { name: '', color: '#b8a8c8' },
  elise: { name: 'Sister Elise', color: '#d8c8a8' },
  doran: { name: 'Doran the Smith', color: '#d8a878' },
  marta: { name: 'Old Marta', color: '#b8b8c8' },
  countess: { name: 'The Veiled Countess', color: '#ff4a5a' },
  voice: { name: '???', color: '#ff6a7a' },
};

export const NOTES = {
  altar: {
    title: 'A Bloodstained Note',
    body: `If you are reading this, then you woke. Good.

Do not trust the moon. Do not trust the bells. Do not trust anyone who says they know your name.

You have been gone for seven nights. The Treaty is broken — and they say it was broken by your hand.

Find the survivors in the village. Find the truth. And whatever you do, do not go to the Altar until you know what you are.

— a friend`,
    footer: 'The handwriting looks disturbingly like your own.',
  },
  sexton: {
    title: "The Sexton's Last Prayer",
    body: `The seventh night. The Countess's riders came for the Treaty Stone. The royal guard knelt before the red moon and rose again hollow.

I hid the stranger behind the altar, as the Queen asked me. Their blood glowed like a coal in the dark.

The Queen said: "When they wake, give them the key. They will need to see what has been done."

Forgive me. I am so tired. The key is around my neck.`,
    footer: "You take the Sexton's Key from the rosary chain.",
  },
  sarcophagus: {
    title: 'The Royal Sarcophagus',
    body: `HERE LIES MORWEN, QUEEN OF NOCTURNA.
HER HEART WAS NOT BURIED WITH HER.

The lid has been dragged aside. The stone coffin is empty but for a silver circlet and a dried handprint of blood on the inner wall.

The handprint is exactly the size of yours.`,
  },
  prayerbook: {
    title: 'Psalm of the Pale Moon',
    body: `"When the moon drinks, the hungry shall be made hollow.
When the heir wakes, the hollow shall kneel.
When the heart is given, the door shall open,
and the night shall have no end."

Someone has underlined the word "heir" three times, so hard the quill tore the page.`,
  },
  decree: {
    title: 'Royal Decree of King Aurelian',
    body: `By the Ancient Treaty, no vampire of the Night Court shall feed upon the people of Nocturna, and no hunter shall raise silver against the Court.

On the Seventh Night of the Crimson Season, the Treaty shall be renewed at the Forgotten Cathedral with the blood of the royal line.

All citizens are to remain indoors when the bells ring.`,
    footer: 'Beneath the seal, someone has written in blood: THE KING NEVER CAME.',
  },
  ledger: {
    title: "Mayor Halden's Ledger",
    body: `Taken by the veiled riders —
Night 1: the Brennan family.
Night 2: the miller and his wife.
Night 3: eleven from the lower street.
Night 5: the chapel choir.
Night 7: everyone who remained in the square.

They take them north, to the Blood Altar. The Countess pays in silver to keep us quiet. God forgive me, I took it.

Last page: "She says the moon must drink one thousand souls to open the door. She says the heir will open it — whether they want to or not."`,
  },
  journal: {
    title: "Hunter's Journal — Silver Order",
    body: `Day 6. The Countess is not the master here. She is a doorkeeper. Something behind the moon speaks through her, and she answers like a lover.

Day 7. We found the royal heir at the Treaty Stone, covered in the Queen's blood, the Stone in pieces at their feet. They did not remember a thing. Their eyes burned red.

The Captain wanted silver through their heart. I hid them in the cathedral instead.

If you are reading this, heir: it wasn't you. Something used your hands.`,
  },
  courier: {
    title: "Courier's Satchel",
    body: `"Mayor's key — deliver to the Silver Order at once. The proof is in his study. Tell them the Countess pays him."

The paper is torn by long claw marks. Beneath it, the brass Mayor's Key — and a spare Blood Vial.`,
  },
  record1: {
    title: 'Lost Record I — On the Treaty',
    body: `Three hundred years ago, the Night Court and the human kingdom of Nocturna swore an oath upon a stone carved from fallen moonlight.

While the Treaty Stone stood, the moon stayed silver and the hunger stayed quiet. Vampire and human shared the long nights in uneasy peace.`,
  },
  record2: {
    title: 'Lost Record II — On the Hollowing',
    body: `A vampire who drinks blood touched by a crimson moon is "hollowed": strong, obedient and empty, a suit of armour with hunger inside.

On the seventh night, the royal guard drank the Countess's moon-wine as a toast to the Treaty. By dawn they were Hollow Knights.`,
  },
  record3: {
    title: 'Lost Record III — On the Royal Line',
    body: `Only royal blood can bind the moon. Only royal blood can open it.

Queen Morwen hid her only heir among commoners — a noble's ward, a scholar's daughter, a hunter's apprentice — so that no one, not even the King, could find them.`,
  },
  record4: {
    title: 'Lost Record IV — On the Veiled Countess',
    body: `Countess Ilsabet was Morwen's elder sister. When King Aurelian chose Morwen as his queen, Ilsabet took the veil and swore she would never be refused again.

Every night since, she has stood beneath the moon, listening to something only she can hear.`,
  },
  record5: {
    title: 'Lost Record V — On the Door',
    body: `Behind the crimson moon lies the Eternal Night: a realm of hunger without end.

It has a door. The door has a lock. The lock is shaped like a heart.

Some say the first king of the Night Court built that door. Some say he is still behind it, waiting for his blood to come home.`,
  },
};

const P = 'player';

export const DIALOGUES = {
  // ------------------------------------------------------------------ Sister Elise
  elise: [
    { who: 'elise', text: 'Stay back! I have— oh. Your eyes. You are one of them… but you are not hollow. You can still think.' },
    { who: P, text: { lucien: 'I mean you no harm, Sister. I woke in the cathedral with no memory of how I got there.', seraphina: 'Relax, Sister. If I wanted your blood, you would already be asleep.', kairo: "Easy. I'm a hunter. …Was a hunter. It's complicated." } },
    { who: 'elise', text: 'Seven nights the moon has been red. The veiled riders come when the bells ring, and someone else is gone. They take them north.' },
    { who: 'elise', text: 'Doran the smith is hiding in his forge, if those crawling things have not found him. And old Marta… they caged her in the square as bait. Please — find them.' },
    {
      who: 'elise', text: 'You look starved. The hollow ones go mad with thirst… I can give you a little of my blood. Or take this — my silver thimble. It has kept me strong through a hundred vigils.',
      choices: [
        { text: 'Drink from her. (Restores all health and blood energy)', set: { choice_elise: 'drink' }, goto: 'drink' },
        { text: 'Refuse gently and take the Silver Thimble.', set: { choice_elise: 'refuse' }, goto: 'refuse' },
      ],
    },
    { label: 'drink', who: 'elise', text: "…There. Don't look at me like that. Go — and come back alive.", effect: (g) => { g.player.hp = g.player.maxHp; g.player.blood = g.player.maxBlood; g.audio.play('heal'); }, goto: 'safe' },
    { label: 'refuse', who: 'elise', text: 'Then take it, with my blessing. You are kinder than the stories say.', effect: (g) => g.inventory.add('thimble', 1) },
    { label: 'safe', who: 'elise', text: 'This chapel is safe. The shrine will mend you, and the dark cannot follow you in here.' },
  ],
  elise_again: [{ who: 'elise', text: (g) => (g.flags.gate_open ? 'The gate is open. May the old saints walk with you into that forest.' : 'Rest at the shrine if you need to. The light keeps them away.') }],

  // ------------------------------------------------------------------ Doran
  doran: [
    { who: 'doran', text: 'Are they gone? …You killed them? Saints. With that face I thought you were the next thing coming to eat me.' },
    { who: P, text: { default: 'What happened to the royal guard? They fight like empty armour.', kairo: 'Your royal guard looked a little… hollow. What happened?' } },
    { who: 'doran', text: 'Good men, once. They drank the moon-wine the Countess sent for the Treaty night and came back like that. Hollow Knights, the priest called them.' },
    { who: 'doran', text: 'They hide behind those tower shields. Hit them hard — a heavy blow breaks their guard. Or hit them from behind.' },
    { who: 'doran', text: "Take these vials — old herd blood, your kind can drink it. And if you free Marta, she has the crank key for the North Gate. I'll raise it once everyone's safe.", effect: (g) => g.inventory.add('vial', 2) },
  ],
  doran_again: [{ who: 'doran', text: (g) => (g.flags.gate_open ? "Go on. The forest won't wait, and neither will she." : 'Find Marta and the others. Then I can raise the gate.') }],

  // ------------------------------------------------------------------ Marta
  marta: [
    { who: 'marta', text: 'Heh… a child of the night opening my cage. Either the world has gone mad, or I have.' },
    {
      who: 'marta', text: 'I know you. I saw you seven nights ago, walking up the north road with the Queen\'s heart in your hands. Your eyes were burning like coals.',
      choices: [
        { text: 'What did I do?', goto: 'what' },
        { text: "You're mistaken.", goto: 'mistaken' },
      ],
    },
    { label: 'what', who: 'marta', text: 'You followed the Countess\'s riders into the forest, like a sleepwalker. Like something else was wearing you.', goto: 'gift' },
    { label: 'mistaken', who: 'marta', text: 'Am I? Then why are your hands shaking, child?' },
    { label: 'gift', who: 'marta', text: "Take my husband's rosary. He was a hunter — too stubborn to die until the very end. And tell Doran to turn the crank. The North Gate is the only road to the Altar.", effect: (g) => g.inventory.add('rosary', 1) },
  ],
  marta_again: [{ who: 'marta', text: 'The forest whispers. Whatever it says — do not answer it.' }],

  gate_open: [
    { who: 'doran', text: 'All three of us, alive! Stand back — I am raising the North Gate!' },
    { who: 'narrator', text: 'Chains groan somewhere above the town wall. The iron portcullis of the North Gate rises into the dark.' },
    { who: 'doran', text: 'Whatever is waiting in that forest — make it bleed.' },
  ],

  // ------------------------------------------------------------------ The Veiled Countess
  countess_intro: [
    { who: 'countess', text: 'Ahh… the little heir returns to me. Seven nights I have waited beneath this moon for you.' },
    { who: P, text: { lucien: 'You. I remember your voice.', seraphina: "So you're the one who has been stealing my evenings.", kairo: "Lady, I've hunted worse than you. …Probably." } },
    {
      who: 'countess', text: 'You still do not remember? You shattered the Treaty Stone with your own hands. You carried my sister\'s heart to this altar. You opened the first lock of the door.',
      choices: [
        { text: 'Where are the villagers?', goto: 'villagers' },
        { text: 'Why use me?', goto: 'why' },
      ],
    },
    { label: 'villagers', who: 'countess', text: 'Inside the moon, darling. Every drop of them feeds the door. One thousand souls… and one royal heart. Yours.', goto: 'kneel' },
    { label: 'why', who: 'countess', text: 'Because only royal blood can open the Eternal Night. Morwen hid you so well. But blood always calls to blood.' },
    { label: 'kneel', who: 'countess', text: 'Kneel, and I will make the end gentle.' },
    { who: P, text: { lucien: '…No.', seraphina: 'I never kneel. It wrinkles the dress.', kairo: "Yeah, that's a no." } },
  ],

  countess_defeat: [
    { who: 'countess', text: 'No… the moon… it promised me…' },
    { who: 'countess', text: 'You think you have won? I was only the doorkeeper. The one who wears your face is still waiting behind the moon — and he remembers everything you have forgotten.' },
    {
      who: 'countess', text: 'Drink my blood… and you will see the truth. Or let me rot here, and stay blind.',
      choices: [
        { text: 'Take her blood. (The Crimson Path)', set: { ending: 'crimson' }, goto: 'crimson' },
        { text: 'Let her rest. (The Silver Path)', set: { ending: 'silver' }, goto: 'silver' },
      ],
    },
    { label: 'crimson', who: 'narrator', text: 'Her blood burns through you like liquid fire. For one heartbeat you see a throne behind the moon — and a figure upon it, wearing a crown. Wearing your face.', goto: 'end' },
    { label: 'silver', who: 'narrator', text: 'You close her eyes. The veil slips away, and for a moment she looks only tired, and very young. Above you, the moon begins to crack.' },
    { label: 'end', who: 'narrator', text: 'The crimson moon splits open like an eye. Somewhere far above, an ancient door groans on its hinges… and something on the other side whispers your name.' },
  ],
};

export const ENDINGS = {
  crimson: {
    title: 'The Crimson Path',
    text: 'You drank the Countess\'s blood and glimpsed the truth: a king behind the moon who shares your face. The hunger is louder now — and so is the power.',
  },
  silver: {
    title: 'The Silver Path',
    text: 'You let the Countess rest. Your memories remain buried, but your hands are your own. For now, that is enough.',
  },
};

export const TUTORIAL_TIPS = [
  'WASD — move · Mouse — look · Shift — sprint · Space — jump',
  'Left click — attack combo · Right click — character special (heavy / crescent / block)',
  'Q / E — supernatural abilities · R — ultimate · F — interact · H — drink a Blood Vial',
  'Tab — inventory & stats · Esc — pause · Rest at Blood Shrines to heal and save',
];
