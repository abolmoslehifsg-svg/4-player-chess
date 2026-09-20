'use strict';
// Language, account/profile, themes, and settings screens.





const SETTINGS_KEY = 'chess4p_settings_v1';
function loadSettings(){
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return {
      lang: o.lang === 'en' ? 'en' : 'fa',
      premove: o.premove !== false,
      sound: o.sound !== false
    };
  } catch(_){
    return { lang: 'fa', premove: true, sound: true };
  }
}
function saveSettings(s){
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch(_){}
}
let appSettings = loadSettings();
window.appSettings = appSettings;
window.saveSettings = saveSettings;

/** Switch UI language — safe, global, used by settings buttons */
function setAppLang(lang) {
  try {
    if (!appSettings) appSettings = { lang: 'fa', premove: true, sound: true };
    appSettings.lang = (lang === 'en') ? 'en' : 'fa';
    window.appSettings = appSettings;
    try { saveSettings(appSettings); } catch (_) {}
    document.documentElement.lang = appSettings.lang;
    document.documentElement.dir = appSettings.lang === 'en' ? 'ltr' : 'rtl';
    // active state on buttons immediately
    const faBtn = document.getElementById('settingsLangFa');
    const enBtn = document.getElementById('settingsLangEn');
    if (faBtn) faBtn.classList.toggle('active', appSettings.lang === 'fa');
    if (enBtn) enBtn.classList.toggle('active', appSettings.lang === 'en');
    if (typeof applyLanguage === 'function') {
      try { applyLanguage(appSettings.lang); } catch (e) { console.warn('applyLanguage', e); }
    }
    // stay on settings if that view exists
    const sv = document.getElementById('settingsView');
    if (sv && sv.style.display !== 'none' && sv.offsetParent !== null) {
      /* already visible */
    }
  } catch (e) {
    console.error('setAppLang', e);
  }
}
window.setAppLang = setAppLang;
/* applyLanguage bound later */

function isPremoveEnabled(){
  return !!(appSettings && appSettings.premove);
}

