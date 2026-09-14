# Web board assets

These WebP files are the complete runtime image set used by `roborally-web`.
The application does not read files from the sibling `Roborally` directory.

The high-resolution source scans remain useful during development. Regenerate
this directory from them with:

```powershell
.\scripts\build-web-assets.ps1
```

The default build scales the scans to 1200 pixels wide and encodes WebP at
quality 82. Both values can be overridden with `-Size` and `-Quality`.
