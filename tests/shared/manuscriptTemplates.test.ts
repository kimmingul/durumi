import { describe, it, expect } from 'vitest';
import { MANUSCRIPT_TEMPLATES, findTemplate } from '../../shared/manuscriptTemplates';

describe('manuscript templates', () => {
  it('exposes the expected six templates', () => {
    expect(MANUSCRIPT_TEMPLATES.map((t) => t.id).sort()).toEqual(
      ['case-report', 'cohort', 'consort', 'cross-sectional', 'imrad', 'prisma'],
    );
  });

  it('every template starts with YAML front matter', () => {
    for (const tpl of MANUSCRIPT_TEMPLATES) {
      expect(tpl.content.startsWith('---\n')).toBe(true);
      expect(tpl.content).toMatch(/\n---\n/);
    }
  });

  it('every template includes a [toc] directive', () => {
    for (const tpl of MANUSCRIPT_TEMPLATES) {
      expect(tpl.content).toContain('[toc]');
    }
  });

  it('CONSORT template covers the major reporting sections', () => {
    const tpl = findTemplate('consort')!;
    for (const heading of ['Methods', 'Trial design', 'Randomisation', 'Statistical methods', 'Discussion']) {
      expect(tpl.content).toContain(heading);
    }
  });

  it('PRISMA template includes synthesis and risk-of-bias sections', () => {
    const tpl = findTemplate('prisma')!;
    expect(tpl.content).toContain('Synthesis methods');
    expect(tpl.content).toContain('Risk of bias in studies');
  });

  it('findTemplate returns undefined for an unknown id', () => {
    expect(findTemplate('does-not-exist')).toBeUndefined();
  });
});
