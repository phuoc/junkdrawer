// Keyword → emoji fallback. Claude picks an emoji for each entry while it
// sorts; this list covers rule-based sorting (no API key) and entries saved
// before emojis existed. First match wins, so specific words come first.

const RULES: [RegExp, string][] = [
  [/^\s*idea\b/i, "💡"], // "idea: ..." is about the idea, whatever it mentions
  [/\b(meeting|standup|stand-up|sync)\b/i, "🗓️"], // meeting notes mention all sorts of topics
  // food & shopping
  [/\bmilk\b/i, "🥛"],
  [/\b(coffee|espresso|latte)\b/i, "☕"],
  [/\btea\b/i, "🍵"],
  [/\b(bread|toast|bagel)\b/i, "🍞"],
  [/\beggs?\b/i, "🥚"],
  [/\bcheese\b/i, "🧀"],
  [/\b(apples?)\b/i, "🍎"],
  [/\bbananas?\b/i, "🍌"],
  [/\b(vegetables?|veggies|salad|lettuce)\b/i, "🥬"],
  [/\b(pasta|spaghetti)\b/i, "🍝"],
  [/\bpizza\b/i, "🍕"],
  [/\b(wine)\b/i, "🍷"],
  [/\bbeer\b/i, "🍺"],
  [/\b(pastel de nata|pastry|pastries|cake|croissant)\b/i, "🥐"],
  [/\b(dinner|lunch|breakfast|recipe|cook|cooking|restaurant)\b/i, "🍽️"],
  [/\b(groceries|grocery|supermarket)\b/i, "🛒"],
  [/\bbatter(y|ies)\b/i, "🔋"],
  [/\b(charger|cable|usb)\b/i, "🔌"],
  [/\b(gift|present|birthday)\b/i, "🎁"],
  // health
  [/\b(dentist|teeth|tooth|floss)\b/i, "🦷"],
  [/\b(doctor|gp|clinic|hospital|appointment)\b/i, "🩺"],
  [/\b(pills?|medicine|meds|prescription|pharmacy|vitamins?)\b/i, "💊"],
  [/\b(run|running|jog|marathon)\b/i, "🏃"],
  [/\b(gym|workout|weights|exercise)\b/i, "🏋️"],
  [/\b(knee|back pain|stretch|stretching|physio)\b/i, "🦵"],
  [/\b(sleep|nap|bed)\b/i, "😴"],
  // home
  [/\b(tap|faucet|leak|leaking|plumber|sink)\b/i, "🚰"],
  [/\b(wifi|wi-fi|router|internet|password)\b/i, "📶"],
  [/\b(smoke alarm|alarm|fire)\b/i, "🚨"],
  [/\b(laundry|wash|washing)\b/i, "🧺"],
  [/\b(clean|cleaning|vacuum|tidy)\b/i, "🧹"],
  [/\b(plants?|garden|water the)\b/i, "🪴"],
  [/\b(fix|repair|tools?|drill)\b/i, "🔧"],
  [/\b(cabin|house|home|apartment|flat|rent)\b/i, "🏠"],
  [/\b(dog|puppy|walk the dog)\b/i, "🐕"],
  [/\b(cat|kitten|litter)\b/i, "🐈"],
  // money & admin
  [/\b(bill|invoice|pay|payment|electricity|taxes?)\b/i, "💸"],
  [/\b(bank|budget|savings?|money|salary)\b/i, "💰"],
  [/\bpassport\b/i, "🛂"],
  [/\b(renew|form|paperwork|sign|contract)\b/i, "📝"],
  // travel
  [/\b(flights?|fly|airport|plane)\b/i, "✈️"],
  [/\b(train|tickets?)\b/i, "🎫"],
  [/\b(hotel|airbnb|booking)\b/i, "🏨"],
  [/\b(lisbon|paris|london|tokyo|trip|travel|holiday|vacation)\b/i, "🧳"],
  [/\b(car|tyres?|tires?|garage|mot|oil change)\b/i, "🚗"],
  [/\b(bike|bicycle|cycling)\b/i, "🚲"],
  // people
  [/\b(mom|mum|mother|dad|father|parents|family)\b/i, "👪"],
  [/\b(baby|kids?|children)\b/i, "🧒"],
  [/\b(call|phone|ring)\b/i, "📞"],
  [/\b(email|e-mail|mail|reply)\b/i, "📧"],
  [/\b(text|message|whatsapp)\b/i, "💬"],
  // work & ideas
  [/\b(deadline|due)\b/i, "⏰"],
  [/\b(draft|report|doc|document|slides|presentation)\b/i, "📄"],
  [/\b(code|bug|deploy|server|app)\b/i, "💻"],
  [/\b(podcast|interview)\b/i, "🎙️"],
  [/\b(book|read|reading|novel)\b/i, "📚"],
  [/\b(movie|film|watch|show|series)\b/i, "🎬"],
  [/\b(music|song|album|playlist|concert)\b/i, "🎵"],
  [/\b(learn|course|study|class)\b/i, "🎓"],
  [/\bidea\b/i, "💡"],
];

export function emojiFor(text: string): string | null {
  for (const [re, emoji] of RULES) if (re.test(text)) return emoji;
  return null;
}

/** Accepts a single emoji (including ZWJ sequences and flags); rejects anything else. */
export function isEmoji(s: unknown): s is string {
  if (typeof s !== "string" || !s || s.length > 16) return false;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)];
  return graphemes.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);
}
