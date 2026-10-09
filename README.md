# Kjøkkenbudsjett

En enkel React-app for å fordele et kjøkkenbudsjett mellom uker, føre
handleliste og registrere kjøp. Uten Supabase-oppsett lagres data lokalt i
nettleseren. Med Supabase-oppsett kan inviterte brukere logge inn og dele
budsjettet mellom enheter.

Appen er publisert på:
[https://techgruppa.github.io/budsjettapp/](https://techgruppa.github.io/budsjettapp/)

## Lokal utvikling

Installer avhengigheter og start utviklingsserveren:

```bash
npm install
npm start
```

## Supabase: delt budsjett og innlogging

1. Opprett et Supabase-prosjekt på [supabase.com](https://supabase.com/) og
   kjør SQL-en i `supabase/schema.sql` i prosjektets SQL Editor.
2. I Supabase Authentication-innstillingene, slå av offentlig registrering.
   Inviter hver bruker fra prosjektets brukeradministrasjon. De kan sette
   passord via invitasjonslenken. Appen støtter også tilbakestilling av passord.
3. Sett Authentication → URL Configuration sin **Site URL** til
   `https://techgruppa.github.io/budsjettapp/`, og legg både denne URL-en og
   `http://localhost:3000` til listen over tillatte redirect-URL-er.
4. Kopier prosjektets URL og **publishable key** til `.env.production.local`
   (basert på `.env.example`) før produksjonsbuild og GitHub Pages-publisering.
   For lokal utvikling kan de samme verdiene legges i `.env.local`.
5. Publiser en ny build med `npm run deploy`. CRA bygger disse
   `REACT_APP_*`-verdiene inn i den offentlige klienten. Supabase publishable
   key er ment for klientbruk; legg aldri inn en `service_role`-nøkkel.
6. Opprett kontoer via Authentication → Users → Add user. Offentlig registrering
   skal være slått av. Send invitasjon til den første brukeren og logg inn med
   denne kontoen. Hvis den delte databasen ennå ikke har en rad, oppretter første
   innlogging den fra dataene som allerede er lagret i den nettleseren.

SQL-oppsettet begrenser lesing og skriving til autentiserte brukere. Hold
offentlig registrering avslått og inviter bare personer som skal ha tilgang:
alle inviterte brukere deler og kan endre samme budsjett. Endringer synkroniseres
automatisk mellom aktive økter; samtidige endringer lagres som én delt tilstand,
så en nyere lagring kan overskrive en endring som ikke allerede er synkronisert.
Uten Supabase-variabler fortsetter appen i lokal nettlesermodus.

Supabase Free-planen kan sette prosjekter på pause etter en periode uten bruk.

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
