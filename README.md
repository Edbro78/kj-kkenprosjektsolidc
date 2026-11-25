# Romplanlegger

Et program der du tegner opp et rom og innreder det med skreddersydde møbler ved å dra og slippe dem i planen. Programmet lager:
- deleliste og DXF-filer for MDF-plater
- 3D-printfiler for plastdelene
- monteringsanvisning
- SolidCraft-modeller av rommet og modulene

## Start

Dobbeltklikk **`index.html`**. Appen åpner i nettleseren og trenger ingen server eller installasjon. All kode og alle plastdelfiler ligger inne i den ene filen. Arbeidet lagres i nettleseren.

Én funksjon krever utviklingsserveren: knappen **Åpne i SolidCraft**, som kjører SolidCraft på maskinen.

```powershell
npm install
npm run dev
```

Åpne adressen som vises, vanligvis http://localhost:5173.

### Etter endringer i koden

```powershell
npm run build
```

Denne kommandoen lager `index.html` på nytt fra `app.html` og `src/`. `app.html` er inngangen under utvikling, og `index.html` er den ferdigbygde fila.

## Bruk

- **Moduler:** Dra underskap, hylle eller skrivebord fra venstre inn i planen, eller klikk på dem.
- **Snapping:** Modulene legger ryggen inntil nærmeste vegg og roterer seg automatisk. Kantene festes mot hjørner og naboer. Hold **Shift** mens du drar for å plassere fritt.
- **Fyll vegg:** Fyller ledig plass langs en vegg med moduler i jevne bredder, utenom dører og vinduer.
- **Hurtigtaster:** R roterer, Del sletter, Ctrl+D dupliserer, Ctrl+Z angrer, Ctrl+Y gjør om, Esc fjerner markeringen.
- **Kontroll:** Rødt betyr kollisjon, utenfor rommet, sperret dør eller høyere enn taket. Gult betyr at modulen dekker et vindu eller har mindre enn 800 mm fri plass foran seg.
- **Eksport:** Rom-JSON, Design-JSON og `deleliste.csv`. CSV-en bruker semikolon og komma, slik norsk Excel forventer.
- Arbeidet lagres automatisk i nettleseren.

## Struktur

| Fil | Innhold |
|---|---|
| `schema/rom.schema.json` | JSON-skjema for rommet |
| `schema/design.schema.json` | JSON-skjema for et innredet rom (rom + moduler) |
| `src/model/types.ts` | Datamodellen (alle mål i mm) |
| `src/library/index.ts` | Parametriske møbelmaler: parametere, grenser, plater og beslag |
| `src/model/geometry.ts` | Snapping, kollisjons- og ergonomisjekk, «fyll vegg» |
| `src/model/export.ts` | Deleliste og CSV |
| `src/components/` | 2D-plan (Konva), 3D-visning (three.js), paneler |

### Koordinater

- Origo er i nordvestre innerhjørne.
- x går mot øst, y går mot sør, z går opp.
- En modul har `x` og `y` i senteret av fotavtrykket.
- `rotation` er gitt med klokka: 0 = ryggen mot nord, 90 = mot øst, 180 = mot sør, 270 = mot vest.
- Platene i hver mal er gitt i lokale koordinater:
  - u langs bredden
  - v fra ryggen og fremover
  - z opp

Denne konvensjonen gjelder også for SolidCraft i fase 2.

### Legge til en ny modultype

Lag en ny `Template` i `src/library/index.ts` med parametere, `footprint`, `panels` og `hardware`. Legg den inn i `LIBRARY` og `TEMPLATES`, og legg til typen i `ModuleType` og i `design.schema.json`.

## Fase 2: SolidCraft

`tools/solidcraft.ts` gjør om en design-JSON til SolidCraft-kommandoer (batch-filer):

```powershell
npm run solidcraft -- eksempler/eksempelrom.design.json solidcraft/batches
```

Skriptet lager disse filene:

