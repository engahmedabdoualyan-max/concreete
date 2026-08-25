import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type CalendarType = 'hijri' | 'gregorian';

interface DateContextType {
  calendarType: CalendarType;
  setCalendarType: (type: CalendarType) => void;
  toggleCalendar: () => void;
}

const DateContext = createContext<DateContextType | undefined>(undefined);

export function DateProvider({ children }: { children: ReactNode }) {
  const [calendarType, setCalendarType] = useState<CalendarType>(() => {
    return (localStorage.getItem('calendarType') as CalendarType) || 'gregorian';
  });

  useEffect(() => {
    localStorage.setItem('calendarType', calendarType);
  }, [calendarType]);

  const toggleCalendar = () => {
    setCalendarType(prev => prev === 'gregorian' ? 'hijri' : 'gregorian');
  };

  return (
    <DateContext.Provider value={{ calendarType, setCalendarType, toggleCalendar }}>
      {children}
    </DateContext.Provider>
  );
}

export function useDate() {
  const context = useContext(DateContext);
  if (!context) {
    throw new Error('useDate must be used within DateProvider');
  }
  return context;
}

// ============ تحويل التاريخ الميلادي إلى هجري (خوارزمية مبسطة) ============
export function gregorianToHijri(date: Date): { day: number; month: number; year: number } {
  const gYear = date.getFullYear();
  const gMonth = date.getMonth() + 1;
  const gDay = date.getDate();

  // خوارزمية تحويل
  let jd = Math.floor((1461 * (gYear + 4800 + Math.floor((gMonth - 14) / 12))) / 4) +
    Math.floor((367 * (gMonth - 2 - 12 * Math.floor((gMonth - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((gYear + 4900 + Math.floor((gMonth - 14) / 12)) / 100)) / 4) +
    gDay - 32075;

  jd = jd - 1948440 + 10632;
  const n = Math.floor((jd - 1) / 10631);
  jd = jd - 10631 * n + 354;

  const j = (Math.floor((10985 - jd) / 5316)) * (Math.floor((50 * jd) / 17719)) +
    (Math.floor(jd / 5670)) * (Math.floor((43 * jd) / 15238));
  jd = jd - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) -
    (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;

  const hMonth = Math.floor((24 * jd) / 709);
  const hDay = jd - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;

  return { day: hDay, month: hMonth, year: hYear };
}

// ============ تحويل التاريخ الهجري إلى ميلادي (خوارزمية مبسطة) ============
export function hijriToGregorian(hYear: number, hMonth: number, hDay: number): Date {
  let jd = Math.floor((11 * hYear + 3) / 30) + 354 * hYear + 30 * hMonth -
    Math.floor((hMonth - 1) / 2) + hDay + 1948440 - 385;

  // Julian Day to Gregorian
  let l = jd + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;

  return new Date(year, month - 1, day);
}

// ============ أسماء الأشهر ============
export const hijriMonths = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
];

export const gregorianMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل',
  'مايو', 'يونيو', 'يوليو', 'أغسطس',
  'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

// ============ تنسيق التاريخ ============
export function formatDate(date: Date, calendarType: CalendarType): string {
  if (calendarType === 'gregorian') {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } else {
    const hijri = gregorianToHijri(date);
    return `${hijri.day}/${hijri.month}/${hijri.year}`;
  }
}

// ============ إنشاء تاريخ من مكونات (يوم/شهر/سنة) ============
export function createDateFromComponents(day: number, month: number, year: number, calendarType: CalendarType): Date {
  if (calendarType === 'gregorian') {
    return new Date(year, month - 1, day);
  } else {
    return hijriToGregorian(year, month, day);
  }
}

// ============ استخراج المكونات من تاريخ ============
export function extractDateComponents(date: Date, calendarType: CalendarType): { day: number; month: number; year: number } {
  if (calendarType === 'gregorian') {
    return {
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: date.getFullYear()
    };
  } else {
    return gregorianToHijri(date);
  }
}
