# Massaggiatore — Logo Assets

Archivio di tutti i formati del logo dell'app **Stock Gain Messenger** (TESTmess).

Brand: due mani in massaggio + curva sorriso, su quadrato arrotondato **teal `#128C7E`**.

## Contenuto

| File | Uso |
|------|-----|
| `logo-512.png` | Master raster (sorgente di tutti i PNG) |
| `logo-256.png` … `logo-16.png` | PNG ridimensionati (256/192/128/64/48/32/16) |
| `apple-touch-icon.png` | 180×180, icona home iOS |
| `favicon.ico` | Favicon multi-size (16/32/48, PNG-encoded) |
| `logo.svg` | Logo scalabile (master PNG incapsulato → fedele al brand) |
| `logo-transparent.svg` | Versione vettoriale a **sfondo trasparente** (mani bianche, per sfondi scuri/teal) |

## File usati dal sito (runtime)

Copiati in `../assets/`:
`favicon.ico`, `apple-touch-icon.png`, `logo.svg`, `logo-192.png`, `logo-512.png`.

> Questa cartella è un **archivio**: non viene referenziata dal sito. I file effettivamente serviti stanno in `assets/`. Se rigeneri il logo, sostituisci `logo-512.png` qui e rigenera gli altri formati.

## Rigenerazione (macOS, solo `sips`)

```sh
for s in 256 192 128 64 48 32 16; do cp logo-512.png logo-$s.png && sips -z $s $s logo-$s.png; done
cp logo-512.png apple-touch-icon.png && sips -z 180 180 apple-touch-icon.png
```