function t(key){
  const fa = {
    settings: 'تنظیمات', themes: 'تم', back: '→ بازگشت', backToMenu: '→ بازگشت به منو',
    lang: 'زبان', langHint: 'زبان رابط کاربری',
    prem: 'پیش‌حرکت (Premove)', premHint: 'صف کردن حرکت قبل از نوبت',
    themesRow: 'تم ظاهری', themesHint: 'رنگ صفحه و مهره‌ها',
    open: 'باز کردن', on: 'روشن', off: 'خاموش',
    brandSub: 'خانه · بازی کن', brandName: 'شطرنج', hero: 'بازی کن',
    play2v2: 'شطرنج ۴ نفره · ۲v۲', play1v1: 'شطرنج ۱v۱',
    bots: 'بازی با ربات‌ها', online: 'آنلاین', modes: 'گیم‌مودها', variants: 'واریانت‌ها',
    desc2v2: 'تخته ۱۶×۸ · حالت Guardian · تیم آبی در برابر قرمز',
    desc1v1: 'کلاسیک ۸×۸ · انسان یا ربات',
    descBots: 'مارتین، آریا، استاد نوری…',
    descOnline: 'اتاق بساز یا با کد بپیوند',
    descModes: '۱v۱ یا ۲v۲ قبل از بازی',
    descVariants: 'در دست تولید',
    soon: 'به‌زودی', suggested: 'پیشنهادی',
    ctaPlay: 'همین حالا بازی کن', ctaStart: 'شروع', ctaPick: 'انتخاب', ctaRoom: 'اتاق', ctaSetup: 'تنظیم',
    recent: 'بازی‌های اخیر', noRecent: 'بازی اخیری نیست',
    editProfile: 'ویرایش پروفایل', guest: 'مهمان',
    analyze: 'آنالیز', undo: 'بازگشت حرکت', restart: 'شروع دوباره',
    resign: 'تسلیم', resignSeat: 'تسلیم (واگذاری به AI)', resignConfirm: 'تسلیم می‌شوی؟', endGameNoResult: 'پایان بدون نتیجه',
    moveHistory: 'تاریخچه حرکات', status: 'وضعیت', statusControl: 'وضعیت و کنترل',
    turnPrefix: 'نوبت: ', turnLabel: 'نوبت', white: 'سفید', black: 'سیاه',
    go: 'برو', games: 'بازی', wins: 'برد', rating: 'ریتینگ', winRate: 'نرخ برد',
    profile: 'پروفایل', clearData: 'پاک‌سازی داده محلی', clearDataHint: 'پروفایل، بازی‌های اخیر و تنظیمات',
    clearDone: 'پاک شد. صفحه را تازه کنید.', moves: 'حرکت', accuracy: 'دقت',
    accountTitle: 'حساب کاربری', accountNote: 'اطلاعات فقط روی همین دستگاه ذخیره می‌شود.',
    pickPhoto: 'انتخاب عکس', displayName: 'نام نمایشی', username: 'نام کاربری',
    email: 'ایمیل', bio: 'درباره من', save: 'ذخیره', cancel: 'انصراف',
    phName: 'مثلاً علی', phBio: 'چند کلمه درباره خودت…',
    clearWarn: 'همه چیز روی این سایت از این دستگاه پاک می‌شود. ادامه می‌دهی؟',
    botsNote: 'یک حریف انتخاب کن. هر ربات سطح و سبک خودش را دارد.',
    yourColor: 'رنگ شما', other: 'سایر',
    bots4p: '۴ نفره با ربات', bots4pDesc: 'تنظیم Human/AI برای هر بازیکن.',
    modesNote: 'قبل از بازی، قالب و مود را انتخاب کنید.',
    format: 'قالب بازی', fmt1v1: '۱ به ۱', fmt2v2: '۲ به ۲', activeMode: 'مود فعال',
    gameMode: 'حالت بازی', hva: 'انسان vs ربات', hvh: 'انسان vs انسان',
    botLevel: 'سطح ربات', lvEasy: 'آسان (~1200)', lvMed: 'متوسط (~1500)', lvHard: 'سخت (~1800)', lvVHard: 'خیلی سخت (~2100)', lvMaster: 'استاد (~2500+)',
    startGame: 'شروع بازی', themesNote: 'یک تم انتخاب کنید.',
    roomCreateJoin: 'ایجاد یا پیوستن به اتاق', createRoom: 'ساخت اتاق', joinCode: 'پیوستن با کد',
    variantsNote: 'واریانت‌های جدید اینجا اضافه می‌شوند.', standard: 'استاندارد',
    guardianActiveDesc: 'مود فعلی ۲v۲ — وقتی شاه یک بازیکن مات شود، او حذف نمی‌شود و تا پایان بازی مهره‌هایش را کنترل می‌کند؛ تیم فقط وقتی می‌بازد که هر دو شاهش مات شده باشند.',
    standardComingSoon: 'حذف کامل بازیکن بعد از مات — به‌زودی',
    addonPack: 'ادآن‌پک', continueSetup: 'ادامه و شروع تنظیمات',
    yourSeat: 'نقش شما', seatA: 'A (آبی)', seatB: 'B (آبی)', seatC: 'C (قرمز)', seatD: 'D (قرمز)',
    hostNote: 'میزبان اتاق را می‌سازد؛ صندلی‌های خالی می‌توانند AI باشند.',
    aiEmptySeats: 'سطح AI برای صندلی‌های خالی', teamTime: 'محدودیت زمانی هر تیم',
    min3: '۳ دقیقه', min5: '۵ دقیقه', min10: '۱۰ دقیقه', noLimit: 'بدون محدودیت',
    createGetCode: 'ساخت اتاق و دریافت کد', roomCode: 'کد اتاق',
    codeFromHost: 'کد ۶ حرفی را از میزبان بگیرید.', desiredSeat: 'صندلی مورد نظر',
    joinRoom: 'پیوستن به اتاق', waitingPlayers: 'در انتظار بازیکنان...', leaveRoom: 'ترک اتاق',
    endTitle: 'پایان بازی', endAnalyze: 'آنالیز', endAgain: 'بازی دوباره', endHome: 'خانه',
    endYouWin: 'شما بردید!', endYouLose: 'شکست', endDraw: 'تساوی', endMoves: 'حرکت',
    sound: 'صدا', soundHint: 'صدای حرکت و پایان بازی',
    returnLive: 'بازگشت به وضعیت فعلی', teamBlue: 'تیم آبی', teamRed: 'تیم قرمز',
    teamBlueParen: '(تیم آبی)', teamRedParen: '(تیم قرمز)',
    downloadPgn: 'دانلود PGN', runAnalysis: 'شروع آنالیز Stockfish',
    zoomIn: 'بزرگ‌تر', zoomOut: 'کوچک‌تر',
    setup4pTitle: 'شطرنج ۴ نفره', controlPlayers: 'کنترل هر بازیکن',
    aiLevel: 'سطح هوش مصنوعی', timeNote: 'اگر زمان یک تیم تمام شود، همان تیم می‌بازد.',
    aiEngineTitle: 'موتور هوش مصنوعی',
    noMovesYet: 'هنوز حرکتی انجام نشده.', gameStarted: 'بازی شروع شد.',
    gameStartedTurn: 'بازی جدید شروع شد. نوبت',
    aiNote: 'سطح و کنترل بازیکنان از صفحه تنظیم ربات مشخص می‌شود.',
    analysisTitle: 'آنالیز بازی', you: 'شما', opponent: 'حریف',
    close: 'بستن', prevMove: 'حرکت قبلی', nextMove: 'حرکت بعدی',
    startPos: 'شروع', ready: 'آماده', movesTitle: 'حرکات',
    reanalyze: ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Re-analyze':'آنالیز دوباره'), analyzing: ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Analyzing…':'در حال آنالیز…'), analysisDone: 'آنالیز تمام شد',
    theme_midnight_name: 'نیمه‌شب', theme_midnight_desc: 'مهره سفید یخی · سیاه آبی',
    theme_classic_name: 'کلاسیک', theme_classic_desc: 'مهره سفید/مشکی سنتی',
    theme_ivory_name: 'عاج', theme_ivory_desc: 'مهره عاجی روی چوب',
    theme_ocean_name: 'اقیانوس', theme_ocean_desc: 'مهره سفید · سیاه فیروزه‌ای',
    theme_sunset_name: 'غروب', theme_sunset_desc: 'مهره کرم · سیاه عنابی',
    theme_carbon_name: 'کربن', theme_carbon_desc: 'مهره سفید · خاکستری فلزی'
  };
  const en = {
    settings: 'Settings', themes: 'Themes', back: '→ Back', backToMenu: '→ Back to menu',
    lang: 'Language', langHint: 'Interface language',
    prem: 'Premoves', premHint: 'Queue a move before your turn',
    themesRow: 'Theme', themesHint: 'Board and piece colors',
    open: 'Open', on: 'On', off: 'Off',
    brandSub: 'Home · Play', brandName: 'Chess', hero: 'Play',
    play2v2: '4-Player · 2v2', play1v1: '1v1 Chess',
    bots: 'Play bots', online: 'Online', modes: 'Game modes', variants: 'Variants',
    desc2v2: '16×8 board · Guardian mode · Blue vs Red',
    desc1v1: 'Classic 8×8 · Human or bot',
    descBots: 'Martin, Aria, Master Nouri…',
    descOnline: 'Create a room or join with a code',
    descModes: 'Pick 1v1 or 2v2 before you play',
    descVariants: 'Coming soon',
    soon: 'Soon', suggested: 'Featured',
    ctaPlay: 'Play now', ctaStart: 'Start', ctaPick: 'Choose', ctaRoom: 'Room', ctaSetup: 'Setup',
    recent: 'Recent games', noRecent: 'No recent games',
    editProfile: 'Edit profile', guest: 'Guest',
    analyze: 'Analyze', undo: 'Undo', restart: 'Restart',
    resign: 'Resign', resignSeat: 'Resign (hand to AI)', resignConfirm: 'Resign this game?', endGameNoResult: 'End — no result',
    moveHistory: 'Move history', status: 'Status', statusControl: 'Status & controls',
    turnPrefix: 'Turn: ', turnLabel: 'Turn', white: 'White', black: 'Black',
    go: 'Go', games: 'Games', wins: 'Wins', rating: 'Rating', winRate: 'Win rate',
    profile: 'Profile', clearData: 'Clear local data', clearDataHint: 'Profile, recent games & settings',
    clearDone: 'Cleared. Refresh the page.', moves: 'moves', accuracy: 'Accuracy',
    accountTitle: 'Account', accountNote: 'Data is stored only on this device.',
    pickPhoto: 'Choose photo', displayName: 'Display name', username: 'Username',
    email: 'Email', bio: 'About me', save: 'Save', cancel: 'Cancel',
    phName: 'e.g. Alex', phBio: 'A few words about you…',
    clearWarn: 'Everything on this site will be erased from this device. Continue?',
    botsNote: 'Pick an opponent. Each bot has its own level and style.',
    yourColor: 'Your color', other: 'Other',
    bots4p: '4-player with bots', bots4pDesc: 'Set Human/AI for each seat.',
    modesNote: 'Choose format and mode before you play.',
    format: 'Format', fmt1v1: '1 vs 1', fmt2v2: '2 vs 2', activeMode: 'Active mode',
    gameMode: 'Game mode', hva: 'Human vs Bot', hvh: 'Human vs Human',
    botLevel: 'Bot strength', lvEasy: 'Easy (~1200)', lvMed: 'Medium (~1500)', lvHard: 'Hard (~1800)', lvVHard: 'Very hard (~2100)', lvMaster: 'Master (~2500+)',
    startGame: 'Start game', themesNote: 'Pick a theme.',
    roomCreateJoin: 'Create or join a room', createRoom: 'Create room', joinCode: 'Join with code',
    variantsNote: 'New variants will appear here.', standard: 'Standard',
    guardianActiveDesc: 'Current 2v2 mode — when a player\'s king is checkmated, they aren\'t removed and keep controlling their pieces until the end; a team only loses once both of its kings are checkmated.',
    standardComingSoon: 'Full elimination on checkmate — coming soon',
    addonPack: 'Add-on pack', continueSetup: 'Continue to setup',
    yourSeat: 'Your seat', seatA: 'A (Blue)', seatB: 'B (Blue)', seatC: 'C (Red)', seatD: 'D (Red)',
    hostNote: 'Host creates the room; empty seats can be filled by AI.',
    aiEmptySeats: 'AI level for empty seats', teamTime: 'Time per team',
    min3: '3 min', min5: '5 min', min10: '10 min', noLimit: 'Unlimited',
    createGetCode: 'Create room & get code', roomCode: 'Room code',
    codeFromHost: 'Get the 6-character code from the host.', desiredSeat: 'Preferred seat',
    joinRoom: 'Join room', waitingPlayers: 'Waiting for players…', leaveRoom: 'Leave room',
    endTitle: 'Game over', endAnalyze: 'Analyze', endAgain: 'Play again', endHome: 'Home',
    endYouWin: 'You won!', endYouLose: 'Defeat', endDraw: 'Draw', endMoves: 'moves',
    sound: 'Sound', soundHint: 'Move and game-over sounds',
    returnLive: 'Return to live position', teamBlue: 'Team Blue', teamRed: 'Team Red',
    teamBlueParen: '(Team Blue)', teamRedParen: '(Team Red)',
    downloadPgn: 'Download PGN', runAnalysis: 'Run Stockfish analysis',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    setup4pTitle: '4-Player Chess', controlPlayers: 'Control each player',
    aiLevel: 'AI strength', timeNote: 'If a team runs out of time, that team loses.',
    aiEngineTitle: 'AI engine',
    noMovesYet: 'No moves yet.', gameStarted: 'Game started.',
    gameStartedTurn: 'New game started. Turn:',
    aiNote: 'AI level and Human/AI seats are set on the bot setup screen.',
    analysisTitle: 'Game analysis', you: 'You', opponent: 'Opponent',
    close: 'Close', prevMove: 'Previous move', nextMove: 'Next move',
    startPos: 'Start', ready: 'Ready', movesTitle: 'Moves',
    reanalyze: 'Re-analyze', analyzing: 'Analyzing…', analysisDone: 'Analysis complete',
    theme_midnight_name: 'Midnight', theme_midnight_desc: 'Icy white pieces · blue black pieces',
    theme_classic_name: 'Classic', theme_classic_desc: 'Traditional white/black pieces',
    theme_ivory_name: 'Ivory', theme_ivory_desc: 'Ivory pieces on wood',
    theme_ocean_name: 'Ocean', theme_ocean_desc: 'White pieces · turquoise black pieces',
    theme_sunset_name: 'Sunset', theme_sunset_desc: 'Cream pieces · deep red pieces',
    theme_carbon_name: 'Carbon', theme_carbon_desc: 'White pieces · metallic gray pieces'
  };
  try {
    const pack = (typeof appSettings !== 'undefined' && appSettings && appSettings.lang === 'en') ? en : fa;
    if (pack[key] != null) return pack[key];
  } catch (_) {}
  return key;
}

