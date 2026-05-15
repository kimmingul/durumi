import { useEffect, useRef, useState } from 'react';
import { useLanguage, t, resolveRendererLang } from '../i18n/t';
import { usePreferences } from '../hooks/usePreferences';
import { useAppStore } from '../store/appStore';
import { useMemoSidecarStore } from '../store/memoSidecarStore';
import { AiUsageDashboard } from './AiUsageDashboard';
import {
  DEFAULT_PRESET_ID,
  JOURNAL_PRESETS,
  PRESET_IDS,
  STYLE_ENTRIES,
  cloneStyleSet,
  type JournalPresetId,
  type StyleEntryId,
  type StyleSet,
  type StyleSpec,
} from '../styles/journalPresets';
import { applyStyleSet } from '../styles/applyStyles';
import type { AiKeyStatus, Preferences } from '@shared/ipc-contract';

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called when the user clicks "Install…" next to "Pandoc not found". The
   * parent should open the existing PandocInstallDialog.
   */
  onRequestPandocInstall?: () => void;
}

interface PandocStatus {
  state: 'loading' | 'ok' | 'missing';
  binary?: string;
  version?: string;
}

const PANDOC_HELP_URL = 'https://pandoc.org/installing.html';

const SPELL_CHECK_LANGS: Array<{ code: string; label: string; note?: 'ko' }> = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-CA', label: 'English (CA)' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'es-ES', label: 'Español' },
  { code: 'ko-KR', label: '한국어', note: 'ko' },
];

