# Notion Playlist Player

Statická embed aplikace pro Notion a Vercel.

## Co umí

- YouTube odkazy, přímé audio odkazy a lokálně nahrané audio soubory
- Pořadí nebo shuffle
- Volitelný loop celého playlistu
- Přechod 0 / 2 / 5 sekund (fade-out)
- Duplikování skladeb
- Drag-and-drop řazení a automatické číslování
- Embed odkaz s konfigurací playlistu
- Žádné ukládání stavu přehrávání — po znovunačtení začíná od začátku

## Nasazení na Vercel

### Nejjednodušší: přes Vercel dashboard

1. Rozbal ZIP do samostatné složky.
2. Nahraj složku do nového GitHub repozitáře, například `meditation-playlist-player`.
3. Otevři https://vercel.com/new.
4. Importuj nový repozitář.
5. Framework Preset nastav na **Other**.
6. Build Command nech prázdný.
7. Output Directory nech prázdný.
8. Klikni **Deploy**.

### Přes Vercel CLI

```bash
cd meditation-playlist-player
vercel
vercel --prod
```

Při prvním průchodu:
- Set up and deploy: Yes
- Link to existing project: No
- Project name: `meditation-playlist-player`
- Directory: `./`
- Override settings: No

## Použití v Notionu

1. Otevři nasazenou aplikaci.
2. Přidej YouTube nebo přímé audio odkazy.
3. Seřaď skladby, nastav režim, loop a přechod.
4. Klikni **Kopírovat embed odkaz**.
5. V Notion stránce meditace napiš `/embed` a vlož odkaz.

Embed URL uchovává jen konfiguraci playlistu. Neukládá pozici, rozehranou skladbu ani čas. Každé nové otevření začíná od první skladby.

## Důležité omezení vlastních souborů

Soubor vybraný tlačítkem **Nahrát audio** existuje pouze v aktuální kartě prohlížeče a nelze ho z bezpečnostních důvodů uložit do embed odkazu.

Pro trvalou meditaci se souborem:

1. Nahraj audio do veřejně dostupného úložiště nebo do složky `public/audio/` tohoto projektu.
2. Po novém deployi použij přímý odkaz, například:
   `https://tvoje-domena.vercel.app/public/audio/nazev.mp3`
3. Tento odkaz přidej jako audio URL a následně zkopíruj embed odkaz.

Poznámka: YouTube může v embedu vyžadovat první ruční kliknutí na Play kvůli pravidlům autoplay prohlížečů.
