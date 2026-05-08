/**
 * Bundled manuscript templates for medical-research authoring. Each template
 * inlines a YAML front-matter header, a `[toc]` directive, and the heading
 * skeleton expected by mainstream reporting guidelines.
 *
 * The templates are intentionally lean: they nudge structure without
 * prescribing prose so authors can adapt to specific journal requirements.
 */
export interface ManuscriptTemplate {
  id: string;
  /** Short label shown in menus. */
  label: string;
  /** One-line description for tooltips. */
  description: string;
  /** Suggested filename (no extension) when saving. */
  defaultBasename: string;
  /** Markdown content. */
  content: string;
}

const FRONT_MATTER = (extra: string[] = []): string =>
  ['---', 'title: ', 'author: ', 'date: ', 'journal: ', ...extra, '---', '', '[toc]', '', ''].join('\n');

export const MANUSCRIPT_TEMPLATES: ManuscriptTemplate[] = [
  {
    id: 'imrad',
    label: 'IMRaD article',
    description:
      'Generic Introduction–Methods–Results–Discussion structure used by most clinical journals.',
    defaultBasename: 'imrad-manuscript',
    content:
      FRONT_MATTER(['keywords: ', 'subject: ']) +
      `# Abstract

**Background.**

**Methods.**

**Results.**

**Conclusions.**

# Introduction

# Methods

## Study design

## Participants

## Outcomes

## Statistical analysis

# Results

# Discussion

# References
`,
  },
  {
    id: 'consort',
    label: 'CONSORT (RCT)',
    description: 'Randomised controlled trial structure following the CONSORT 2010 checklist.',
    defaultBasename: 'consort-rct',
    content:
      FRONT_MATTER([
        'study-type: randomized controlled trial',
        'registration: ClinicalTrials.gov NCT',
      ]) +
      `# Abstract (structured)

**Background.**

**Methods.**

**Results.**

**Conclusions.**

**Trial registration.**

# Introduction

## Background and rationale

## Objectives

# Methods

## Trial design

## Participants

### Eligibility criteria

### Settings and locations

## Interventions

## Outcomes

### Primary outcome

### Secondary outcomes

## Sample size

## Randomisation

### Sequence generation

### Allocation concealment

### Implementation

## Blinding

## Statistical methods

# Results

## Participant flow

> CONSORT diagram (to be inserted as a Mermaid block).

## Recruitment

## Baseline data

## Numbers analysed

## Outcomes and estimation

## Ancillary analyses

## Harms

# Discussion

## Limitations

## Generalisability

## Interpretation

# Other information

## Funding

## Trial registration

## Protocol availability

# References
`,
  },
  {
    id: 'prisma',
    label: 'PRISMA (systematic review)',
    description:
      'Systematic review and meta-analysis structure following PRISMA 2020 guidance.',
    defaultBasename: 'prisma-review',
    content:
      FRONT_MATTER([
        'study-type: systematic review',
        'registration: PROSPERO CRD',
      ]) +
      `# Abstract (structured)

**Background.**

**Methods.**

**Results.**

**Discussion.**

**Other.**

# Introduction

## Rationale

## Objectives

# Methods

## Eligibility criteria

## Information sources

## Search strategy

## Selection process

## Data collection process

## Data items

## Study risk of bias assessment

## Effect measures

## Synthesis methods

## Reporting bias assessment

## Certainty assessment

# Results

## Study selection

> PRISMA flow diagram (to be inserted as a Mermaid block).

## Study characteristics

## Risk of bias in studies

## Results of individual studies

## Results of syntheses

## Reporting biases

## Certainty of evidence

# Discussion

## Summary of evidence

## Strengths and limitations

## Implications

# Other information

## Registration and protocol

## Support

## Competing interests

## Availability of data, code, and other materials

# References
`,
  },
  {
    id: 'case-report',
    label: 'Case report (CARE)',
    description: 'Single-patient case report following the CARE 2017 checklist.',
    defaultBasename: 'case-report',
    content:
      FRONT_MATTER(['study-type: case report']) +
      `# Abstract

**Introduction.**

**Patient presentation.**

**Diagnoses, interventions, outcomes.**

**Conclusion.**

# Introduction

# Patient information

## Demographic information

## Main concerns and symptoms

## Medical, family, and psychosocial history

## Genetic information (where relevant)

## Previous interventions and their outcomes

# Clinical findings

# Timeline

# Diagnostic assessment

## Diagnostic methods

## Diagnostic challenges

## Diagnostic reasoning

## Prognostic characteristics

# Therapeutic intervention

## Types of intervention

## Administration

## Changes during the course

# Follow-up and outcomes

## Clinician-assessed outcomes

## Important follow-up findings

## Adverse and unanticipated events

# Discussion

## Strengths and limitations

## Discussion of relevant medical literature

## Rationale and main lessons

# Patient perspective

# Informed consent
`,
  },
  {
    id: 'cohort',
    label: 'Cohort / observational (STROBE)',
    description: 'Observational study (cohort, case-control, cross-sectional) per STROBE.',
    defaultBasename: 'cohort-strobe',
    content:
      FRONT_MATTER(['study-type: cohort study']) +
      `# Abstract

**Background.**

**Methods.**

**Results.**

**Conclusions.**

# Introduction

## Background and rationale

## Objectives

# Methods

## Study design

## Setting

## Participants

## Variables

## Data sources / measurement

## Bias

## Study size

## Quantitative variables

## Statistical methods

# Results

## Participants

## Descriptive data

## Outcome data

## Main results

## Other analyses

# Discussion

## Key results

## Limitations

## Interpretation

## Generalisability

# Other information

## Funding

# References
`,
  },
  {
    id: 'cross-sectional',
    label: 'Cross-sectional / survey (STROBE)',
    description: 'Cross-sectional or survey study following the STROBE checklist.',
    defaultBasename: 'cross-sectional-survey',
    content:
      FRONT_MATTER(['study-type: cross-sectional']) +
      `# Abstract

**Background.**

**Methods.**

**Results.**

**Conclusions.**

# Introduction

# Methods

## Study design

## Setting and timing

## Participants

### Eligibility

### Sampling

## Survey instrument / measurements

## Outcomes and exposures

## Statistical analysis

# Results

## Response rate and participant flow

## Sample characteristics

## Main findings

# Discussion

## Limitations

## Comparison with prior literature

## Implications

# References
`,
  },
];

export function findTemplate(id: string): ManuscriptTemplate | undefined {
  return MANUSCRIPT_TEMPLATES.find((t) => t.id === id);
}
