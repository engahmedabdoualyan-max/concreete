import { useLang, Lang } from '../context/LangContext';

export default function LangSelector() {
  const { lang, setLang } = useLang();
  return (
    <select value={lang} onChange={e => setLang(e.target.value as Lang)}
      className="bg-[#1e293b] text-white text-xs border border-blue-500 px-2 py-1.5 rounded font-bold cursor-pointer outline-none hover:border-blue-400 transition">
      <option value="ar">العربية</option>
      <option value="en">English</option>
      <option value="ur">اردو</option>
    </select>
  );
}