function applyLanguage(lang){
  try {
  if (!appSettings) appSettings = { lang: 'fa', premove: true, sound: true };
  if (lang) appSettings.lang = (lang === 'en') ? 'en' : 'fa';
  saveSettings(appSettings);
  document.documentElement.lang = appSettings.lang === 'en' ? 'en' : 'fa';
  document.documentElement.dir = appSettings.lang === 'en' ? 'ltr' : 'rtl';
  try { if (typeof renderThemesGrid === 'function') renderThemesGrid(); } catch(_){}

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('openSettingsLabel', t('settings'));
  set('settingsPageTitle', t('settings'));
  set('settingsLangLabel', t('lang'));
  set('settingsLangHint', t('langHint'));
  set('settingsPremLabel', t('prem'));
  set('settingsPremHint', t('premHint'));
  set('settingsThemesLabel', t('themesRow'));
  set('settingsThemesHint', t('themesHint'));
  set('settingsOpenThemesBtn', t('open'));
  set('settingsClearLabel', t('clearData'));
  set('settingsClearHint', t('clearDataHint'));
  set('settingsClearBtn', t('clearData'));
  set('settingsSoundLabel', t('sound'));
  set('settingsSoundHint', t('soundHint'));
  const soundBtn = document.getElementById('settingsSoundBtn');
  if (soundBtn) soundBtn.textContent = appSettings.sound ? t('on') : t('off');
  try {
    if (typeof AudioFX !== 'undefined') AudioFX.muted = !appSettings.sound;
  } catch(_){}
  set('endGameAnalyzeBtn', t('endAnalyze'));
  set('endGameAgainBtn', t('endAgain'));
  set('endGameHomeBtn', t('endHome'));
  set('homeRecentTitle', t('recent'));
  set('accEditBtn', t('editProfile'));
  set('profilePageTitle', t('profile'));
  set('profileStatGamesLabel', t('games'));
  set('profileStatWinsLabel', t('wins'));
  set('profileStatRatingLabel', t('rating'));
  set('profileStatWinRateLabel', t('winRate'));
  set('profileRecentTitle', t('recent'));

  const premBtn = document.getElementById('settingsPremoveBtn');
  if (premBtn) premBtn.textContent = appSettings.premove ? t('on') : t('off');
  const langFa = document.getElementById('settingsLangFa');
  const langEn = document.getElementById('settingsLangEn');
  if (langFa) { langFa.textContent = 'Persian'; langFa.classList.toggle('active', appSettings.lang === 'fa'); }
  if (langEn) { langEn.textContent = 'English'; langEn.classList.toggle('active', appSettings.lang === 'en'); }
  const backSet = document.getElementById('backFromSettingsBtn');
  if (backSet) backSet.textContent = t('back');
  const backProf = document.getElementById('backFromProfileBtn');
  if (backProf) backProf.textContent = t('back');

  const brandName = document.querySelector('.cc-brand-name');
  if (brandName) brandName.textContent = t('brandName');
  const brandSub = document.querySelector('.cc-brand-sub');
  if (brandSub) brandSub.textContent = t('brandSub');
  const hero = document.querySelector('.cc-hero-title');
  if (hero) hero.textContent = t('hero');

  // Translate every element marked data-i18n (cards + elsewhere)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const val = t(key);
    if (val != null && val !== '') el.textContent = val;
  });
  // titles on buttons that only have title attr
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });
  // Hard fallback by card id (if attributes missing)
  const cards = [
    { id: 'cardPlayBot', title: 'play2v2', desc: 'desc2v2', cta: 'ctaPlay' },
    { id: 'cardPlay1v1', title: 'play1v1', desc: 'desc1v1', cta: 'ctaStart' },
    { id: 'cardPlayBotsHub', title: 'bots', desc: 'descBots', cta: 'ctaPick' },
    { id: 'cardPlayOnline', title: 'online', desc: 'descOnline', cta: 'ctaRoom' },
    { id: 'cardGameModes', title: 'modes', desc: 'descModes', cta: 'ctaSetup' },
    { id: 'cardVariants', title: 'variants', desc: 'descVariants', cta: null }
  ];
  cards.forEach(cfg => {
    const card = document.getElementById(cfg.id);
    if (!card) return;
    const title = card.querySelector('.mode-card-title');
    const desc = card.querySelector('.mode-card-desc');
    const cta = card.querySelector('.cc-cta');
    const pill = card.querySelector('.cc-pill');
    const badge = card.querySelector('.mode-card-badge');
    if (title) title.textContent = t(cfg.title);
    if (desc) {
      desc.textContent = t(cfg.desc);
      desc.style.display = '';
    }
    if (cta && cfg.cta) cta.textContent = t(cfg.cta);
    if (pill) pill.textContent = t('suggested');
    if (badge) badge.textContent = t('soon');
  });

  ['analyze1v1Btn','undo1v1Btn','restart1v1Btn'].forEach((id, idx) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(['analyze','undo','restart'][idx]);
  });

  document.querySelectorAll('.acc-stat small').forEach((el, idx) => {
    const keys = ['games','wins','rating'];
    if (keys[idx]) el.textContent = t(keys[idx]);
  });

  // Profile edit modal
  set('profileModalTitle', t('accountTitle'));
  set('profileModalNote', t('accountNote'));
  set('profileLabelName', t('displayName'));
  set('profileLabelUser', t('username'));
  set('profileLabelEmail', t('email'));
  set('profileLabelBio', t('bio'));
  set('profileSaveBtn', t('save'));
  set('profileCancelBtn', t('cancel'));
  const fileLbl = document.getElementById('profileFileBtnLabel');
  if (fileLbl) {
    // keep input child, set label text node
    const input = fileLbl.querySelector('input');
    fileLbl.textContent = t('pickPhoto');
    if (input) fileLbl.appendChild(input);
  }
  const dn = document.getElementById('profileDisplayName');
  if (dn) dn.placeholder = t('phName');
  const bio = document.getElementById('profileBio');
  if (bio) bio.placeholder = t('phBio');

  
  // Explicit critical labels (screenshots)
  set('startBotGameBtn', t('startGame'));
  const botTitle = document.querySelector('#botSetupView .setup-title');
  if (botTitle) botTitle.textContent = t('setup4pTitle');
  document.querySelectorAll('#botSetupView h3').forEach((h, idx) => {
    const map = ['controlPlayers', 'aiLevel', 'teamTime'];
    if (map[idx]) h.textContent = t(map[idx]);
  });
  document.querySelectorAll('#timeControlPicker .seg-btn').forEach(btn => {
    const m = btn.getAttribute('data-minutes');
    if (m === '3') btn.textContent = t('min3');
    else if (m === '5') btn.textContent = t('min5');
    else if (m === '10') btn.textContent = t('min10');
    else if (m === '0') btn.textContent = t('noLimit');
  });
  const timeNote = document.querySelector('#botSetupView .setup-note');
  if (timeNote) timeNote.textContent = t('timeNote');
  const backSetup = document.getElementById('backFromSetupBtn');
  if (backSetup) backSetup.textContent = t('back');
  // 4p game panels
  document.querySelectorAll('#gameView h3').forEach(h => {
    const raw = (h.getAttribute('data-i18n') || '');
    if (raw) h.textContent = t(raw);
    else if (/تاریخچه|Move history/i.test(h.textContent)) h.textContent = t('moveHistory');
    else if (/موتور|AI engine/i.test(h.textContent)) h.textContent = t('aiEngineTitle');
    else if (/وضعیت|Status/i.test(h.textContent)) h.textContent = t('statusControl');
  });
  const r4 = document.getElementById('resign4pBtn');
  if (r4) r4.textContent = t('resignSeat');
  const r1 = document.getElementById('resign1v1Btn');
  if (r1) r1.textContent = t('resign');
  ['undoBtn','undo1v1Btn'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=t('undo'); });
  ['restartBtn','restart1v1Btn'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=t('restart'); });
  const an1 = document.getElementById('analyze1v1Btn');
  if (an1) an1.textContent = t('analyze');
  const b1 = document.getElementById('backFrom1v1GameBtn');
  if (b1) b1.textContent = t('backToMenu');
  const b2 = document.getElementById('backFromGameBtn');
  if (b2) b2.textContent = t('backToMenu');

  try { renderAccountCard(); } catch(_){}
  try { c1RenderHomeRecent(); } catch(_){}
  try { renderProfileView(); } catch(_){}
  try { c1RenderBotGrid(); } catch(_){}
  // 1v1 depth options
  const depth = document.getElementById('ai1v1Depth');
  if (depth) {
    [...depth.options].forEach(opt => {
      const k = opt.getAttribute('data-i18n');
      if (k) opt.textContent = t(k);
    });
  }
  } catch (err) { console.warn('applyLanguage error', err); }
}
window.applyLanguage = applyLanguage;

