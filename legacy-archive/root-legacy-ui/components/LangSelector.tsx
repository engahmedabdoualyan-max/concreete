import { useLang, Lang } from '../context/LangContext';

export default function LangSelector() {
  const { lang, setLang } = useLang();
  return (
    <select value={lang} onChange={e => setLang(e.target.value as Lang)}
      className="bg-white/[0.04] text-white text-xs border border-white/10 px-2 py-1.5 rounded font-bold cursor-pointer outline-none hover:border-sky-400/60 transition">
      <option value="en">English</option>
      <option value="ar">العربية</option>
      <option value="ru">Русский</option>
      <option value="de">Deutsch</option>
      <option value="it">Italiano</option>
      <option value="hi">हिन्दी</option>
      <option value="ur">اردو</option>
      <option value="ja">日本語</option>
      <option value="zh">中文</option>
    </select>
  );
}
