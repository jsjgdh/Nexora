# The typefaces

Every face in this folder is under the SIL Open Font License 1.1, whose full
text is in `OFL.txt` beside this file.

| Family | Copyright | Designer |
|---|---|---|
| Instrument Sans | Copyright 2022 The Instrument Sans Project Authors | Rodrigo Fuenzalida |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors | Philipp Nurullin, Konstantin Bulenkov |

The Latin subset of each face is served, because the site has no use for the
others. The faces are served from this site, so the front door makes no
third-party request to render a page.

The files:

- `instrument-sans-latin.woff2` — variable, weight 400 to 700, roman.
- `jetbrains-mono-latin.woff2` — variable, weight 400 to 700, roman.

The roman faces are the whole set: the site sets no italic, so it serves no
italic face and asks no browser to download one.
