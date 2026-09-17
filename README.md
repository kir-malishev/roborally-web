# RoboRally Web

Браузерная реализация RoboRally для движка meme-police. Локально игра запускается только через соседний репозиторий [`meme-police-sandbox`](https://github.com/xdghcnt/meme-police-sandbox).

## Установка и запуск

Нужен Node.js 20 или новее. Репозитории должны лежать рядом:

```text
meme_police/
├── meme-police-sandbox/
└── roborally-web/
```

Установите зависимости в обоих репозиториях:

```bash
cd meme-police-sandbox
npm install
cd ../roborally-web
npm install
```

Запуск с автоматическим перезапуском сервера:

```bash
npm run dev
```

Игра будет доступна по адресу <http://localhost:8090/bg/roborally>. Идентификатор комнаты находится после `#`, например `/bg/roborally#test-room`. Для тестового имени без диалога используйте `/bg/roborally?name=Bob#test-room`.

Имя меняется штатной кнопкой-карандашом в меню движка. Лобби игры отдельно имя не хранит.

## Тесты

```bash
npm test
npm run test:browser
```

Браузерные тесты по умолчанию ищут sandbox в `../meme-police-sandbox`. Другой путь можно задать переменной `MEME_POLICE_SANDBOX_DIR`. Путь к Chrome можно переопределить через `ROBORALLY_BROWSER_PATH`.

Исходные материалы из соседней папки `Roborally` используются только некоторыми скриптами разработки. Для запуска игры они не нужны.
