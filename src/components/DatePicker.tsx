import { useState, useEffect } from 'react';
import { useDate, gregorianToHijri, hijriToGregorian, hijriMonths, gregorianMonths } from '../context/DateContext';

interface DatePickerProps {
  value: string; // format: "YYYY-MM-DD" (internal storage always gregorian)
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
}

export default function DatePicker({ value, onChange, label, required }: DatePickerProps) {
  const { calendarType, toggleCalendar } = useDate();
  
  // Convert value to internal Date object
  const [internalDate, setInternalDate] = useState<Date>(() => {
    if (value) {
      return new Date(value);
    }
    return new Date();
  });

  // Extract components based on calendar type
  const getComponents = () => {
    if (calendarType === 'gregorian') {
      return {
        day: internalDate.getDate(),
        month: internalDate.getMonth() + 1,
        year: internalDate.getFullYear()
      };
    } else {
      const hijri = gregorianToHijri(internalDate);
      return hijri;
    }
  };

  const [components, setComponents] = useState(getComponents());

  // Update components when value or calendarType changes
  useEffect(() => {
    if (value) {
      setInternalDate(new Date(value));
    }
    setComponents(getComponents());
  }, [value, calendarType]);

  const months = calendarType === 'gregorian' ? gregorianMonths : hijriMonths;
  const maxDays = calendarType === 'gregorian' 
    ? new Date(components.year, components.month, 0).getDate()
    : 30; // Approximation for Hijri months

  const updateDate = (day: number, month: number, year: number) => {
    let newDate: Date;
    if (calendarType === 'gregorian') {
      newDate = new Date(year, month - 1, day);
    } else {
      newDate = hijriToGregorian(year, month, day);
    }
    setInternalDate(newDate);
    // Convert to YYYY-MM-DD format for storage
    const yyyy = newDate.getFullYear();
    const mm = String(newDate.getMonth() + 1).padStart(2, '0');
    const dd = String(newDate.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDay = parseInt(e.target.value);
    setComponents(prev => ({ ...prev, day: newDay }));
    updateDate(newDay, components.month, components.year);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = parseInt(e.target.value);
    setComponents(prev => ({ ...prev, month: newMonth }));
    updateDate(components.day, newMonth, components.year);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newYear = parseInt(e.target.value);
    setComponents(prev => ({ ...prev, year: newYear }));
    updateDate(components.day, components.month, newYear);
  };

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-xs text-slate-400 font-semibold flex items-center justify-between">
          <span>{label}</span>
          <button
            type="button"
            onClick={toggleCalendar}
            className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
          >
            {calendarType === 'gregorian' ? '📅 ميلادي' : '🌙 هجري'}
          </button>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {/* Day - اليوم */}
        <select
          value={components.day}
          onChange={handleDayChange}
          className="min-w-0 w-16 bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500"
          required={required}
        >
          {Array.from({ length: maxDays }, (_, i) => i + 1).map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>

        {/* Month - الشهر */}
        <select
          value={components.month}
          onChange={handleMonthChange}
          className="min-w-0 flex-[2] bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500"
          required={required}
        >
          {months.map((month, idx) => (
            <option key={idx + 1} value={idx + 1}>{month}</option>
          ))}
        </select>

        {/* Year - السنة */}
        <input
          type="number"
          value={components.year}
          onChange={handleYearChange}
          className="min-w-0 w-24 bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none focus:border-blue-500"
          required={required}
          placeholder="السنة"
        />
      </div>
    </div>
  );
}
