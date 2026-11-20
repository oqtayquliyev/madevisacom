// Spoken languages: how they're written in CVs and job ads, and how a
// stated level maps to the European A1–C2 scale (1–6).

export type Lang = { code: string; name: string; re: RegExp };

const L = (code: string, name: string, words: string): Lang => ({ code, name, re: new RegExp(`(?<![a-zà-ÿ])(?:${words})(?:kenntnisse|sprachig|sprachkenntnisse)?(?![a-zà-ÿ])`, 'i') });

export const LANGS: Lang[] = [
  L('en', 'English', 'english|englisch|anglais|inglés|ingles|inglese|engels|engelska'),
  L('de', 'German', 'german|deutsch|deutschkenntnisse|allemand|alemán|aleman|tedesco|duits'),
  L('fr', 'French', 'french|français|francais|französisch|franzosisch|francés|frans'),
  L('es', 'Spanish', 'spanish|español|espanol|spanisch|espagnol|castellano'),
  L('it', 'Italian', 'italian|italiano|italienisch|italien'),
  L('nl', 'Dutch', 'dutch|nederlands|niederländisch|néerlandais|flemish'),
  L('pt', 'Portuguese', 'portuguese|português|portugues|portugiesisch|portugais'),
  L('sv', 'Swedish', 'swedish|svenska|schwedisch'),
  L('no', 'Norwegian', 'norwegian|norsk|norwegisch'),
  L('da', 'Danish', 'danish|dansk|dänisch'),
  L('fi', 'Finnish', 'finnish|suomi|finnisch'),
  L('pl', 'Polish', 'polish|polski|polnisch'),
  L('cs', 'Czech', 'czech|čeština|tschechisch'),
  L('ru', 'Russian', 'russian|русский|russisch|russe'),
  L('uk', 'Ukrainian', 'ukrainian|українська|ukrainisch'),
  L('tr', 'Turkish', 'turkish|türkçe|turkce|türkisch'),
  L('az', 'Azerbaijani', 'azerbaijani|azeri|azərbaycan(?: dili)?'),
  L('ar', 'Arabic', 'arabic|arabisch|arabe|العربية'),
  L('zh', 'Chinese', 'chinese|mandarin|cantonese|chinesisch|chinois|中文'),
  L('ja', 'Japanese', 'japanese|japanisch|japonais|日本語'),
  L('ko', 'Korean', 'korean|koreanisch|한국어'),
  L('hi', 'Hindi', 'hindi'),
  L('ur', 'Urdu', 'urdu'),
  L('bn', 'Bengali', 'bengali|bangla'),
  L('fa', 'Persian', 'persian|farsi'),
  L('he', 'Hebrew', 'hebrew'),
  L('el', 'Greek', 'greek|griechisch'),
  L('ro', 'Romanian', 'romanian|română|rumänisch'),
  L('hu', 'Hungarian', 'hungarian|magyar|ungarisch'),
  L('bg', 'Bulgarian', 'bulgarian'),
  L('sr', 'Serbian', 'serbian'),
  L('hr', 'Croatian', 'croatian'),
  L('ka', 'Georgian', 'georgian(?! (?:tech|institute|college))'),
  L('kk', 'Kazakh', 'kazakh'),
  L('uz', 'Uzbek', 'uzbek'),
  L('id', 'Indonesian', 'indonesian|bahasa indonesia'),
  L('ms', 'Malay', 'malay|bahasa melayu'),
  L('th', 'Thai', 'thai'),
  L('vi', 'Vietnamese', 'vietnamese'),
  L('tl', 'Filipino', 'tagalog|filipino'),
  L('sw', 'Swahili', 'swahili'),
];

export const LANG_BY_CODE = new Map(LANGS.map((l) => [l.code, l]));

/** A stated level near a language name → 1 (A1) … 6 (C2 / native). */
export function levelIn(text: string): number | null {
  const t = text.toLowerCase();
  const cefr = t.match(/\b([abc])\s?([12])\b/);
  if (cefr) return (cefr[1] === 'a' ? 0 : cefr[1] === 'b' ? 2 : 4) + Number(cefr[2]);
  if (/native|mother tongue|muttersprach|langue maternelle|bilingual|first language|nativo/.test(t)) return 6;
  if (/fluent|fluency|fließend|fliessend|verhandlungssicher|proficien|full professional|courant|business level|business fluent|advanced|excellent|very good|sehr gut/.test(t)) return 5;
  if (/professional working|upper.?intermediate|good|gut|working knowledge|conversational|confident/.test(t)) return 4;
  if (/intermediate|limited working|moderate/.test(t)) return 3;
  if (/elementary|basic|beginner|grundkenntnisse|notions/.test(t)) return 2;
  return null;
}

export const LEVEL_NAME = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2 / native'];
