import type { Language, SpeechKind, TimeSlot, Tone } from './types';

/**
 * Built-in, free phrase templates. No network, no API: lines are picked locally by
 * language, tone (personality), time slot and situation.
 *
 * Placeholders:
 *   {name}  character name        {user}  user name (line skipped when unknown)
 *   {,user} ", <user name>" or nothing      {day}  weekday     {time}  HH:MM
 *   {site}  current site host name (line skipped when unknown)
 */
export type ToneLines = { default: string[] } & Partial<Record<Tone, string[]>>;

export interface LanguageBook {
  greeting: Record<TimeSlot, ToneLines>;
  /** Mixed into greetings on Saturday and Sunday. */
  weekend: ToneLines;
  again: ToneLines;
  click: ToneLines;
  poke: ToneLines;
  idle: ToneLines;
  wake: ToneLines;
  drop: ToneLines;
  bye: ToneLines;
  /** Sunday first, like Date#getDay(). */
  weekdays: string[];
}

const fr: LanguageBook = {
  weekdays: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  greeting: {
    morning: {
      default: ['Bonjour{,user} !', 'Coucou{,user}, bien dormi ?', 'Bonjour ! On attaque ce {day} ensemble ?'],
      cheerful: ['Bonjour{,user} ! Quelle belle matinée pour explorer le web !', 'Debout, debout ! Il fait jour et j’ai une pêche d’enfer !'],
      calm: ['Bonjour{,user}. Prends ton temps, la journée commence doucement.', 'Une matinée tranquille… parfait pour bien démarrer.'],
      playful: ['Pssst… Bonjour ! Tu as vu ? Le soleil s’est levé rien que pour nous !', 'Coucou ! J’ai fait trois sauts périlleux en t’attendant. Bon, deux.'],
      shy: ['Oh… bonjour{,user}. Je peux rester un peu ici ?', 'B-bonjour… J’espère que tu as bien dormi.'],
      grumpy: ['Mmh. Bonjour. Il est tôt, quand même.', 'Déjà debout ? Bon. Bonjour{,user}.'],
    },
    afternoon: {
      default: ['Bon après-midi{,user} !', 'Salut{,user} ! Ça se passe bien, ce {day} ?', 'Coucou ! Une petite pause ?'],
      cheerful: ['Salut{,user} ! L’après-midi s’annonce génial !', 'Hello ! On continue la journée ? Moi, j’ai la forme !'],
      calm: ['Bon après-midi. On continue tranquillement ?', 'Salut{,user}. N’oublie pas de boire un peu d’eau.'],
      playful: ['Coucou ! C’est l’heure du goûter, non ? Non ? Dommage.', 'Te revoilà ! On reprend ?'],
      shy: ['Euh… salut{,user}. Je ne te dérange pas ?', 'Coucou… je me fais minuscule, promis.'],
      grumpy: ['Ah, c’est toi. Bon après-midi, j’imagine.', 'Salut. J’allais faire la sieste, mais bon.'],
    },
    evening: {
      default: ['Bonsoir{,user} !', 'Bonsoir ! Belle soirée en vue ?', 'Coucou{,user}, la journée a été bonne ?'],
      cheerful: ['Bonsoir{,user} ! La soirée commence, youpi !', 'Bonsoir ! On termine la journée en beauté ?'],
      calm: ['Bonsoir. C’est le moment de souffler un peu.', 'Bonsoir{,user}. Doucement, la journée se termine.'],
      playful: ['Bonsoir ! Les étoiles arrivent, je vais les compter. Un… deux…', 'Coucou ! C’est l’heure où les pixels s’amusent.'],
      shy: ['Bonsoir… je voulais juste dire bonsoir.', 'Oh, bonsoir{,user}. Tu as passé une bonne journée ?'],
      grumpy: ['Bonsoir. Encore devant l’écran ?', 'Mouais, bonsoir. Il était temps.'],
    },
    night: {
      default: ['Bonne nuit… enfin, presque ! Coucou{,user}.', 'Il est {time}, tu es encore debout ?', 'Coucou, oiseau de nuit !'],
      cheerful: ['Coucou, oiseau de nuit ! On veille ensemble ?', 'Même à {time}, ça me fait plaisir de te voir !'],
      calm: ['Il se fait tard{,user}. Pense à te reposer.', 'Chut… tout est calme. Bonsoir.'],
      playful: ['Psst ! Il est {time}, on fait une soirée pyjama ?', 'Les monstres sont couchés, il ne reste que nous deux !'],
      shy: ['Oh… tu es encore là ? Bonsoir…', 'Je ne savais pas que tu veillais si tard…'],
      grumpy: ['Il est {time}. Va dormir.', 'Sérieusement, à cette heure-ci ?'],
    },
  },
  weekend: {
    default: ['Bon {day}{,user} ! C’est le week-end !', 'Le week-end ! On flâne un peu ?'],
    grumpy: ['Même le {day}, tu es devant l’écran ?'],
  },
  again: {
    default: ['Re-coucou !', 'Te revoilà !', 'Encore moi !'],
    cheerful: ['Re-bonjour ! Trop bien de te revoir !', 'Te revoilà, super !'],
    calm: ['Re-bonjour.', 'Je suis toujours là.'],
    playful: ['Coucou-revoilà !', 'Tu ne peux plus te passer de moi, hein ?'],
    shy: ['Oh, re-bonjour…', 'C’est encore moi… si ça te va.'],
    grumpy: ['Encore toi.', 'Oui, oui, je suis là.'],
  },
  click: {
    default: ['Hé ! Ça chatouille !', 'Oui ?', 'Coucou !', 'Tu as besoin de moi ?'],
    cheerful: ['Hihi, salut !', 'Encore, encore !'],
    calm: ['Je suis là.', 'Mmh ?'],
    playful: ['Tu m’as eu !', 'Bip boup ! Ah non, ça c’est un robot.', 'Chatouilles interdites ! …Bon, d’accord.'],
    shy: ['Oh ! Tu m’as fait peur…', 'C’est… gentil.'],
    grumpy: ['Pas touche.', 'Quoi encore ?', 'Je t’ai vu.'],
  },
  poke: {
    default: ['Doucement, doucement !', 'La tête me tourne…', 'Ouh là, ça fait beaucoup de clics !'],
    playful: ['Waouh, je vois des étoiles !', 'Encore un clic et je m’envole !'],
    shy: ['S’il te plaît… pas si vite…'],
    grumpy: ['Ça suffit !', 'Tu cherches les ennuis ?'],
  },
  idle: {
    default: ['Je suis là si besoin.', 'On fait une pause ?', 'Je reste dans le coin.', 'N’oublie pas de faire une pause.'],
    cheerful: ['Quelle belle journée !', 'J’adore être ici avec toi !'],
    calm: ['Respire profondément… voilà.', 'Tout va bien.'],
    playful: ['Et si je sautais par-dessus cette barre de défilement ?', 'Je compte les pixels. J’en suis à mille deux.', 'Tu as {site} ouvert ? Je fais le guide ?'],
    shy: ['Je reste dans mon coin.', 'C’est calme, j’aime bien.'],
    grumpy: ['Je m’ennuie.', 'Ce site manque de coins confortables.'],
  },
  wake: {
    default: ['Hein ? Je ne dormais pas !', 'Oh, te revoilà !', 'Bâââille… coucou !'],
    grumpy: ['Je dormais, là.'],
    playful: ['Je rêvais d’un océan de pixels !'],
  },
  drop: {
    default: ['Ouf, atterrissage réussi !', 'Hop !', 'Merci pour le voyage !'],
    playful: ['Encore un tour de manège !', 'Dix sur dix pour la réception !'],
    shy: ['Oh… je suis où, là ?'],
    grumpy: ['Préviens, la prochaine fois.'],
  },
  bye: {
    default: ['À tout à l’heure !', 'Je me cache, à plus !', 'Je reviens vite !'],
    grumpy: ['Enfin un peu de calme.'],
    shy: ['D’accord… à bientôt.'],
  },
};

