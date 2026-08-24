# G3 Performance Foundations v1.0 — canonical ingestion package

This directory holds the canonical FINAL artifacts of the locked
**G3 Performance Foundations v1.0** package, as received for NovaKore
implementation on 2026-08-23. These files are the authoritative inputs to
`scripts/g3-foundations/generate.mjs`; the generated seed is
`supabase/seeds/g3-performance-foundations.sql`.

## Provenance and canonicality record

The handoff package directory (`C:\Users\JR\G3 Performance Foundations`)
delivered the ten course artifacts with a `_1` filename suffix (a download
collision rename). Canonicality of their **content** was verified before
ingestion, per the package's Canonical File Rule:

- The `_1` files contain the Foundations Harmonization Pass additions
  (the Foundations Authority Rule §0 subsection, the series evidence
  taxonomy subsection, and the `foundations.authority_rule` /
  `foundations.series_evidence_taxonomy` build fields) that the parent
  curriculum §7.1–7.2 records as present **only** in the post-gate
  canonical pair. Same-named files in `Downloads/` lack all of these
  markers and are pre-harmonization — they were NOT used.
- The superseded G3 102 delivery sentence ("two supervised practical
  blocks and a final defense") appears in these files **only** inside the
  §20.6a archive record where it is identified as superseded — never
  asserted. The canonical G3 102 architecture (12 modules, 1,110 min /
  18.5 h, four-week window, PS-1..PS-4, T-01) is confirmed in both the
  MD and the JSON.
- Files were copied here under their canonical names (suffix dropped,
  bytes unchanged).

## Known package gap

`G3-Performance-Foundations-Manifest-v1.0-FINAL.json` (package item #1,
"ingested first") was **absent from the handoff package and from this
machine** at implementation time. Its series-level content is fully
restated by the parent curriculum document (sequence, roles, authority
rule, taxonomy, workload, completion rule, package list, prohibitions,
validation record §7.4), which is authoritative at series level and was
used to establish the series record in NovaKore. When the manifest file
is delivered, place it in this directory and re-run
`node scripts/g3-foundations/validate-package.mjs` to verify its
references against these hashes.

## SHA-256 of the canonical files as ingested

```
ec428145137ace00696a7044aa28bb3b13be8786335bc92a9efec1f1a65ebddf  G3-101-Course-Specification-v2.0-FINAL.md
c0c20807ae76bf7883b3c05d0e2da55fef2e4d6d1924c4ccf2f1bba92a4706b1  G3-101-NovaKore-Build-v2.0-FINAL.json
8ea3d8093bf74e9763d99490550df841003c677ede7f5875f1f382492448db88  G3-102-Course-Specification-v1.0-FINAL.md
50105540552785516d5ceb094a97a29e320fd964ef1b3dd2863b11ec2e67018e  G3-102-NovaKore-Build-v1.0-FINAL.json
90e0bd83e008559c9b640173ded95f7ec8db36810a917c545a836ed0280cdaf6  G3-103-Course-Specification-v1.0-FINAL.md
5ceef6ae24c42eeb5a69f9504d818594ac2e22426f060a6d2a96b3e9691bc4d2  G3-103-NovaKore-Build-v1.0-FINAL.json
e1a397f0d50f29e9ed909a23e22e987f04a9af3a273633952b1dae133ecec51b  G3-104-Course-Specification-v1.0-FINAL.md
8e1981a3fc28c6c707c24838b3685658eafbd1aecf4c01edf110dcb62509edf1  G3-104-NovaKore-Build-v1.0-FINAL.json
3aa563b9794721e3a8bae820af70f0ad361658d943f7664379fca035433092d9  G3-105-Course-Specification-v1.0-FINAL.md
c52d98f47a4a7a427e53192576be0c0214fdb868cbfc74db2f16fe55be56cff0  G3-105-NovaKore-Build-v1.0-FINAL.json
f776416d270df97b9f962caa3d564d406368ce84fee096781cba024ba17a4822  G3-Performance-Foundations-Curriculum-v1.0-FINAL.md
```

Any change to any artifact requires the cross-course validator to be
re-run and the parent §7.4 record re-recorded before NovaKore
re-ingestion (parent curriculum §7.5).
