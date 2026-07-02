export function clarifierPrompt(config, request) {
  return `Review this research request and decide whether clarification is needed before launching a multi-agent research process.

Depth: ${request.depth}

User topic:
${request.topic}

Extra context:
${request.context || "None"}

Standards:
${config.settings.researchStandards}

${jsonOnlyInstruction()}

Return strict JSON:
{
  "needsClarification": true,
  "questions": ["0-5 high-value questions"],
  "assumedAnswers": ["reasonable assumptions if the user does not answer"],
  "refinedTopic": "a clarified research brief that can be run hands-off"
}`;
}

export function deanPrompt(config, request, clarification) {
  const maxFields = config.settings.maxFields[request.depth] || 5;
  return `Assign fields of study for a multi-agent research project.

Depth: ${request.depth}
Maximum fields: ${maxFields}

Research brief:
${clarification?.refinedTopic || request.topic}

User context:
${request.context || "None"}

Clarification assumptions:
${JSON.stringify(clarification?.assumedAnswers || [], null, 2)}

Standards:
${config.settings.researchStandards}

${jsonOnlyInstruction()}

Return strict JSON:
{
  "researchTitle": "clear title",
  "fields": [
    {
      "id": "short-slug",
      "name": "field name",
      "rationale": "why this field is needed",
      "subfields": ["subfield names"],
      "keyQuestions": ["questions this field must answer"],
      "expectedDeliverable": "what the field researcher should produce"
    }
  ]
}`;
}

export function researcherPrompt(config, request, plan, field) {
  return `Research this assigned field independently.

Depth: ${request.depth}

Overall research title:
${plan.researchTitle}

Overall topic:
${request.topic}

Assigned field:
${JSON.stringify(field, null, 2)}

User context:
${request.context || "None"}

Standards:
${config.settings.researchStandards}

For light depth: be practical and concise.
For medium depth: include nuance, examples, disagreements, and implementation relevance.
For deep depth: operate at graduate/phd-level conceptual depth, identify methods, history, controversies, open problems, and field boundaries.

${jsonOnlyInstruction()}

Return strict JSON:
{
  "fieldId": "field id",
  "fieldName": "field name",
  "executiveFindings": ["most important findings"],
  "fieldReportMarkdown": "structured markdown report",
  "suggestedInspectors": [
    {
      "id": "short-slug",
      "question": "narrow subfield question worth inspecting",
      "reason": "why it matters"
    }
  ],
  "uncertainty": ["uncertainties or conflicts"],
  "bibliographyLeads": ["source types, search terms, primary references to verify"]
}`;
}

export function inspectorPrompt(config, request, fieldReport, inspector) {
  return `Inspect one narrow subfield question. Be concise but rigorous.

Depth: ${request.depth}

Question:
${inspector.question}

Reason:
${inspector.reason}

Parent field report:
${JSON.stringify(fieldReport, null, 2)}

Standards:
${config.settings.researchStandards}

${jsonOnlyInstruction()}

Return strict JSON:
{
  "inspectorId": "id",
  "question": "question",
  "findingsMarkdown": "concise markdown findings",
  "implications": ["what this changes for the overall research"],
  "confidence": "low | medium | high"
}`;
}

export function synthesizerPrompt(config, request, plan, fieldReports, inspections) {
  return `Synthesize this multi-agent research project into a comprehensive encyclopedia-style dossier.

Depth: ${request.depth}

Original topic:
${request.topic}

User context:
${request.context || "None"}

Plan:
${JSON.stringify(plan, null, 2)}

Field reports:
${JSON.stringify(fieldReports, null, 2)}

Inspector reports:
${JSON.stringify(inspections, null, 2)}

Standards:
${config.settings.researchStandards}

Make the result useful to hand to another person. Include definitions, field map, major findings, practical implications, unresolved questions, and a source strategy. Mark speculation and uncertainty clearly.

${jsonOnlyInstruction()}

Return strict JSON:
{
  "title": "research title",
  "executiveBriefMarkdown": "short high-signal summary",
  "encyclopediaMarkdown": "long structured dossier",
  "openQuestionsMarkdown": "unresolved questions and how to answer them",
  "practicalNextStepsMarkdown": "what to do with this research next",
  "sourceStrategyMarkdown": "what sources should be checked, by priority"
}`;
}

function jsonOnlyInstruction() {
  return "Output only valid JSON in stdout. Do not write files. Do not include markdown fences, commentary, headings outside JSON, or notes about saving.";
}