const en: LanguageBook = {
  weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  greeting: {
    morning: {
      default: ['Good morning{,user}!', 'Morning{,user}! Sleep well?', 'Hi! Ready for this {day}?'],
      cheerful: ['Good morning{,user}! What a lovely day to explore!', 'Rise and shine! I’m full of energy today!'],
      calm: ['Good morning{,user}. No rush, the day starts slowly.', 'A quiet morning… a nice way to begin.'],
      playful: ['Psst… good morning! The sun came up just for us!', 'Hi! I did three somersaults while I waited. Okay, two.'],
      shy: ['Oh… good morning{,user}. Can I stay here a while?', 'G-good morning… I hope you slept well.'],
      grumpy: ['Hmph. Morning. It’s early, you know.', 'Up already? Fine. Morning{,user}.'],
    },
    afternoon: {
      default: ['Good afternoon{,user}!', 'Hi{,user}! How’s your {day} going?', 'Hey! Time for a little break?'],
      cheerful: ['Hi{,user}! This afternoon is going to be great!', 'Hello! Ready for the rest of the day? I am!'],
      calm: ['Good afternoon. Shall we carry on, nice and easy?', 'Hi{,user}. Remember to drink some water.'],
      playful: ['Hey! Snack time, right? No? Shame.', 'You’re back! I was practising walking along the screen edge.'],
      shy: ['Um… hi{,user}. Am I bothering you?', 'Hi… I’ll keep very small, promise.'],
      grumpy: ['Oh, it’s you. Good afternoon, I suppose.', 'Hi. I was about to nap, but fine.'],
    },
    evening: {
      default: ['Good evening{,user}!', 'Evening! Nice night ahead?', 'Hi{,user}, did you have a good day?'],
      cheerful: ['Good evening{,user}! The evening starts now, yay!', 'Evening! Let’s end the day on a high!'],
      calm: ['Good evening. Time to unwind a little.', 'Evening{,user}. The day is winding down.'],
      playful: ['Evening! The stars are out, I’ll count them. One… two…', 'Hi! This is when pixels come out to play.'],
      shy: ['Good evening… I just wanted to say hi.', 'Oh, evening{,user}. Did you have a nice day?'],
      grumpy: ['Evening. Still at the screen?', 'Yeah, yeah, good evening.'],
    },
    night: {
      default: ['Almost bedtime! Hi{,user}.', 'It’s {time} — still up?', 'Hello, night owl!'],
      cheerful: ['Hello, night owl! Staying up together?', 'Even at {time}, I’m happy to see you!'],
      calm: ['It’s getting late{,user}. Remember to rest.', 'Shh… everything’s quiet. Good evening.'],
      playful: ['Psst! It’s {time}. Pyjama party?', 'The monsters are asleep, it’s just us now!'],
      shy: ['Oh… you’re still here? Good evening…', 'I didn’t know you stayed up this late…'],
      grumpy: ['It’s {time}. Go to bed.', 'Seriously, at this hour?'],
    },
  },
  weekend: {
    default: ['Happy {day}{,user}! It’s the weekend!', 'Weekend! Shall we take it slow?'],
    grumpy: ['Even on {day}, you’re at the screen?'],
  },
  again: {
    default: ['Hi again!', 'You’re back!', 'Me again!'],
    cheerful: ['Hello again! So glad you’re back!', 'You’re back, great!'],
    calm: ['Hello again.', 'Still here.'],
    playful: ['Peekaboo, again!', 'Can’t get enough of me, huh?'],
    shy: ['Oh, hi again…', 'It’s me again… if that’s okay.'],
    grumpy: ['You again.', 'Yes, yes, I’m here.'],
  },
  click: {
    default: ['Hey! That tickles!', 'Yes?', 'Hi there!', 'Need me?'],
    cheerful: ['Hehe, hi!', 'Again, again!'],
    calm: ['I’m here.', 'Hm?'],
    playful: ['You got me!', 'Beep boop! Wait, that’s a robot thing.', 'No tickling! …Okay, a little.'],
    shy: ['Oh! You startled me…', 'That’s… nice.'],
    grumpy: ['Hands off.', 'What now?', 'I saw that.'],
  },
  poke: {
    default: ['Easy, easy!', 'My head is spinning…', 'Whoa, that’s a lot of clicks!'],
    playful: ['Wow, I’m seeing stars!', 'One more click and I’ll fly away!'],
    shy: ['Please… not so fast…'],
    grumpy: ['That’s enough!', 'Looking for trouble?'],
  },
  idle: {
    default: ['I’m here if you need me.', 'Time for a short break?', 'I’ll stay nearby.', 'Don’t forget to take a break.'],
    cheerful: ['What a lovely day!', 'I love hanging out here with you!'],
    calm: ['Breathe in… and out.', 'All is well.'],
    playful: ['What if I jumped over the scrollbar?', 'I’m counting pixels. I’m at one thousand and two.', 'Browsing {site}? Want a tour guide?'],
    shy: ['I’ll stay in my corner.', 'It’s quiet. I like it.'],
    grumpy: ['I’m bored.', 'This site lacks comfy corners.'],
  },
  wake: {
    default: ['Huh? I wasn’t sleeping!', 'Oh, you’re back!', '*yawn*… hi!'],
    grumpy: ['I was sleeping, you know.'],
    playful: ['I dreamt of an ocean of pixels!'],
  },
  drop: {
    default: ['Phew, safe landing!', 'Hop!', 'Thanks for the ride!'],
    playful: ['Again! Again!', 'Ten out of ten for that landing!'],
    shy: ['Oh… where am I?'],
    grumpy: ['Warn me next time.'],
  },
  bye: {
    default: ['See you soon!', 'Hiding now, bye!', 'Be right back!'],
    grumpy: ['Finally, some peace.'],
    shy: ['Okay… see you.'],
  },
};