function openSettings(){
  try {
    if (typeof applyLanguage === 'function') applyLanguage(appSettings && appSettings.lang);
  } catch (e) { console.warn('applyLanguage', e); }
  try {
    showView('settingsView');
  } catch (e) {
    console.warn('showView settings', e);
    const el = document.getElementById('settingsView');
    if (el) {
      document.querySelectorAll('.view').forEach(v => { v.style.display = 'none'; });
      el.style.display = 'block';
    }
  }
}
window.openSettings = openSettings;

function wireSettingsUI(){
  if (window._settingsWired) return;
  window._settingsWired = true;
  const openBtn = document.getElementById('openSettingsBtn');
  if (openBtn) {
    openBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openSettings();
    });
  }
  const back = document.getElementById('backFromSettingsBtn');
  if (back) back.addEventListener('click', () => showView('homeView'));

  const soundBtn = document.getElementById('settingsSoundBtn');
  if (soundBtn) soundBtn.addEventListener('click', () => {
    appSettings.sound = !appSettings.sound;
    saveSettings(appSettings);
    try { if (typeof AudioFX !== 'undefined') AudioFX.muted = !appSettings.sound; } catch(_){}
    applyLanguage(appSettings.lang);
  });
  const premBtn = document.getElementById('settingsPremoveBtn');
  if (premBtn) {
    premBtn.onclick = null;
    premBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!appSettings) appSettings = { lang: 'fa', premove: true, sound: true };
      appSettings.premove = !appSettings.premove;
      window.appSettings = appSettings;
      try { saveSettings(appSettings); } catch(_){}
      // Update label immediately
      premBtn.textContent = appSettings.premove ? t('on') : t('off');
      premBtn.classList.toggle('off', !appSettings.premove);
      premBtn.classList.toggle('on', !!appSettings.premove);
      if (!appSettings.premove) {
        try { if (typeof c1ClearPremove === 'function') c1ClearPremove(); } catch(_){}
        try {
          if (typeof premoves !== 'undefined' && typeof PLAYERS !== 'undefined') {
            PLAYERS.forEach(p => { premoves[p] = []; });
          }
          if (typeof premoveDraft !== 'undefined') premoveDraft = null;
        } catch(_){}
      }
      try { if (typeof applyLanguage === 'function') applyLanguage(appSettings.lang); } catch(_){}
    });
  }

  const langFa = document.getElementById('settingsLangFa');
  const langEn = document.getElementById('settingsLangEn');
  if (langFa) langFa.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); setAppLang('fa'); });
  if (langEn) langEn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); setAppLang('en'); });

  const th = document.getElementById('settingsOpenThemesBtn');
  if (th) th.addEventListener('click', () => { renderThemesGrid(); showView('themesView'); });
  const thCard = document.getElementById('settingsThemesCard');
  if (thCard) thCard.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'settingsOpenThemesBtn') return;
    renderThemesGrid();
    showView('themesView');
  });

  const clearBtn = document.getElementById('settingsClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    const ok = confirm(t('clearWarn'));
    if (!ok) return;
    try {
      ['chess4p_account_v1','chess4p_settings_v1','chess1v1-recent-games','chess4p_theme'].forEach(k => localStorage.removeItem(k));
      // also theme keys
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf('chess') === 0 || k.indexOf('chess4p') === 0 || k.indexOf('chess1v1') === 0) {
          try { localStorage.removeItem(k); } catch(_){}
        }
      });
    } catch(_){}
    alert(t('clearDone'));
    location.reload();
  });

  applyLanguage(appSettings.lang);
}