- `00-rom.json`: gulv og vegger med dør- og vindusåpninger.
- `01-…json` og videre: én fil per modul.
  - Hver plate blir en egen body, med del-ID som navn (`UK-01-SIDE.1`). Del-ID-en er den samme som i delelisten.
  - Hullene modelleres:
    - konfirmatskruer: Ø7 gjennom og Ø5 forboring i kanten
    - 32 mm-hyllehull: Ø5 × 12
    - hengselkopper: Ø35 × 12,5
  - Hullreglene ligger i `src/library/holes.ts`.
- `eksplodert-…json`: eksplodert visning av hver unike modul.
- `manifest.json`: forventet volum og antall bodies for hver fil. Dette brukes til å kontrollere modellen etter bygging.

### Koordinater i SolidCraft

- X går mot øst, Y mot nord og Z opp.
- Origo er i det sørvestre innerhjørnet. Y regnes som romdybde − y fra planen.

### Kjøre i SolidCraft-appen

SolidCraft må startes med kontrollport, så Claude kan styre den og du kan se modellen bygges:

```powershell
& "C:\Program Files\SolidCraft\solidcraft.exe" --control 7878
```

### Resultat for eksempelrommet

Filene ligger i `solidcraft/`:

- `eksempelrom.sc` og `.step`: hele rommet med 62 plater og 928 borehull: 160 enkelthull og 768 hyllehull i 12 rader-mønstre.
- `eksplodert-UK-01.sc`, `eksplodert-HY-01.sc` og `eksplodert-SB-01.sc`, hver med et `.png`-bilde.

Volumet til hver modul er kontrollert mot det skriptet regnet ut, med under 0,1 mm³ avvik. Det betyr at alle hullene treffer riktig plate.

## Tegne et rom i SolidCraft

SolidCraft kan ikke åpne en `.design.json` direkte. Det finnes to veier.

**Fra appen:** trykk **Åpne i SolidCraft** øverst. Knappen krever at appen kjører med `npm run dev`. Den gjør tre ting:
1. Lagrer rommet som `rom/<romnavn>.design.json` i prosjektet.
2. Tegner det med `solidcraft-cli`. Det tar rundt 10 sekunder per modul.
3. Gjør rommet tilgjengelig i SolidCraft:
   - Er SolidCraft lukket, startes det med rommet åpent.
   - Er SolidCraft allerede åpent, ligger rommet klart i bibliotekspanelet under **Rom › <romnavn>**. SolidCraft åpner et nytt vindu hvis den får en fil mens den kjører, derfor åpnes ikke filen automatisk da.

**Fra terminalen:**

```powershell
npm run tegn -- "C:UsersedvarDownloadsmitt-rom.design.json"
```

Begge veier lager mappen `solidcraft/bibliotek/Rom/<romnavn>/` med disse filene:
- `<romnavn>.sc` og `.step`: hele rommet med vegger, dører, vinduer, alle plater med hull, og farger
- `Eksplodert <Modul> <ID>.sc`: én fil per unike modul

Antall deler og volum kontrolleres for hver fil.

### Eksplodert visning i appen

3D-visningen har en glidebryter, **Eksplodert**, øverst til høyre. Med en modul valgt trekkes bare den modulen fra hverandre. Uten noe valgt gjelder det alle modulene.

## Modulbibliotek i SolidCraft

`solidcraft/bibliotek/` har én ferdig SolidCraft-fil per modul og variant, med alle plater, hull og farger. Filene er sortert i undermapper: `Underskap`, `Hyller`, `Skrivebord` og `Plastdeler`.

Slik får du modulene i panelet til venstre i SolidCraft: trykk tannhjulet i panelet (Eksempler) og velg denne mappen som CAD-mappe:

```
C:\Users\edvar\Documents\Claude alle dokumenter\romplanlegger\solidcraft\bibliotek
```

### Legge til eller endre varianter

Variantene står i `VARIANTS` i `tools/bibliotek.ts`. Hver variant har filnavn, type og parametere. Bygg alle på nytt uten appen:

```powershell
node tools/bibliotek.ts solidcraft/batches/bibliotek solidcraft/bibliotek
```