export function SettingsDialog(props: SettingsDialogProps) {
  const { open, onClose, onRequestPandocInstall } = props;
  const { prefs, update } = usePreferences();
  const { setLang } = useLanguage();
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const [pandocStatus, setPandocStatus] = useState<PandocStatus>({ state: 'loading' });
  const [newWord, setNewWord] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Re-detect pandoc whenever the dialog opens or the override path changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPandocStatus({ state: 'loading' });
    void window.api.pandocDetect().then((info) => {
      if (cancelled) return;
      if (!info) {
        setPandocStatus({ state: 'missing' });
      } else {
        setPandocStatus({ state: 'ok', binary: info.binary, version: info.version });
      }
    }).catch(() => {
      if (!cancelled) setPandocStatus({ state: 'missing' });
    });
    return () => {
      cancelled = true;
    };
  }, [open, prefs?.pandocPath]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;
  if (!prefs) {
    return (
      <div style={backdropStyle} data-testid="settings-backdrop">
        <div style={cardStyle} data-testid="settings-dialog" role="dialog" aria-modal="true">
          <p style={{ margin: 0 }}>…</p>
        </div>
      </div>
    );
  }

  async function pickAndSetPandocPath() {
    const picked = await window.api.pandocPickCustomPath();
    if (!picked) return;
    const info = await window.api.pandocSetCustomPath(picked);
    // pandocSetCustomPath persists the override on the main side; mirror locally.
    await update({ pandocPath: picked });
    if (info) {
      setPandocStatus({ state: 'ok', binary: info.binary, version: info.version });
    } else {
      setPandocStatus({ state: 'missing' });
    }
  }

  async function clearPandocPath() {
    await window.api.pandocSetCustomPath('');
    await update({ pandocPath: null });
  }

  async function pickDocxStyle() {
    const picked = await window.api.dialogPickFile({
      title: 'Select Word style reference',
      filters: [{ name: 'Word', extensions: ['docx'] }],
    });
    if (!picked) return;
    await update({ docxStyleReference: picked });
  }

  async function pickLatexTemplate() {
    const picked = await window.api.dialogPickFile({
      title: 'Select LaTeX template',
      filters: [
        { name: 'LaTeX', extensions: ['tex', 'latex'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!picked) return;
    await update({ latexTemplate: picked });
  }

  async function toggleSpellLang(code: string) {
    const cur = prefs?.spellCheckLanguages ?? [];
    const next = cur.includes(code)
      ? cur.filter((c) => c !== code)
      : [...cur, code];
    await update({ spellCheckLanguages: next });
  }

  async function addCustomWord() {
    const w = newWord.trim();
    if (!w) return;
    const cur = prefs?.spellCheckCustomWords ?? [];
    if (cur.includes(w)) {
      setNewWord('');
      return;
    }
    await update({ spellCheckCustomWords: [...cur, w] });
    setNewWord('');
  }

  async function removeCustomWord(w: string) {
    const cur = prefs?.spellCheckCustomWords ?? [];
    await update({ spellCheckCustomWords: cur.filter((x) => x !== w) });
  }

  async function setTheme(theme: 'system' | 'light' | 'dark') {
    setThemePreference(theme);
    await update({ theme });
  }

  async function setLanguage(language: 'system' | 'en' | 'ko') {
    await update({ language });
    setLang(resolveRendererLang(language));
  }

  return (
    <div
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="settings-backdrop"
    >
      <div
        ref={dialogRef}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 id="settings-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t('settings.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="settings-close"
            aria-label={t('settings.close')}
            style={closeButtonStyle}
          >
            ×
          </button>
        </header>

        <div style={bodyStyle}>
          <Section heading={t('settings.appearance')}>
            <Field label={t('settings.theme')}>
              <RadioGroup
                name="theme"
                value={prefs.theme}
                options={[
                  { value: 'system', label: t('settings.theme.system') },
                  { value: 'light', label: t('settings.theme.light') },
                  { value: 'dark', label: t('settings.theme.dark') },
                ]}
                onChange={(v) => { void setTheme(v as 'system' | 'light' | 'dark'); }}
                testId="theme"
              />
            </Field>
            <Field label={t('settings.language')}>
              <RadioGroup
                name="language"
                value={prefs.language}
                options={[
                  { value: 'system', label: t('settings.language.system') },
                  { value: 'en', label: t('settings.language.en') },
                  { value: 'ko', label: t('settings.language.ko') },
                ]}
                onChange={(v) => { void setLanguage(v as 'system' | 'en' | 'ko'); }}
                testId="language"
              />
            </Field>
          </Section>

          <Section heading={t('settings.styles')}>
            <StylesSection prefs={prefs} update={update} />
          </Section>

          <Section heading={t('settings.export')}>
            <Field label={t('settings.pandoc')}>
              <div style={pathRowStyle}>
                <input
                  type="text"
                  data-testid="settings-pandoc-path"
                  value={prefs.pandocPath ?? ''}
                  onChange={(e) => { void update({ pandocPath: e.target.value || null }); }}
                  placeholder={t('settings.pandoc.placeholder')}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => { void pickAndSetPandocPath(); }}
                  data-testid="settings-pandoc-browse"
                  style={baseButton}
                >
                  {t('settings.browse')}
                </button>
                {prefs.pandocPath && (
                  <button
                    type="button"
                    onClick={() => { void clearPandocPath(); }}
                    data-testid="settings-pandoc-clear"
                    style={baseButton}
                  >
                    {t('settings.clear')}
                  </button>
                )}
              </div>
              <PandocStatusLine
                status={pandocStatus}
                onRequestInstall={onRequestPandocInstall}
              />
            </Field>

            <Field label={t('settings.docxStyle')}>
              <FilePathRow
                value={prefs.docxStyleReference}
                onPick={pickDocxStyle}
                onClear={async () => { await update({ docxStyleReference: null }); }}
                onChange={async (v) => { await update({ docxStyleReference: v || null }); }}
                placeholder={t('settings.docxStyle.placeholder')}
                testId="docx-style"
              />
            </Field>

            <Field label={t('settings.latexTemplate')}>
              <FilePathRow
                value={prefs.latexTemplate}
                onPick={pickLatexTemplate}
                onClear={async () => { await update({ latexTemplate: null }); }}
                onChange={async (v) => { await update({ latexTemplate: v || null }); }}
                placeholder={t('settings.latexTemplate.placeholder')}
                testId="latex-template"
              />
            </Field>

            <Field label={t('settings.export.includeComments')}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  data-testid="settings-include-comments"
                  checked={prefs.exportIncludeComments}
                  onChange={(e) => { void update({ exportIncludeComments: e.target.checked }); }}
                />
                <span style={{ fontSize: 12, color: 'var(--muted-fg, var(--fg))' }}>
                  {t('settings.export.includeComments.help')}
                </span>
              </label>
            </Field>

            <Field label={t('settings.export.preserveAnnotations')}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  data-testid="settings-preserve-annotations"
                  checked={prefs.exportPreserveAnnotations}
                  onChange={(e) => { void update({ exportPreserveAnnotations: e.target.checked }); }}
                />
                <span style={{ fontSize: 12, color: 'var(--muted-fg, var(--fg))' }}>
                  {t('settings.export.preserveAnnotations.help')}
                </span>
              </label>
            </Field>
          </Section>

          <Section heading={t('settings.author')}>
            <Field label={t('settings.author.name')}>
              <input
                type="text"
                data-testid="settings-author-name"
                value={prefs.author?.name ?? ''}
                onChange={(e) => {
                  const next = e.target.value;
                  // Mirror into the in-memory sidecar store so newly created
                  // replies pick up the new author without waiting for a reload.
                  useMemoSidecarStore.getState().setAuthor(next);
                  void update({ author: { name: next } });
                }}
                placeholder={t('settings.author.help')}
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
                {t('settings.author.help')}
              </p>
            </Field>
          </Section>

          <Section heading={t('settings.ai')}>
            <AiSection prefs={prefs} update={update} />
          </Section>

          <Section heading={t('settings.aiUsage')}>
            <AiUsageDashboard />
          </Section>

          <Section heading={t('settings.bibliography')}>
            <Field label={t('settings.bibliography.email')}>
              <input
                type="email"
                data-testid="settings-bib-email"
                value={prefs.bibliography?.email ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  void update({
                    bibliography: {
                      ...prefs.bibliography,
                      email: v.length > 0 ? v : null,
                    },
                  });
                }}
                placeholder="you@example.org"
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
                {t('settings.bibliography.email.help')}
              </p>
            </Field>
            <Field label={t('settings.bibliography.ncbiKey')}>
              <input
                type="text"
                data-testid="settings-bib-ncbi-key"
                value={prefs.bibliography?.ncbiApiKey ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  void update({
                    bibliography: {
                      ...prefs.bibliography,
                      ncbiApiKey: v.length > 0 ? v : null,
                    },
                  });
                }}
                placeholder={t('settings.bibliography.ncbiKey.placeholder')}
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
                {t('settings.bibliography.ncbiKey.help')}
              </p>
            </Field>
            <Field label={t('settings.bibliography.orcid')}>
              <OrcidField
                value={prefs.bibliography?.orcidId ?? ''}
                onChange={(v) => {
                  void update({
                    bibliography: {
                      ...prefs.bibliography,
                      orcidId: v.length > 0 ? v : null,
                    },
                  });
                }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
                {t('settings.bibliography.orcid.help')}
              </p>
            </Field>
          </Section>

          <Section heading={t('settings.spellCheck')}>
            <Field label={t('settings.spellCheck.languages')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {SPELL_CHECK_LANGS.map((l) => {
                  const checked = prefs.spellCheckLanguages.includes(l.code);
                  return (
                    <label
                      key={l.code}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => { void toggleSpellLang(l.code); }}
                        data-testid={`settings-spell-${l.code}`}
                      />
                      <span>{l.label}</span>
                      {l.note === 'ko' && (
                        <span style={{ fontSize: 11, color: 'var(--muted-fg, #6a6a6a)' }}>
                          ({t('settings.spellCheck.koNote')})
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </Field>

            <Field label={t('settings.spellCheck.customWords')}>
              <div style={pathRowStyle}>
                <input
                  type="text"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addCustomWord();
                    }
                  }}
                  placeholder={t('settings.spellCheck.addWord')}
                  style={inputStyle}
                  data-testid="settings-spell-newword"
                />
                <button
                  type="button"
                  onClick={() => { void addCustomWord(); }}
                  data-testid="settings-spell-add"
                  style={baseButton}
                >
                  {t('settings.spellCheck.add')}
                </button>
              </div>
              {prefs.spellCheckCustomWords.length === 0 ? (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
                  {t('settings.spellCheck.empty')}
                </p>
              ) : (
                <ul style={wordListStyle} data-testid="settings-spell-words">
                  {prefs.spellCheckCustomWords.map((w) => (
                    <li key={w} style={wordItemStyle}>
                      <span>{w}</span>
                      <button
                        type="button"
                        onClick={() => { void removeCustomWord(w); }}
                        aria-label={`${t('settings.spellCheck.remove')} ${w}`}
                        style={{ ...baseButton, padding: '2px 8px', fontSize: 12 }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          </Section>
        </div>
      </div>
    </div>
  );
}

interface SectionProps { heading: string; children: React.ReactNode }
function Section({ heading, children }: SectionProps) {
  return (
    <section style={sectionStyle}>
      <h3 style={sectionHeadingStyle}>{heading}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </section>
  );
}

interface FieldProps { label: string; children: React.ReactNode }
function Field({ label, children }: FieldProps) {
  return (
    <div style={fieldStyle}>
      <label style={fieldLabelStyle}>{label}</label>
      <div>{children}</div>
    </div>
  );
}

interface RadioOption { value: string; label: string }
interface RadioGroupProps {
  name: string;
  value: string;
  options: RadioOption[];
  onChange: (v: string) => void;
  testId: string;
}
function RadioGroup({ name, value, options, onChange, testId }: RadioGroupProps) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            data-testid={`settings-${testId}-${o.value}`}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

interface FilePathRowProps {
  value: string | null;
  onPick: () => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onChange: (v: string) => void | Promise<void>;
  placeholder?: string;
  testId: string;
}
function FilePathRow({ value, onPick, onClear, onChange, placeholder, testId }: FilePathRowProps) {
  return (
    <div style={pathRowStyle}>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => { void onChange(e.target.value); }}
        placeholder={placeholder}
        style={inputStyle}
        data-testid={`settings-${testId}-input`}
      />
      <button
        type="button"
        onClick={() => { void onPick(); }}
        data-testid={`settings-${testId}-browse`}
        style={baseButton}
      >
        {t('settings.browse')}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => { void onClear(); }}
          data-testid={`settings-${testId}-clear`}
          style={baseButton}
        >
          {t('settings.clear')}
        </button>
      )}
    </div>
  );
}

interface StylesSectionProps {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => Promise<void>;
}

const FONT_WEIGHTS: Array<{ value: number; label: string }> = [
  { value: 400, label: '400 — Regular' },
  { value: 500, label: '500 — Medium' },
  { value: 600, label: '600 — Semibold' },
  { value: 700, label: '700 — Bold' },
];

function StylesSection({ prefs, update }: StylesSectionProps) {
  // Defensive: prefs.editor may be partial during the first render of a test
  // harness that injects a stub. Production prefs always carry every field
  // thanks to mergeDefaults().
  const editor = prefs.editor;
  const activePreset: string | null = editor?.activePreset ?? null;
  const styles: StyleSet = editor?.styles ?? cloneStyleSet(JOURNAL_PRESETS[DEFAULT_PRESET_ID].styles);

  async function applyPatch(nextStyles: StyleSet, nextPreset: string | null) {
    // Inject the new variables immediately so the editor reflects the change
    // before the IPC round-trip completes — keeps the dropdown feel snappy.
    applyStyleSet(nextStyles);
    await update({
      editor: {
        ...editor,
        // Preserve defaultMode if present (Phase 1 contract).
        defaultMode: editor?.defaultMode ?? 'wysiwyg',
        activePreset: nextPreset,
        styles: nextStyles,
      },
    });
  }

  async function onPresetChange(id: string) {
    if (!(id in JOURNAL_PRESETS)) return;
    const preset = JOURNAL_PRESETS[id as JournalPresetId];
    await applyPatch(cloneStyleSet(preset.styles), preset.id);
  }

  async function onSpecChange(entry: StyleEntryId, patch: Partial<StyleSpec>) {
    const next: StyleSet = {
      ...styles,
      [entry]: { ...styles[entry], ...patch },
    };
    // Editing a single field detaches the StyleSet from the named preset.
    await applyPatch(next, null);
  }

  async function onReset() {
    const preset = JOURNAL_PRESETS[DEFAULT_PRESET_ID];
    await applyPatch(cloneStyleSet(preset.styles), preset.id);
  }

  return (
    <>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
        {t('settings.styles.intro')}
      </p>
      <Field label={t('settings.styles.preset.label')}>
        <div style={pathRowStyle}>
          <select
            value={activePreset ?? ''}
            onChange={(e) => { void onPresetChange(e.target.value); }}
            style={inputStyle}
            data-testid="settings-styles-preset"
          >
            {activePreset === null && (
              <option value="" disabled>
                {t('settings.styles.preset.custom')}
              </option>
            )}
            {PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {t(`settings.styles.preset.${JOURNAL_PRESETS[id].i18nKey}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { void onReset(); }}
            style={baseButton}
            data-testid="settings-styles-reset"
          >
            {t('settings.styles.reset')}
          </button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted-fg, #6a6a6a)' }}>
          {t('settings.styles.disclaimer')}
        </p>
      </Field>

      {STYLE_ENTRIES.map((entry) => (
        <StyleEntryRow
          key={entry}
          entry={entry}
          spec={styles[entry]}
          onChange={(patch) => { void onSpecChange(entry, patch); }}
        />
      ))}

      <Field label={t('settings.styles.tableFormat')}>
        <select
          data-testid="settings-table-style-format"
          value={editor?.tableStyleFormat ?? 'pandoc'}
          onChange={(e) => {
            const next = e.target.value === 'html' ? 'html' : 'pandoc';
            // Cache for the popover default + persist.
            try {
              (window as { __durumiTableStyleFormat?: 'pandoc' | 'html' }).__durumiTableStyleFormat =
                next;
            } catch {
              // ignore
            }
            void update({
              editor: {
                ...editor,
                defaultMode: editor?.defaultMode ?? 'wysiwyg',
                activePreset: editor?.activePreset ?? DEFAULT_PRESET_ID,
                styles: editor?.styles ?? cloneStyleSet(JOURNAL_PRESETS[DEFAULT_PRESET_ID].styles),
                tableStyleFormat: next,
              },
            });
          }}
          style={inputStyle}
        >
          <option value="pandoc">{t('table.style.format.pandoc')}</option>
          <option value="html">{t('table.style.format.html')}</option>
        </select>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
          {t('settings.styles.tableFormat.help')}
        </p>
      </Field>
    </>
  );
}

interface StyleEntryRowProps {
  entry: StyleEntryId;
  spec: StyleSpec;
  onChange: (patch: Partial<StyleSpec>) => void;
}

function StyleEntryRow({ entry, spec, onChange }: StyleEntryRowProps) {
  return (
    <div
      style={styleEntryStyle}
      data-testid={`settings-styles-entry-${entry}`}
    >
      <div style={styleEntryHeaderStyle}>
        <span style={fieldLabelStyle}>{t(`settings.styles.entry.${entry}`)}</span>
      </div>
      <div style={styleEntryGridStyle}>
        <label style={styleEntryFieldStyle}>
          <span style={styleEntrySublabelStyle}>{t('settings.styles.field.fontFamily')}</span>
          <input
            type="text"
            value={spec.fontFamily}
            onChange={(e) => onChange({ fontFamily: e.target.value })}
            style={inputStyle}
            data-testid={`settings-styles-${entry}-font`}
          />
        </label>
        <label style={styleEntryFieldStyle}>
          <span style={styleEntrySublabelStyle}>{t('settings.styles.field.fontSize')}</span>
          <input
            type="number"
            min={8}
            max={96}
            step={1}
            value={spec.fontSizePx}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange({ fontSizePx: n });
            }}
            style={inputStyle}
            data-testid={`settings-styles-${entry}-size`}
          />
        </label>
        <label style={styleEntryFieldStyle}>
          <span style={styleEntrySublabelStyle}>{t('settings.styles.field.fontWeight')}</span>
          <select
            value={spec.fontWeight}
            onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}
            style={inputStyle}
            data-testid={`settings-styles-${entry}-weight`}
          >
            {FONT_WEIGHTS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </label>
        <label style={styleEntryFieldStyle}>
          <span style={styleEntrySublabelStyle}>{t('settings.styles.field.lineHeight')}</span>
          <input
            type="number"
            min={1}
            max={4}
            step={0.05}
            value={spec.lineHeight}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange({ lineHeight: n });
            }}
            style={inputStyle}
            data-testid={`settings-styles-${entry}-lh`}
          />
        </label>
        <label style={{ ...styleEntryFieldStyle, gridColumn: '1 / -1' }}>
          <span style={styleEntrySublabelStyle}>{t('settings.styles.field.color')}</span>
          <div style={pathRowStyle}>
            <input
              type="color"
              value={spec.color ?? '#000000'}
              onChange={(e) => onChange({ color: e.target.value })}
              data-testid={`settings-styles-${entry}-color`}
              style={{ padding: 0, width: 36, height: 28, border: '1px solid var(--border, #c8c8c8)', background: 'transparent' }}
            />
            <button
              type="button"
              onClick={() => onChange({ color: null })}
              style={baseButton}
              data-testid={`settings-styles-${entry}-color-clear`}
              disabled={spec.color === null}
            >
              {t('settings.styles.color.inherit')}
            </button>
          </div>
        </label>
      </div>
    </div>
  );
}

interface AiSectionProps {
  prefs: import('@shared/ipc-contract').Preferences;
  update: (patch: Partial<import('@shared/ipc-contract').Preferences>) => Promise<void>;
}

interface AiVerifyState {
  state: 'idle' | 'verifying' | 'ok' | 'error';
  model?: string;
  message?: string;
}

const ANTHROPIC_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
] as const;

function AiSection({ prefs, update }: AiSectionProps) {
  // Defensive default for tests / partial-prefs scenarios — production
  // prefs always carry `ai` thanks to mergeDefaults in preferences.ts.
  const ai = prefs.ai ?? {
    provider: 'anthropic' as const,
    anthropicKey: '',
    anthropicModel: 'claude-sonnet-4-6',
    openaiKey: '',
    openaiBaseUrl: 'https://api.openai.com',
    openaiModel: 'gpt-4o-mini',
    ghostTextEnabled: false,
    ghostTextIdleMs: 800,
    ghostTextSessionCap: 100,
  };
  const [anthropicInput, setAnthropicInput] = useState('');
  const [openaiInput, setOpenaiInput] = useState('');
  const [anthropicKeyStatus, setAnthropicKeyStatus] = useState<AiKeyStatus>('none');
  const [openaiKeyStatus, setOpenaiKeyStatus] = useState<AiKeyStatus>('none');
  // `null` while the renderer is still asking the main process; treated as
  // "encryption available" by the UI so the warning doesn't flash on every
  // settings open before the answer arrives.
  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<AiVerifyState>({ state: 'idle' });

  // Refresh how each provider's key is stored. Plaintext is never sent to
  // the renderer; the status enum says encrypted vs plaintext vs none.
  useEffect(() => {
    if (typeof window.api?.aiKeyStatus === 'function') {
      void window.api.aiKeyStatus('anthropic').then(setAnthropicKeyStatus);
      void window.api.aiKeyStatus('openai-compatible').then(setOpenaiKeyStatus);
    }
    if (typeof window.api?.aiEncryptionAvailable === 'function') {
      void window.api.aiEncryptionAvailable().then(setEncryptionAvailable);
    }
  }, [ai.anthropicKey, ai.openaiKey]);

  async function saveAnthropicKey() {
    if (!anthropicInput) return;
    const r = await window.api.aiSetApiKey('anthropic', anthropicInput);
    if (r.ok) {
      setAnthropicInput('');
      setAnthropicKeyStatus(r.status);
      setStatus({ state: 'idle' });
    }
  }
  async function clearAnthropicKey() {
    await window.api.aiSetApiKey('anthropic', '');
    setAnthropicKeyStatus('none');
    setStatus({ state: 'idle' });
  }
  async function saveOpenaiKey() {
    if (!openaiInput) return;
    const r = await window.api.aiSetApiKey('openai-compatible', openaiInput);
    if (r.ok) {
      setOpenaiInput('');
      setOpenaiKeyStatus(r.status);
      setStatus({ state: 'idle' });
    }
  }
  async function clearOpenaiKey() {
    await window.api.aiSetApiKey('openai-compatible', '');
    setOpenaiKeyStatus('none');
    setStatus({ state: 'idle' });
  }

  const hasAnthropicKey = anthropicKeyStatus !== 'none';
  const hasOpenaiKey = openaiKeyStatus !== 'none';
  const willStorePlaintext = encryptionAvailable === false;
  const saveLabel = willStorePlaintext
    ? t('settings.ai.key.savePlaintext')
    : t('settings.ai.key.save');

  function KeyStatusBadge({ keyStatus, testId }: { keyStatus: AiKeyStatus; testId: string }) {
    if (keyStatus === 'none') return null;
    const isEncrypted = keyStatus === 'encrypted';
    return (
      <p
        data-testid={testId}
        style={{
          margin: '4px 0 0',
          fontSize: 12,
          color: isEncrypted
            ? 'var(--cm-ok-fg, #1f6a3a)'
            : 'var(--cm-warn-fg, #8a5a17)',
        }}
      >
        {isEncrypted ? '🔒 ' : '🔓 '}
        {t(isEncrypted ? 'settings.ai.key.encrypted' : 'settings.ai.key.plaintext')}
      </p>
    );
  }

  const plaintextWarning = willStorePlaintext ? (
    <p
      data-testid="ai-plaintext-warning"
      style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--cm-warn-fg, #8a5a17)' }}
    >
      ⚠️ {t('settings.ai.key.noKeychain')}
    </p>
  ) : null;

  async function verify() {
    setStatus({ state: 'verifying' });
    const r = await window.api.aiVerify();
    if (r.ok) {
      setStatus({ state: 'ok', model: r.model });
    } else {
      setStatus({ state: 'error', message: r.message });
    }
  }

  return (
    <>
      <Field label={t('settings.ai.provider')}>
        <RadioGroup
          name="ai-provider"
          value={ai.provider}
          options={[
            { value: 'anthropic', label: 'Anthropic (Claude)' },
            { value: 'openai-compatible', label: 'OpenAI / Compatible' },
          ]}
          onChange={(v) => {
            void update({
              ai: { ...ai, provider: v as 'anthropic' | 'openai-compatible' },
            });
            setStatus({ state: 'idle' });
          }}
          testId="ai-provider"
        />
      </Field>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--cm-warn-fg, #8a5a17)' }}>
        ⚠️ {t('settings.ai.privacy')}
      </p>

      {ai.provider === 'anthropic' ? (
        <>
          <Field label={t('settings.ai.anthropic.key')}>
            {plaintextWarning}
            <div style={pathRowStyle}>
              <input
                type="password"
                value={anthropicInput}
                onChange={(e) => setAnthropicInput(e.target.value)}
                placeholder={hasAnthropicKey ? t('settings.ai.key.saved') : 'sk-ant-...'}
                style={inputStyle}
                data-testid="ai-anthropic-key"
              />
              <button
                type="button"
                onClick={() => { void saveAnthropicKey(); }}
                disabled={!anthropicInput}
                style={baseButton}
                data-testid="ai-anthropic-save"
              >{saveLabel}</button>
              {hasAnthropicKey && (
                <button
                  type="button"
                  onClick={() => { void clearAnthropicKey(); }}
                  style={baseButton}
                  data-testid="ai-anthropic-clear"
                >{t('settings.clear')}</button>
              )}
            </div>
            <KeyStatusBadge keyStatus={anthropicKeyStatus} testId="ai-anthropic-key-status" />
          </Field>
          <Field label={t('settings.ai.model')}>
            <select
              value={ai.anthropicModel}
              onChange={(e) => { void update({ ai: { ...ai, anthropicModel: e.target.value } }); }}
              style={inputStyle}
              data-testid="ai-anthropic-model"
            >
              {ANTHROPIC_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field label={t('settings.ai.openai.baseUrl')}>
            <input
              type="text"
              value={ai.openaiBaseUrl}
              onChange={(e) => { void update({ ai: { ...ai, openaiBaseUrl: e.target.value } }); }}
              placeholder="https://api.openai.com or http://localhost:11434"
              style={inputStyle}
              data-testid="ai-openai-baseurl"
            />
          </Field>
          <Field label={t('settings.ai.openai.key')}>
            {plaintextWarning}
            <div style={pathRowStyle}>
              <input
                type="password"
                value={openaiInput}
                onChange={(e) => setOpenaiInput(e.target.value)}
                placeholder={hasOpenaiKey ? t('settings.ai.key.saved') : t('settings.ai.openai.key.placeholder')}
                style={inputStyle}
                data-testid="ai-openai-key"
              />
              <button
                type="button"
                onClick={() => { void saveOpenaiKey(); }}
                disabled={!openaiInput}
                style={baseButton}
                data-testid="ai-openai-save"
              >{saveLabel}</button>
              {hasOpenaiKey && (
                <button
                  type="button"
                  onClick={() => { void clearOpenaiKey(); }}
                  style={baseButton}
                >{t('settings.clear')}</button>
              )}
            </div>
            <KeyStatusBadge keyStatus={openaiKeyStatus} testId="ai-openai-key-status" />
          </Field>
          <Field label={t('settings.ai.model')}>
            <input
              type="text"
              value={ai.openaiModel}
              onChange={(e) => { void update({ ai: { ...ai, openaiModel: e.target.value } }); }}
              placeholder="gpt-4o-mini, llama3, ..."
              style={inputStyle}
              data-testid="ai-openai-model"
            />
          </Field>
        </>
      )}
      <Field label={t('settings.ai.ghostText')}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            data-testid="settings-ai-ghost-text"
            checked={ai.ghostTextEnabled}
            onChange={(e) => {
              void update({ ai: { ...ai, ghostTextEnabled: e.target.checked } });
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--muted-fg, #6a6a6a)' }}>
            {t('settings.ai.ghostText.help')}
          </span>
        </label>
      </Field>
      <Field label={t('settings.ai.verify.label')}>
        <div style={pathRowStyle}>
          <button
            type="button"
            onClick={() => { void verify(); }}
            disabled={status.state === 'verifying'}
            style={baseButton}
            data-testid="ai-verify"
          >
            {status.state === 'verifying' ? t('settings.ai.verify.running') : t('settings.ai.verify.run')}
          </button>
          {status.state === 'ok' && (
            <span style={{ fontSize: 12, color: 'var(--cm-success-fg, #1d6f3a)' }} data-testid="ai-verify-ok">
              ✓ {status.model}
            </span>
          )}
          {status.state === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--cm-error-fg, #8a1f17)' }} data-testid="ai-verify-error">
              ✗ {status.message}
            </span>
          )}
        </div>
      </Field>
    </>
  );
}

interface OrcidStatus {
  state: 'idle' | 'verifying' | 'ok' | 'error';
  name?: string;
  affiliation?: string | null;
  worksCount?: number;
  message?: string;
}

function OrcidField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [status, setStatus] = useState<OrcidStatus>({ state: 'idle' });

  async function verify() {
    if (!value.trim()) return;
    setStatus({ state: 'verifying' });
    const r = await window.api.bibliographyResolveOrcid(value.trim());
    if (r.ok) {
      setStatus({
        state: 'ok',
        name: r.profile.name,
        affiliation: r.profile.affiliation,
        worksCount: r.profile.worksCount,
      });
    } else {
      setStatus({
        state: 'error',
        message:
          r.code === 'not-found'
            ? t('settings.bibliography.orcid.error.notFound')
            : r.code === 'parse'
              ? t('settings.bibliography.orcid.error.parse')
              : r.message,
      });
    }
  }

  return (
    <>
      <div style={pathRowStyle}>
        <input
          type="text"
          data-testid="settings-bib-orcid"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // Clear stale verification when the user edits the field.
            if (status.state !== 'idle') setStatus({ state: 'idle' });
          }}
          placeholder="0000-0002-1825-0097"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => { void verify(); }}
          disabled={!value.trim() || status.state === 'verifying'}
          data-testid="settings-bib-orcid-verify"
          style={baseButton}
        >
          {status.state === 'verifying'
            ? t('settings.bibliography.orcid.verifying')
            : t('settings.bibliography.orcid.verify')}
        </button>
      </div>
      {status.state === 'ok' && (
        <p
          style={{ ...statusLineStyle, color: 'var(--cm-success-fg, #1d6f3a)' }}
          data-testid="settings-bib-orcid-ok"
        >
          ✓ {status.name ?? '—'}
          {status.affiliation ? ` · ${status.affiliation}` : ''}
          {typeof status.worksCount === 'number' && status.worksCount > 0
            ? ` · ${status.worksCount} ${t('settings.bibliography.orcid.works')}`
            : ''}
        </p>
      )}
      {status.state === 'error' && (
        <p
          style={{ ...statusLineStyle, color: 'var(--cm-error-fg, #8a1f17)' }}
          data-testid="settings-bib-orcid-error"
        >
          ✗ {status.message}
        </p>
      )}
    </>
  );
}

function PandocStatusLine({
  status,
  onRequestInstall,
}: {
  status: PandocStatus;
  onRequestInstall?: () => void;
}) {
  if (status.state === 'loading') {
    return (
      <p style={statusLineStyle} data-testid="settings-pandoc-status">…</p>
    );
  }
  if (status.state === 'ok') {
    return (
      <p
        style={{ ...statusLineStyle, color: 'var(--cm-success-fg, #1d6f3a)' }}
        data-testid="settings-pandoc-status-ok"
      >
        ✓ {t('settings.pandoc.detected', {
          info: `${status.binary ?? 'pandoc'} ${status.version ?? ''}`.trim(),
        })}
      </p>
    );
  }
  return (
    <p
      style={{ ...statusLineStyle, color: 'var(--cm-error-fg, #8a1f17)' }}
      data-testid="settings-pandoc-status-missing"
    >
      ✗ {t('settings.pandoc.notFound')}{' '}
      {onRequestInstall ? (
        <button
          type="button"
          onClick={onRequestInstall}
          data-testid="settings-pandoc-install"
          style={linkButtonStyle}
        >
          {t('settings.pandoc.install')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => { void window.api.shellOpenExternal(PANDOC_HELP_URL); }}
          data-testid="settings-pandoc-help"
          style={linkButtonStyle}
        >
          {t('settings.pandoc.help')}
        </button>
      )}
    </p>
  );
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  zIndex: 9000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg, #fff)',
  color: 'var(--fg, #111)',
  borderRadius: 8,
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
  width: 'min(640px, 92vw)',
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 14,
  lineHeight: 1.5,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '1px solid var(--border, #e2e2e2)',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  color: 'inherit',
  padding: '0 4px',
};

const bodyStyle: React.CSSProperties = {
  padding: '8px 18px 18px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const sectionHeadingStyle: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--muted-fg, #6a6a6a)',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
};

const pathRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--bg, #fff)',
  color: 'inherit',
  fontSize: 13,
  fontFamily: 'inherit',
  minWidth: 0,
};

const baseButton: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 4,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--code-bg, #f5f5f5)',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
  whiteSpace: 'nowrap',
};

const linkButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  color: 'var(--accent, #4a90e2)',
  textDecoration: 'underline',
  font: 'inherit',
};

const statusLineStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12,
};

const wordListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: '6px 0 0',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  maxHeight: 160,
  overflowY: 'auto',
};

const wordItemStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 6px 3px 8px',
  borderRadius: 12,
  border: '1px solid var(--border, #c8c8c8)',
  background: 'var(--code-bg, #f5f5f5)',
  fontSize: 12,
};

const styleEntryStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '8px 10px',
  border: '1px solid var(--border, #e2e2e2)',
  borderRadius: 6,
  background: 'var(--bg, #fff)',
};

const styleEntryHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const styleEntryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
};

const styleEntryFieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
};

const styleEntrySublabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted-fg, #6a6a6a)',
};
