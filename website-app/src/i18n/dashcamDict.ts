import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  title: { en: '📹 Truck Dashcams', ar: '📹 داش كام الشاحنات', ru: '📹 Видеорегистраторы грузовиков', de: '📹 LKW-Dashcams', it: '📹 Dashcam dei camion', hi: '📹 ट्रक डैशकैम', ur: '📹 ٹرک ڈیش کیمز', ja: '📹 トラックドライブレコーダー', zh: '📹 卡车行车记录仪' },
  betaWarning: { en: '⚠️ Preview demo — requires actual camera devices', ar: '⚠️ معاينة تجريبية — يحتاج أجهزة كاميرات فعلية', ru: '⚠️ Предварительный просмотр — требуются реальные камеры', de: '⚠️ Vorschau-Demo — benötigt echte Kamera-Geräte', it: '⚠️ Anteprima demo — richiede telecamere reali', hi: '⚠️ पूर्वावलोकन डेमो — के लिए वास्तविक कैमरा उपकरण आवश्यक', ur: '⚠️ پیش نظارہ ڈیمو — کے لیے حقیقی کیمرہ ڈیوائسز درکار ہیں', ja: '⚠️ プレビューデモ — 実際のカメラ機器が必要です', zh: '⚠️ 预览演示 — 需要实际摄像头设备' },
  quality: { en: 'Quality:', ar: 'الجودة:', ru: 'Качество:', de: 'Qualität:', it: 'Qualità:', hi: 'गुणवत्ता:', ur: 'معیار:', ja: '画質:', zh: '画质：' },
  loopRecording: { en: '♻️ Loop recording', ar: '♻️ تسجيل حلقي Loop', ru: '♻️ Циклическая запись', de: '♻️ Endlosschleife', it: '♻️ Registrazione a ciclo', hi: '♻️ लूप रिकॉर्डिंग', ur: '♻️ لوپ ریکارڈنگ', ja: '♻️ ループ録画', zh: '♻️ 循环录制' },
  eventDetection: { en: '🚨 AI event detection', ar: '🚨 كشف الأحداث AI', ru: '🚨 ИИ-обнаружение событий', de: '🚨 KI-Ereigniserkennung', it: '🚨 Rilevamento eventi AI', hi: '🚨 AI ईवेंट पहचान', ur: '🚨 AI ایونٹ کی شناخت', ja: '🚨 AIイベント検知', zh: '🚨 AI 事件检测' },
  camOnline: { en: '✅ Camera system connected', ar: '✅ نظام الكاميرات متصل', ru: '✅ Система камер подключена', de: '✅ Kamerasystem verbunden', it: '✅ Sistema telecamere connesso', hi: '✅ कैमरा सिस्टम कनेक्टेड', ur: '✅ کیمرہ سسٹم منسلک', ja: '✅ カメラシステム接続済み', zh: '✅ 摄像头系统已连接' },
  camConnect: { en: '🔌 Connect camera system', ar: '🔌 توصيل نظام الكاميرات', ru: '🔌 Подключить систему камер', de: '🔌 Kamerasystem verbinden', it: '🔌 Connetti sistema telecamere', hi: '🔌 कैमरा सिस्टम कनेक्ट करें', ur: '🔌 کیمرہ سسٹم جوڑیں', ja: '🔌 カメラシステムを接続', zh: '🔌 连接摄像头系统' },
  camCount: { en: '📹 {total} cameras · 🟢 {online} connected', ar: '📹 {total} كاميرا · 🟢 {online} متصلة', ru: '📹 Камер: {total} · 🟢 Подключено: {online}', de: '📹 {total} Kameras · 🟢 {online} verbunden', it: '📹 {total} telecamere · 🟢 {online} connesse', hi: '📹 {total} कैमरे · 🟢 {online} कनेक्टेड', ur: '📹 {total} کیمرے · 🟢 {online} منسلک', ja: '📹 カメラ {total}台 · 🟢 {online}接続中', zh: '📹 {total} 个摄像头 · 🟢 {online} 已连接' },
  fleetCams: { en: 'Fleet Cameras', ar: 'الأسطول · Fleet Cameras', ru: 'Камеры автопарка', de: 'Flottenkameras', it: 'Telecamere della flotta', hi: 'बेड़ा कैमरे', ur: 'فلیٹ کیمرے', ja: '車両カメラ', zh: '车队摄像头' },
  noTrucks: { en: 'No trucks registered — add the fleet from the admin page', ar: 'لا توجد شاحنات مسجلة — أضف الأسطول من صفحة الإدارة', ru: 'Нет зарегистрированных грузовиков — добавьте автопарк со страницы администрирования', de: 'Keine LKW registriert — fügen Sie die Flotte auf der Verwaltungsseite hinzu', it: 'Nessun camion registrato — aggiungi la flotta dalla pagina di amministrazione', hi: 'कोई ट्रक पंजीकृत नहीं — प्रशासन पृष्ठ से बेड़ा जोड़ें', ur: 'کوئی ٹرک رجسٹرڈ نہیں — ایڈمن صفحے سے فلیٹ شامل کریں', ja: '登録されたトラックがありません — 管理ページで車両を追加してください', zh: '未注册卡车 — 请从管理页面添加车队' },
  camOnlineLbl: { en: '🟢 Online', ar: '🟢 متصل', ru: '🟢 Онлайн', de: '🟢 Online', it: '🟢 Online', hi: '🟢 ऑनलाइन', ur: '🟢 آن لائن', ja: '🟢 オンライン', zh: '🟢 在线' },
  camRecording: { en: '🔴 Recording', ar: '🔴 يسجل', ru: '🔴 Идёт запись', de: '🔴 Aufnahme aktiv', it: '🔴 In registrazione', hi: '🔴 रिकॉर्डिंग जारी', ur: '🔴 ریکارڈنگ جاری', ja: '🔴 録画中', zh: '🔴 录制中' },
  camOffline: { en: '⚪ Offline', ar: '⚪ غير متصل', ru: '⚪ Не в сети', de: '⚪ Offline', it: '⚪ Offline', hi: '⚪ ऑफ़लाइन', ur: '⚪ آف لائن', ja: '⚪ オフライン', zh: '⚪ 离线' },
  camError: { en: '🔴 Error', ar: '🔴 خطأ', ru: '🔴 Ошибка', de: '🔴 Fehler', it: '🔴 Errore', hi: '🔴 त्रुटि', ur: '🔴 خرابی', ja: '🔴 エラー', zh: '🔴 错误' },
  frontCam: { en: '⬆ Front', ar: '⬆ أمامية', ru: '⬆ Передняя', de: '⬆ Vorne', it: '⬆ Anteriore', hi: '⬆ सामने', ur: '⬆ سامنے', ja: '⬆ 前方', zh: '⬆ 前' },
  rearCam: { en: '⬇ Rear', ar: '⬇ خلفية', ru: '⬇ Задняя', de: '⬇ Hinten', it: '⬇ Posteriore', hi: '⬇ पीछे', ur: '⬇ پیچھے', ja: '⬇ 後方', zh: '⬇ 后' },
  cabinCam: { en: '👤 Cabin', ar: '👤 كبينة', ru: '👤 Салон', de: '👤 Kabine', it: '👤 Abitacolo', hi: '👤 केबिन', ur: '👤 کیبن', ja: '👤 キャビン', zh: '👤 驾驶室' },
  speedUnit: { en: 'km/h', ar: 'كم/س', ru: 'км/ч', de: 'km/h', it: 'km/h', hi: 'किमी/घंटा', ur: 'کلومیٹر/گھنٹہ', ja: 'km/h', zh: '公里/小时' },
  liveTitle: { en: 'Live — {code}', ar: 'البث المباشر · Live — {code}', ru: 'Трансляция — {code}', de: 'Live — {code}', it: 'Live — {code}', hi: 'लाइव — {code}', ur: 'لائیو — {code}', ja: 'ライブ — {code}', zh: '直播 — {code}' },
  stopLive: { en: '⏹️ Stop live', ar: '⏹️ إيقاف البث', ru: '⏹️ Остановить трансляцию', de: '⏹️ Live stoppen', it: '⏹️ Ferma diretta', hi: '⏹️ लाइव रोकें', ur: '⏹️ لائیو روکیں', ja: '⏹️ ライブ停止', zh: '⏹️ 停止直播' },
  startLive: { en: '▶️ Start live', ar: '▶️ تشغيل البث', ru: '▶️ Запустить трансляцию', de: '▶️ Live starten', it: '▶️ Avvia diretta', hi: '▶️ लाइव शुरू करें', ur: '▶️ لائیو چلائیں', ja: '▶️ ライブ開始', zh: '▶️ 开始直播' },
  saveClip: { en: '💾 Save clip', ar: '💾 حفظ مقطع', ru: '💾 Сохранить фрагмент', de: '💾 Clip speichern', it: '💾 Salva clip', hi: '💾 क्लिप सहेजें', ur: '💾 کلپ محفوظ کریں', ja: '💾 クリップ保存', zh: '💾 保存片段' },
  clipSaved: { en: '💾 A clip was saved from the feed of {code}', ar: '💾 تم حفظ مقطع من بث {code}', ru: '💾 Сохранён фрагмент трансляции {code}', de: '💾 Ein Clip vom Feed von {code} wurde gespeichert', it: '💾 Salvato un clip dal flusso di {code}', hi: '💾 {code} के फ़ीड से एक क्लिप सहेजी गई', ur: '💾 {code} کے فیڈ سے ایک کلپ محفوظ ہو گا', ja: '💾 {code} の配信からクリップを保存しました', zh: '💾 已从 {code} 的视频流保存一个片段' },
  gpsSync: { en: '📍 GPS synced', ar: '📍 GPS متزامن', ru: '📍 GPS синхронизирован', de: '📍 GPS synchronisiert', it: '📍 GPS sincronizzato', hi: '📍 GPS सिंक', ur: '📍 GPS سنک', ja: '📍 GPS同期済み', zh: '📍 GPS 已同步' },
  recentClips: { en: 'Recent Clips', ar: 'أحدث المقاطع · Recent Clips', ru: 'Последние фрагменты', de: 'Letzte Clips', it: 'Clip recenti', hi: 'हाल की क्लिप्स', ur: 'حالیہ کلپس', ja: '最近のクリップ', zh: '最近的片段' },
  clipItem: { en: '🎬 Clip {n} — {time}', ar: '🎬 مقطع {n} — {time}', ru: '🎬 Фрагмент {n} — {time}', de: '🎬 Clip {n} — {time}', it: '🎬 Clip {n} — {time}', hi: '🎬 क्लिप {n} — {time}', ur: '🎬 کلپ {n} — {time}', ja: '🎬 クリップ {n} — {time}', zh: '🎬 片段 {n} — {time}' },
  playClip: { en: '▶️ Play', ar: '▶️ تشغيل', ru: '▶️ Воспроизвести', de: '▶️ Abspielen', it: '▶️ Riproduci', hi: '▶️ चलाएँ', ur: '▶️ چلائیں', ja: '▶️ 再生', zh: '▶️ 播放' },
  downloadClip: { en: '⬇️ Download', ar: '⬇️ تحميل', ru: '⬇️ Скачать', de: '⬇️ Herunterladen', it: '⬇️ Scarica', hi: '⬇️ डाउनलोड', ur: '⬇️ ڈاؤن لوڈ', ja: '⬇️ ダウンロード', zh: '⬇️ 下载' },
  clipPlayAlert: { en: '▶️ Playing clip', ar: '▶️ تشغيل المقطع', ru: '▶️ Воспроизведение фрагмента', de: '▶️ Clip wird abgespielt', it: '▶️ Riproduzione clip', hi: '▶️ क्लिप चल रही है', ur: '▶️ کلپ چل رہی ہے', ja: '▶️ クリップを再生中', zh: '▶️ 正在播放片段' },
  clipDownloadAlert: { en: '⬇️ Downloading clip', ar: '⬇️ تحميل المقطع', ru: '⬇️ Скачивание фрагмента', de: '⬇️ Clip wird heruntergeladen', it: '⬇️ Download clip in corso', hi: '⬇️ क्लिप डाउनलोड हो रही है', ur: '⬇️ کلپ ڈاؤن لوڈ ہو رہی ہے', ja: '⬇️ クリップをダウンロード中', zh: '⬇️ 正在下载片段' },
  evBrake: { en: '⚠️ Hard Braking', ar: '⚠️ فرملة مفاجئة Hard Braking', ru: '⚠️ Резкое торможение', de: '⚠️ Starkes Bremsen', it: '⚠️ Frenata improvvisa', hi: '⚠️ अचानक ब्रेकिंग', ur: '⚠️ اچانک بریک لگانا', ja: '⚠️ 急ブレーキ', zh: '⚠️ 急刹车' },
  evAccel: { en: '⚡ Rapid Acceleration', ar: '⚡ تسارع مفاجئ Rapid Acceleration', ru: '⚡ Резкое ускорение', de: '⚡ Schnelles Beschleunigen', it: '⚡ Accelerazione improvvisa', hi: '⚡ अचानक त्वरण', ur: '⚡ اچانک سرعت', ja: '⚡ 急加速', zh: '⚡ 急加速' },
  evLane: { en: '🌀 Lane Departure', ar: '🌀 انحراف عن المسار Lane Departure', ru: '🌀 Выход из полосы', de: '🌀 Spurverlassen', it: '🌀 Uscita di corsia', hi: '🌀 लेन से बाहर', ur: '🌀 لین سے باہر', ja: '🌀 車線逸脱', zh: '🌀 车道偏离' },
  evCollision: { en: '🚨 Collision Alert', ar: '🚨 تصادم خفيف Collision Alert', ru: '🚨 Предупреждение о столкновении', de: '🚨 Kollisionswarnung', it: '🚨 Allarme collisione', hi: '🚨 टक्कर अलर्ट', ur: '🚨 تصادم کا الرٹ', ja: '🚨 衝突アラート', zh: '🚨 碰撞警报' },
};

export type DashcamDictKey = keyof typeof DICT;

export function useDashcamDict() {
  return usePageDict(DICT);
}