const ACC_KEY = 'chess4p_account_v1';
function loadAccount(){
  try {
    const raw = localStorage.getItem(ACC_KEY) || localStorage.getItem('chess4p_account_v1');
    if (raw) return JSON.parse(raw);
  } catch(_){}
  return {
    displayName: '',
    username: '',
    email: '',
    bio: '',
    avatarEmoji: '♟',
    avatarData: null,
    games: 0,
    wins: 0,
    rating: null
  };
}
function saveAccount(acc){
  const key = (typeof ACC_KEY !== 'undefined' && ACC_KEY) ? ACC_KEY : 'chess4p_account_v1';
  try {
    const payload = JSON.stringify(acc);
    localStorage.setItem(key, payload);
    localStorage.setItem('chess4p_account_v1', payload);
    return true;
  } catch (e) {
    console.warn('account save failed', e);
    try {
      const slim = Object.assign({}, acc, { avatarData: null });
      const payload = JSON.stringify(slim);
      localStorage.setItem(key, payload);
      localStorage.setItem('chess4p_account_v1', payload);
      return true;
    } catch (e2) {
      console.warn(e2);
      return false;
    }
  }
}
let account = loadAccount();

function accountBumpGame(won){
  account = loadAccount();
  account.games = (account.games || 0) + 1;
  if (won) account.wins = (account.wins || 0) + 1;
  saveAccount(account);
  renderAccountCard();
}

