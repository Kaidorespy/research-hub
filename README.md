# Research Hub

A local Claude Code orchestration app for hands-off research dossiers.

## Run

```powershell
cd C:\Users\Casey\Projects\research-hub
npm start
```

Open `http://localhost:5181`.

## Pipeline

1. Optional clarifier decides whether the topic needs high-value questions.
2. Dean assigns fields and subfields.
3. Independent field researchers produce field reports.
4. Optional inspectors probe subfield questions.
5. Synthesizer assembles an encyclopedia-style dossier.

Outputs are written under `runs/<timestamp>`.

## Depth

- `light`: fewer fields, no inspectors, practical output.
- `medium`: balanced field coverage and limited inspections.
- `deep`: more fields, more inspectors, graduate-level synthesis.

Model names are editable in `config/hub.config.json`. The default config uses `opus`, not `opus4.8`.
