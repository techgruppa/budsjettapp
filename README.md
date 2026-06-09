# Kjøkkenbudsjett

En enkel React-app for å fordele et kjøkkenbudsjett mellom uker, føre
handleliste og registrere kjøp. Data lagres lokalt i nettleseren.

Appen er publisert på:
[https://techgruppa.github.io/budsjettapp/](https://techgruppa.github.io/budsjettapp/)

## Lokal utvikling

Installer avhengigheter og start utviklingsserveren:

```bash
npm install
npm start
```

Kjør tester:

```bash
npm test -- --watchAll=false
```

Lag en produksjonsbuild:

```bash
npm run build
```

## Publisering til GitHub Pages

`homepage` i `package.json` sørger for at produksjonsbuilden bruker riktig
base-URL. Publiser den nyeste versjonen til `gh-pages`-branchen med:

```bash
npm run deploy
```

GitHub Pages må bruke `gh-pages`-branchen og mappen `/ (root)` som kilde i
repository-innstillingene.