function renderAccountCard(){
  account = loadAccount();
  const nameEl = document.getElementById('accDisplayName');
  const userEl = document.getElementById('accUsername');
  const gamesEl = document.getElementById('accGames');
  const winsEl = document.getElementById('accWins');
  const ratingEl = document.getElementById('accRating');
  const emojiEl = document.getElementById('accAvatarEmoji');
  const imgEl = document.getElementById('accAvatarImg');
  if (!nameEl) return;
  nameEl.textContent = account.displayName || t('guest');
  userEl.textContent = account.username ? ('@' + account.username.replace(/^@/,'')) : '@guest';
  if (gamesEl) gamesEl.textContent = String(account.games || 0);
  if (winsEl) winsEl.textContent = String(account.wins || 0);
  // Rating: account.rating or average from recent analyzed
  let rating = account.rating;
  if (rating == null || rating === '' || rating === '—') {
    try {
      const list = c1LoadRecent();
      const ratings = list.map(g => parseInt(g.ratingEst, 10)).filter(n => !isNaN(n) && n > 0);
      if (ratings.length) rating = Math.round(ratings.reduce((a,b)=>a+b,0) / ratings.length);
    } catch(_){}
  }
  if (ratingEl) ratingEl.textContent = (rating != null && rating !== '') ? String(rating) : '—';
  if (account.avatarData && imgEl) {
    imgEl.src = account.avatarData;
    imgEl.style.display = 'block';
    if (emojiEl) emojiEl.style.display = 'none';
  } else {
    if (imgEl) imgEl.style.display = 'none';
    if (emojiEl) {
      emojiEl.style.display = '';
      emojiEl.textContent = account.avatarEmoji || '♟';
    }
  }
}

function renderProfileView(){
  const nameEl = document.getElementById('profileViewName');
  const userEl = document.getElementById('profileViewUser');
  const gamesEl = document.getElementById('profileViewGames');
  const winsEl = document.getElementById('profileViewWins');
  const ratingEl = document.getElementById('profileViewRating');
  const wrEl = document.getElementById('profileViewWinRate');
  const listEl = document.getElementById('profileViewRecent');
  if (!nameEl) return;
  account = loadAccount();
  nameEl.textContent = account.displayName || t('guest');
  userEl.textContent = account.username ? ('@' + account.username.replace(/^@/,'')) : '@guest';
  const games = account.games || 0;
  const wins = account.wins || 0;
  gamesEl.textContent = String(games);
  winsEl.textContent = String(wins);
  let rating = account.rating;
  const recent = (typeof c1LoadRecent === 'function') ? c1LoadRecent() : [];
  if (rating == null || rating === '') {
    const ratings = recent.map(g => parseInt(g.ratingEst, 10)).filter(n => !isNaN(n) && n > 0);
    if (ratings.length) rating = Math.round(ratings.reduce((a,b)=>a+b,0) / ratings.length);
  }
  ratingEl.textContent = rating != null && rating !== '' ? String(rating) : '—';
  wrEl.textContent = games > 0 ? (Math.round(wins / games * 100) + '%') : '—';
  // avatar
  const img = document.getElementById('profileViewImg');
  const em = document.getElementById('profileViewEmoji');
  if (account.avatarData && img) {
    img.src = account.avatarData; img.style.display = 'block';
    if (em) em.style.display = 'none';
  } else {
    if (img) img.style.display = 'none';
    if (em) { em.style.display = ''; em.textContent = account.avatarEmoji || '♟'; }
  }
  if (listEl) {
    listEl.innerHTML = '';
    if (!recent.length) {
      const li = document.createElement('li');
      li.className = 'home-recent-empty';
      li.textContent = t('noRecent');
      listEl.appendChild(li);
    } else {
      recent.forEach(g => {
        const li = document.createElement('li');
        li.className = 'home-recent-item';
        const n = (g.moves && g.moves.length) || 0;
        const res = typeof c1ResultLabel === 'function' ? c1ResultLabel(g.result) : (g.result || '—');
        li.innerHTML = '<div class="home-recent-meta"><div class="home-recent-result">' + res +
          '</div><div class="home-recent-sub">' + n + ' ' + t('moves') +
          (g.accuracy ? ' · ' + g.accuracy : '') + '</div></div>';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'home-recent-go';
        btn.textContent = t('go');
        btn.addEventListener('click', (e) => { e.stopPropagation(); c1OpenAnalysis(g, false); });
        li.appendChild(btn);
        listEl.appendChild(li);
      });
    }
  }
}


function openProfileModal(){
  try { if (typeof applyLanguage === 'function') applyLanguage(appSettings.lang); } catch(_){}

  const ov = document.getElementById('profileOverlay');
  if (!ov) return;
  account = loadAccount();
  document.getElementById('profileDisplayName').value = account.displayName || '';
  document.getElementById('profileUsername').value = (account.username || '').replace(/^@/,'');
  document.getElementById('profileEmail').value = account.email || '';
  document.getElementById('profileBio').value = account.bio || '';
  const prev = document.getElementById('profileAvatarPreview');
  if (account.avatarData) {
    prev.innerHTML = '';
    const im = document.createElement('img');
    im.src = account.avatarData;
    prev.appendChild(im);
  } else {
    prev.textContent = account.avatarEmoji || '♟';
  }
  ov.style.display = 'flex';
}
function closeProfileModal(){
  const ov = document.getElementById('profileOverlay');
  if (ov) ov.style.display = 'none';
}

