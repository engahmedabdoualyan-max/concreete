import { useState, useEffect } from 'react';
import { loadPlantLogo } from '../firebase/firestore';

export default function PlantLogo({ username, height = 40 }: { username: string; height?: number }) {
  const [logo, setLogo] = useState('');

  useEffect(() => {
    if (!username) return;
    let alive = true;
    loadPlantLogo(username).then(l => { if (alive && l) setLogo(l); }).catch(() => {});
    return () => { alive = false; };
  }, [username]);

  if (!logo) return null;
  return <img src={logo} alt="Plant logo" className="h-8 w-auto object-contain rounded-lg bg-white p-0.5" style={{ height }} />;
}