const es: LanguageBook = {
  weekdays: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  greeting: {
    morning: {
      default: ['¡Buenos días{,user}!', '¡Hola{,user}! ¿Dormiste bien?'],
      cheerful: ['¡Buenos días! ¡Qué día tan bonito para explorar!'],
      calm: ['Buenos días{,user}. Sin prisa, el día empieza despacio.'],
      playful: ['¡Psst! ¡Buenos días! El sol salió solo para nosotros.'],
      shy: ['Oh… buenos días{,user}. ¿Puedo quedarme un ratito?'],
      grumpy: ['Mmm. Buenos días. Es temprano, ¿eh?'],
    },
    afternoon: {
      default: ['¡Buenas tardes{,user}!', '¡Hola! ¿Qué tal tu {day}?'],
      cheerful: ['¡Hola{,user}! ¡Esta tarde va a ser genial!'],
      calm: ['Buenas tardes. Seguimos con calma, ¿vale?'],
      playful: ['¡Hola! Hora de merendar, ¿no? ¿No? Qué pena.'],
      shy: ['Eh… hola{,user}. ¿Te molesto?'],
      grumpy: ['Ah, eres tú. Buenas tardes, supongo.'],
    },
    evening: {
      default: ['¡Buenas noches{,user}!', '¿Qué tal el día{,user}?'],
      cheerful: ['¡Buenas noches! ¡Terminemos el día a lo grande!'],
      calm: ['Buenas noches. Hora de relajarse un poco.'],
      playful: ['¡Buenas noches! Voy a contar las estrellas. Una… dos…'],
      shy: ['Buenas noches… solo quería saludar.'],
      grumpy: ['Buenas noches. ¿Todavía frente a la pantalla?'],
    },
    night: {
      default: ['Son las {time}, ¿todavía no duermes?', '¡Hola, ave nocturna!'],
      cheerful: ['¡Hola, ave nocturna! ¿Trasnochamos juntos?'],
      calm: ['Se hace tarde{,user}. Recuerda descansar.'],
      playful: ['¡Psst! Son las {time}. ¿Fiesta de pijamas?'],
      shy: ['Oh… ¿sigues aquí? Buenas noches…'],
      grumpy: ['Son las {time}. A dormir.'],
    },
  },
  weekend: { default: ['¡Feliz {day}{,user}! ¡Es fin de semana!'] },
  again: { default: ['¡Hola otra vez!', '¡Has vuelto!'], grumpy: ['Tú otra vez.'], shy: ['Oh, hola otra vez…'] },
  click: { default: ['¡Eh! ¡Me haces cosquillas!', '¿Sí?', '¿Me necesitas?'], playful: ['¡Me pillaste!'], grumpy: ['No me toques.'], shy: ['¡Oh! Me asustaste…'] },
  poke: { default: ['¡Despacio, despacio!', 'Me da vueltas la cabeza…'], grumpy: ['¡Ya basta!'] },
  idle: { default: ['Doy un paseíto.', '¡Qué sitio tan bonito!', 'No olvides tomarte un descanso.'], playful: ['¿Y si salto la barra de desplazamiento?'], grumpy: ['Me aburro.'] },
  wake: { default: ['¿Eh? ¡No estaba durmiendo!', '¡Oh, has vuelto!'] },
  drop: { default: ['¡Uf, aterrizaje perfecto!', '¡Gracias por el viaje!'], grumpy: ['Avisa la próxima vez.'] },
  bye: { default: ['¡Hasta luego!', '¡Vuelvo enseguida!'] },
};

