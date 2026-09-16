# شطرنج ۴ نفره + ۱v۱

## ساختار
```
index.html          # صفحه اصلی
css/styles.css      # تمام استایل‌ها
js/game-4p.js       # منطق و UI حالت ۲v۲ / آنلاین
js/game-1v1.js      # شطرنج ۱v۱ + Stockfish + آنالیز
js/ai-worker.js     # Web Worker هوش مصنوعی ۲v۲
bots/               # موتورها و ربات‌های بعدی
modes/              # حالت‌های بازی بعدی
stockfish.js        # (اختیاری) موتور ۱v۱ — کنار index یا bots/stockfish/
```

## اجرای روی GitHub Pages
1. کل پوشه را push کن (نه فقط index.html).
2. در Settings → Pages منبع را روی branch اصلی بگذار.
3. `stockfish.js` را هم اگر ۱v۱ می‌خواهی آپلود کن.

## توسعه
کد منطق عمداً تقریباً همان نسخهٔ تک‌فایلی است؛ فقط جدا شده تا بتوانی بات و مود جدید اضافه کنی.