function bootSettings(){
  try { wireSettingsUI(); } catch (e) { console.warn("settings", e); }
  // Event delegation backup for language (survives any listener loss)
  try {
    document.addEventListener('click', function(ev) {
      const t = ev.target && (ev.target.closest ? ev.target.closest('button') : ev.target);
      if (!t || !t.id) return;
      if (t.id === 'settingsLangFa') { ev.preventDefault(); setAppLang('fa'); }
      if (t.id === 'settingsLangEn') { ev.preventDefault(); setAppLang('en'); }
      if (t.id === 'openSettingsBtn' || (t.closest && t.closest('#openSettingsBtn'))) {
        if (t.id === 'openSettingsBtn' || (t.closest && t.closest('#openSettingsBtn') && !t.closest('#settingsView'))) {
          /* openSettings already on button */
        }
      }
    }, true);
  } catch(_){}
}
try { bootSettings(); } catch (e) { console.warn("bootSettings", e); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function(){ try { bootSettings(); } catch(_){} });
} else {
  try { bootSettings(); } catch(_){}
}
try { c1WireEndGame(); } catch (e) { console.warn("endgame", e); }
try {
  const r1 = document.getElementById('resign1v1Btn');
  if (r1) r1.addEventListener('click', c1Resign);
  const r4 = document.getElementById('resign4pBtn');
  if (r4) r4.addEventListener('click', resign4pCurrent);
} catch (e) { console.warn('resign', e); }
(function wireAccountUI(){
  renderAccountCard();
  const edit = document.getElementById('accEditBtn');
  const av = document.getElementById('accAvatarBtn');
  if (edit) edit.addEventListener('click', (e) => { e.stopPropagation(); openProfileModal(); });
  if (av) av.addEventListener('click', (e) => {
    e.stopPropagation();
    try { renderProfileView(); } catch(_){}
    showView('profileView');
  });
  const accCard = document.getElementById('accountCard');
  if (accCard) accCard.addEventListener('click', (e) => {
    if (e.target.closest('#accEditBtn')) return;
    try { renderProfileView(); } catch(_){}
    showView('profileView');
  });
  const backProf = document.getElementById('backFromProfileBtn');
  if (backProf) backProf.addEventListener('click', () => showView('homeView'));
  const cancel = document.getElementById('profileCancelBtn');
  const save = document.getElementById('profileSaveBtn');
  if (cancel) cancel.addEventListener('click', closeProfileModal);
  if (save) save.addEventListener('click', () => {
    account = loadAccount();
    account.displayName = (document.getElementById('profileDisplayName').value || '').trim().slice(0, 24);
    account.username = (document.getElementById('profileUsername').value || '').trim().replace(/^@/,'').replace(/\s+/g,'').slice(0, 20);
    account.email = (document.getElementById('profileEmail').value || '').trim().slice(0, 80);
    account.bio = (document.getElementById('profileBio').value || '').trim().slice(0, 160);
    saveAccount(account);
    renderAccountCard();
    closeProfileModal();
  });
  const file = document.getElementById('profileAvatarFile');
  if (file) file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (f.size > 2e6) { alert('حجم عکس زیاد است (حداکثر ~2MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 160;
        let w = img.width, h = img.height;
        const scale = Math.min(1, max / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const cvs = document.createElement('canvas');
        cvs.width = w; cvs.height = h;
        cvs.getContext('2d').drawImage(img, 0, 0, w, h);
        const data = cvs.toDataURL('image/jpeg', 0.82);
        account = loadAccount();
        account.avatarData = data;
        account.avatarEmoji = '';
        if (!saveAccount(account)) alert('ذخیره پروفایل ناموفق بود (حافظه مرورگر پر است).');
        const prev = document.getElementById('profileAvatarPreview');
        if (prev) {
          prev.innerHTML = '';
          const im = document.createElement('img');
          im.src = data;
          prev.appendChild(im);
        }
        renderAccountCard();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  });
  document.querySelectorAll('#profileEmojiPicks button').forEach(btn => {
    btn.addEventListener('click', () => {
      account = loadAccount();
      account.avatarEmoji = btn.dataset.e;
      account.avatarData = null;
      saveAccount(account);
      const prev = document.getElementById('profileAvatarPreview');
      prev.textContent = btn.dataset.e;
      renderAccountCard();
    });
  });
  const ov = document.getElementById('profileOverlay');
  if (ov) ov.addEventListener('click', (e) => { if (e.target === ov) closeProfileModal(); });
})();



(function wireAnalysisUI(){
  const btn = document.getElementById('analyze1v1Btn');
  if (btn) btn.addEventListener('click', () => {
    try {
      if (!s1) return;
      // Prefer full moveLog; snapshot always
      const snap = c1SnapshotGame();
      if (!snap.moves || !snap.moves.length) {
        alert(((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'No moves to analyze. Play a few moves first.':'حرکتی برای آنالیز نیست. چند حرکت بازی کنید.'));
        return;
      }
      c1OpenAnalysis(snap, true);
    } catch (e) {
      console.error(e);
      alert(((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Could not open analysis: ':'خطا در باز کردن آنالیز: ') + e.message);
    }
  });
  const run = document.getElementById('analysisRunBtn');
  if (run) run.addEventListener('click', () => {
    try { c1RunAnalysis(); } catch (e) { console.error(e); }
  });
  const close = document.getElementById('analysisCloseBtn');
  if (close) close.addEventListener('click', () => {
    if (typeof c1CloseAnalysis === 'function') c1CloseAnalysis();
  });
  const prev = document.getElementById('analysisPrevBtn');
  if (prev) prev.addEventListener('click', () => {
    const an = c1AnalysisState();
    c1ShowAnalysisAt((an.cursor || 0) - 1);
  });
  const next = document.getElementById('analysisNextBtn');
  if (next) next.addEventListener('click', () => {
    const an = c1AnalysisState();
    c1ShowAnalysisAt((an.cursor || 0) + 1);
  });
  const ov = document.getElementById('analysisOverlay');
  if (ov) ov.addEventListener('click', (e) => {
    if (e.target === ov && typeof c1CloseAnalysis === 'function') c1CloseAnalysis();
  });
})();

const THEME_CATALOG = [
  { id: 'midnight', name: 'نیمه‌شب', desc: 'مهره سفید یخی · سیاه آبی', light: '#2b2f3d', dark: '#1a1c25', pw: '#f2f5ff', pb: '#8eb6ff' },
  { id: 'classic', name: 'کلاسیک', desc: 'مهره سفید/مشکی سنتی', light: '#eedfbd', dark: '#6d8b4e', pw: '#ffffff', pb: '#1a1a1a' },
  { id: 'ivory', name: 'عاج', desc: 'مهره عاجی روی چوب', light: '#f3e6c8', dark: '#c4a574', pw: '#fffdf6', pb: '#2a2118' },
  { id: 'ocean', name: 'اقیانوس', desc: 'مهره سفید · سیاه فیروزه‌ای', light: '#3d6f8f', dark: '#1a3d55', pw: '#f5fbff', pb: '#5eb0e0' },
  { id: 'sunset', name: 'غروب', desc: 'مهره کرم · سیاه عنابی', light: '#e8b88a', dark: '#331c22', pw: '#fff8f0', pb: '#cc2453' },
  { id: 'carbon', name: 'کربن', desc: 'مهره سفید · خاکستری فلزی', light: '#4a4a52', dark: '#222228', pw: '#fafafa', pb: '#7a7a88' },
];

function applyTheme(name){
  const allowed = Object.fromEntries(THEME_CATALOG.map(t => [t.id, 1]));
  const t = allowed[name] ? name : 'midnight';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('chess-theme', t); } catch(_){}
  document.querySelectorAll('.theme-btn, .theme-preview-card').forEach(btn=>{
    const id = btn.dataset.theme;
    if (id) btn.classList.toggle('active', id === t);
  });
}

function renderThemesGrid(){
  const grid = document.getElementById('themesGrid');
  if (!grid) return;
  const cur = document.documentElement.getAttribute('data-theme') || 'midnight';
  // Sample setup like chess.com previews: back rank pieces
  const layout = [
    // row, col, glyph, side 'w'|'b'
    [0,0,'♜','b'],[0,1,'♞','b'],[0,2,'♝','b'],[0,3,'♛','b'],
    [1,1,'♟','b'],[1,2,'♟','b'],
    [2,1,'♙','w'],[2,2,'♙','w'],
    [3,0,'♖','w'],[3,1,'♘','w'],[3,2,'♗','w'],[3,3,'♔','w'],
  ];
  grid.innerHTML = '';
  THEME_CATALOG.forEach(th => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-preview-card' + (th.id === cur ? ' active' : '');
    card.dataset.theme = th.id;
    const board = document.createElement('div');
    board.className = 'theme-preview-board';
    const map = {};
    layout.forEach(([r,c,g,side]) => { map[r+','+c] = { g, side }; });
    for (let i = 0; i < 16; i++) {
      const s = document.createElement('span');
      s.className = 'theme-preview-piece';
      const row = Math.floor(i / 4), col = i % 4;
      const light = (row + col) % 2 === 0;
      s.style.background = light ? th.light : th.dark;
      const p = map[row+','+col];
      if (p) {
        s.textContent = p.g;
        s.style.color = p.side === 'w' ? th.pw : th.pb;
        if (p.side === 'w') s.style.textShadow = '0 1px 2px rgba(0,0,0,.35)';
        else s.style.textShadow = '0 1px 1px rgba(0,0,0,.25)';
      }
      board.appendChild(s);
    }
    card.appendChild(board);
    const nm = document.createElement('div');
    nm.className = 'theme-preview-name';
    nm.textContent = t('theme_' + th.id + '_name');
    card.appendChild(nm);
    const ds = document.createElement('div');
    ds.className = 'theme-preview-desc';
    ds.textContent = t('theme_' + th.id + '_desc');
    card.appendChild(ds);
    card.addEventListener('click', () => {
      applyTheme(th.id);
      renderThemesGrid();
      // Refresh boards if visible so pieces pick up theme instantly
      try { if (typeof c1Render === 'function' && document.getElementById('game1v1View')?.style.display !== 'none') c1Render(); } catch(_){}
      try { if (typeof render === 'function' && document.getElementById('gameView')?.style.display !== 'none') render(); } catch(_){}
    });
    grid.appendChild(card);
  });
}

(function initTheme(){
  let saved = 'midnight';
  try { saved = localStorage.getItem('chess-theme') || 'midnight'; } catch(_){}
  applyTheme(saved);
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest && e.target.closest('.theme-btn');
    if(!btn || !btn.dataset.theme) return;
    applyTheme(btn.dataset.theme);
  });
  const back = document.getElementById('backFromThemesBtn');
  if (back) back.addEventListener('click', () => showView('settingsView'));
})();

// wire UI

// 4p board zoom (mobile)
(function wireBoardZoom(){
  let cell = 34; // px
  const min = 22, max = 52, step = 4;
  function apply(){
    const board = document.querySelector('#gameView .chess-board');
    const label = document.getElementById('boardZoomLabel');
    if (board) board.style.setProperty('--cell', cell + 'px');
    if (label) label.textContent = cell + 'px';
  }
  const out = document.getElementById('boardZoomOut');
  const inn = document.getElementById('boardZoomIn');
  if (out) out.addEventListener('click', () => { cell = Math.max(min, cell - step); apply(); });
  if (inn) inn.addEventListener('click', () => { cell = Math.min(max, cell + step); apply(); });
})();

(function wire1v1(){
  const card=document.getElementById('cardPlay1v1');
  if(card) card.addEventListener('click', ()=>{ s1ActiveBot=null; c1InitStockfish(); showView('setup1v1View'); });
  const backS=document.getElementById('backFrom1v1SetupBtn');
  if(backS) backS.addEventListener('click', ()=>showView('homeView'));
  const backG=document.getElementById('backFrom1v1GameBtn');
  if(backG) backG.addEventListener('click', ()=>showView('homeView'));
  const start=document.getElementById('start1v1Btn');
  if(start) start.addEventListener('click', c1StartFromSetup);
  const undo=document.getElementById('undo1v1Btn');
  if(undo) undo.addEventListener('click', c1Undo);
  const restart=document.getElementById('restart1v1Btn');
  if(restart) restart.addEventListener('click', c1Restart);

  document.querySelectorAll('#mode1v1Picker .seg-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#mode1v1Picker .seg-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const isHva = btn.dataset.mode === 'hva';
      const col = document.getElementById('color1v1Section');
      const aiSec = document.getElementById('ai1v1Section');
      if (col) col.style.display = isHva ? '' : 'none';
      if (aiSec) aiSec.style.display = isHva ? '' : 'none';
    });
  });
  document.querySelectorAll('#color1v1Picker .seg-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#color1v1Picker .seg-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
})();