Kjør deretter `solidcraft-cli run solidcraft/batches/bibliotek/cli-<nr>-<type>.json --save "solidcraft/bibliotek/<mappe>/<navn>.sc"` for hver variant. `manifest.json` i batchmappen har forventet volum og antall plater for kontroll.

Hver modul står med ryggen mot Y = 0, fronten mot −Y, venstre side i X = 0 og gulvet i Z = 0.

## Fase 3: Bestillingspakke

```powershell
npm run bestilling -- eksempler/eksempelrom.design.json
```

Skriptet lager pakken i `bestilling/<romnavn>/`.

| Fil | Innhold |
|---|---|
| `dxf/` | Én DXF (R12) per unik MDF-plate, klar for CNC. Like plater, også speilvendte, deler fil. |
| `mdf-bestilling.csv` | Alle MDF-deler med mål, antall, hull og DXF-fil |
| `mdf-sammendrag.csv` | m² og antall hele plater (2440 × 1220 mm, 15 % kapp) per tykkelse |
| `beslag-kjop.csv` | Skruer, hengsler, ben og innsatser som kjøpes |
| `3d-print.csv` + `3d-print/` | Plastdeler som STL og 3MF, med antall, vekt og printretning |
| `montering.pdf` | Oversikt, plastdeler og én side per modultype med eksplodert tegning og monteringssteg |
| `modell/` | STEP og SolidCraft-fil av hele rommet |
| `deleliste.csv` | Samme deleliste som appen lager |

### Fra appen

Du kan også lage pakken rett fra appen, uten kommandolinjen.

- **«Bestillingspakke» i toppmenyen** laster ned `<romnavn>-bestilling.zip` med det samme innholdet som over. Noen ting er annerledes enn i CLI-pakken:
  - Monteringsanvisningen er `montering.html`. Åpne den og skriv den ut som PDF.
  - Oversiktsbildet er tatt fra 3D-visningen. Det kommer bare med når 3D-visningen vises.
  - Pakken har ingen eksploderte modulbilder og ingen `modell/`-mappe, fordi de kommer fra SolidCraft.
  - Pakken har med `design.json`, slik at du kan åpne rommet igjen.
- **«Skriv ut monteringsanvisning» i Deleliste-visningen** åpner anvisningen i et nytt vindu og starter utskrift. Der kan du velge «Lagre som PDF».

Innholdet lages av `buildPackage` i `src/model/bestilling.ts`, som både CLI-en og appen bruker. Plastdelfilene ligger i `src/assets/plastdeler/` og bakes inn i `index.html`. Kopier dem dit på nytt fra `solidcraft/plastdeler/` hvis du endrer delene, og kjør `npm run build`.

### Lag i DXF-filene

Platen er tegnet sett fra side 1.

| Lag | Betydning |
|---|---|
| `KONTUR` | Platens ytterkant |
| `GJENNOM_D<d>` | Gjennomgående hull |
| `S1_D<d>_Z<dybde>` | Blindhull boret fra side 1 |
| `S2_D<d>_Z<dybde>` | Blindhull boret fra side 2. Det er tegnet i samme koordinater, som sett gjennom platen. |
| `KANT_D<d>_Z<dybde>` | Horisontal boring i kanten, midt i tykkelsen, tegnet som en linje |
| `TEKST` | Del-ID, mål og antall |

### Plastdeler

Delene ligger i `solidcraft/plastdeler/`, og `src/model/types.ts` kobler beslag til dem (`PrintPart`).

- **Hyllebærer Ø5:** en tapp Ø4,9 × 9 på en knast 12 × 10 × 7.
- **Knott Ø30:** avrundet topp og hull Ø5,6 til en M4 gjengeinnsats. Den festes med M4×25 gjennom et Ø5-hull i døra.
- **Vinkelbeslag:** 40 mm bredt og 4 mm tykt, med R4 i innerhjørnet og 4 forsenkede hull for 4×16-skruer.

Alle tre er kontrollert mot volumet regnet ut for hånd.