const de: LanguageBook = {
  weekdays: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  greeting: {
    morning: {
      default: ['Guten Morgen{,user}!', 'Morgen{,user}! Gut geschlafen?'],
      cheerful: ['Guten Morgen! Was für ein schöner Tag zum Entdecken!'],
      calm: ['Guten Morgen{,user}. Ganz in Ruhe, der Tag fängt langsam an.'],
      playful: ['Psst… guten Morgen! Die Sonne ist nur für uns aufgegangen!'],
      shy: ['Oh… guten Morgen{,user}. Darf ich ein bisschen hierbleiben?'],
      grumpy: ['Hm. Morgen. Ist ganz schön früh.'],
    },
    afternoon: {
      default: ['Guten Tag{,user}!', 'Hallo! Wie läuft dein {day}?'],
      cheerful: ['Hallo{,user}! Der Nachmittag wird super!'],
      calm: ['Guten Tag. Machen wir in Ruhe weiter?'],
      playful: ['Hallo! Zeit für einen Snack, oder? Nein? Schade.'],
      shy: ['Äh… hallo{,user}. Störe ich?'],
      grumpy: ['Ach, du bist es. Guten Tag, schätze ich.'],
    },
    evening: {
      default: ['Guten Abend{,user}!', 'Hattest du einen schönen Tag{,user}?'],
      cheerful: ['Guten Abend! Lass uns den Tag schön ausklingen lassen!'],
      calm: ['Guten Abend. Zeit, ein wenig durchzuatmen.'],
      playful: ['Guten Abend! Ich zähle die Sterne. Eins… zwei…'],
      shy: ['Guten Abend… ich wollte nur Hallo sagen.'],
      grumpy: ['Abend. Immer noch am Bildschirm?'],
    },
    night: {
      default: ['Es ist {time} — noch wach?', 'Hallo, Nachteule!'],
      cheerful: ['Hallo, Nachteule! Bleiben wir zusammen wach?'],
      calm: ['Es wird spät{,user}. Denk daran, dich auszuruhen.'],
      playful: ['Psst! Es ist {time}. Pyjamaparty?'],
      shy: ['Oh… du bist noch da? Guten Abend…'],
      grumpy: ['Es ist {time}. Ab ins Bett.'],
    },
  },
  weekend: { default: ['Schönen {day}{,user}! Es ist Wochenende!'] },
  again: { default: ['Hallo nochmal!', 'Da bist du ja wieder!'], grumpy: ['Du schon wieder.'], shy: ['Oh, hallo nochmal…'] },
  click: { default: ['Hey! Das kitzelt!', 'Ja?', 'Brauchst du mich?'], playful: ['Erwischt!'], grumpy: ['Finger weg.'], shy: ['Oh! Du hast mich erschreckt…'] },
  poke: { default: ['Langsam, langsam!', 'Mir wird schwindelig…'], grumpy: ['Jetzt reicht’s!'] },
  idle: { default: ['Ich mache einen kleinen Spaziergang.', 'Schöne Seite!', 'Vergiss nicht, Pause zu machen.'], playful: ['Soll ich über die Scrollleiste springen?'], grumpy: ['Mir ist langweilig.'] },
  wake: { default: ['Hm? Ich habe nicht geschlafen!', 'Oh, du bist zurück!'] },
  drop: { default: ['Puh, sichere Landung!', 'Danke für die Fahrt!'], grumpy: ['Sag nächstes Mal Bescheid.'] },
  bye: { default: ['Bis gleich!', 'Bin gleich zurück!'] },
};

export const PHRASEBOOK: Record<Language, LanguageBook> = { fr, en, es, de };

export type BookKind = Exclude<SpeechKind, 'greeting'>;
