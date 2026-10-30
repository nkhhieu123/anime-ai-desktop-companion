import { useState } from 'react';
import { AI_LIMITS, type AiSettings, type ConnectionReport, type ResponseLanguage } from '@shared/ai';
import type { AiSettingsUpdate } from '@shared/ipc';
import { t } from '../i18n';

interface SettingsPanelProps {
  settings: AiSettings;
  report: ConnectionReport | null;
  checking: boolean;
  onUpdate(patch: Partial<AiSettings>): Promise<AiSettingsUpdate>;
  onCheck(): void;
  onClearConversation(): void;
  onBack(): void;
}

type NumericField = 'timeoutMs' | 'maxInputChars' | 'maxHistoryMessages';

function formatGb(bytes: number): string {
  return (bytes / 1_000_000_000).toFixed(1);
}

function connectionMessage(report: ConnectionReport): string {
  switch (report.status) {
    case 'ok':
      return t('settings.connected', { version: report.version });
    case 'unreachable':
      return t('settings.unreachable');
    case 'timeout':
      return t('settings.timeoutError');
    case 'bad-response':
      return t('settings.badResponse');
  }
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { settings, report, checking, onUpdate, onCheck, onClearConversation, onBack } = props;
  const [endpoint, setEndpoint] = useState(settings.endpoint);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmingClear, setConfirmingClear] = useState(false);

  const setFieldError = (field: string, message?: string) => {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return message ? { ...next, [field]: message } : next;
    });
  };

  const apply = async (field: string, patch: Partial<AiSettings>, invalidMessage: string): Promise<boolean> => {
    const result = await onUpdate(patch);
    if (result.ok) {
      setFieldError(field);
      return true;
    }
    setFieldError(field, result.field === field ? invalidMessage : t('settings.saveError'));
    return false;
  };

  const check = async () => {
    const saved = await apply('endpoint', { endpoint }, t('settings.invalidEndpoint'));
    if (saved) onCheck();
  };

  const installed = report?.status === 'ok' ? report.models : [];
  const modelMissing = report?.status === 'ok' && !!settings.model && !report.selectedModelInstalled;

  return (
    <section className="settings" aria-label={t('settings.title')}>
      <div className="settings-field">
        <label htmlFor="endpoint">{t('settings.endpoint')}</label>
        <input
          id="endpoint"
          type="text"
          spellCheck={false}
          value={endpoint}
          aria-invalid={!!errors.endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
        />
        {errors.endpoint && <p className="field-error">{errors.endpoint}</p>}
        <button type="button" className="secondary-button check-connection" disabled={checking} onClick={() => void check()}>
          {checking ? t('settings.checking') : t('settings.check')}
        </button>
        {report && !checking && (
          <p className={report.status === 'ok' ? 'field-ok' : 'field-error'} role="status">
            {connectionMessage(report)}
          </p>
        )}
      </div>

      <div className="settings-field">
        <label htmlFor="model-select">{t('settings.model')}</label>
        <select
          id="model-select"
          value={settings.model}
          onChange={(event) => void apply('model', { model: event.target.value }, t('settings.saveError'))}
        >
          <option value="">{t('settings.modelNone')}</option>
          {installed.map((model) => (
            <option key={model.name} value={model.name}>
              {model.sizeBytes === null
                ? model.name
                : t('settings.modelSize', { name: model.name, size: formatGb(model.sizeBytes) })}
            </option>
          ))}
          {settings.model && !installed.some((model) => model.name === settings.model) && (
            <option value={settings.model}>
              {/* Without a connection we cannot know whether it is downloaded. */}
              {report?.status === 'ok' ? t('settings.modelMissingOption', { model: settings.model }) : settings.model}
            </option>
          )}
        </select>
        {errors.model && <p className="field-error">{errors.model}</p>}
        {modelMissing && <p className="field-error model-missing">{t('settings.modelMissing', { model: settings.model })}</p>}
        {report?.status === 'ok' && installed.length === 0 && <p className="field-hint no-models">{t('settings.noModels')}</p>}
      </div>

      <div className="settings-field">
        <label htmlFor="response-language">{t('settings.responseLanguage')}</label>
        <select
          id="response-language"
          value={settings.responseLanguage}
          onChange={(event) =>
            void apply(
              'responseLanguage',
              { responseLanguage: event.target.value as ResponseLanguage },
              t('settings.saveError'),
            )
          }
        >
          <option value="auto">{t('settings.languageAuto')}</option>
          <option value="vi-VN">{t('settings.languageVi')}</option>
          <option value="en-US">{t('settings.languageEn')}</option>
        </select>
      </div>

      <NumberField
        id="timeout"
        label={t('settings.timeout')}
        field="timeoutMs"
        scale={1000}
        value={settings.timeoutMs}
        error={errors.timeoutMs}
        onApply={apply}
      />
      <NumberField
        id="max-input"
        label={t('settings.maxInput')}
        field="maxInputChars"
        value={settings.maxInputChars}
        error={errors.maxInputChars}
        onApply={apply}
      />
      <NumberField
        id="max-history"
        label={t('settings.maxHistory')}
        field="maxHistoryMessages"
        value={settings.maxHistoryMessages}
        error={errors.maxHistoryMessages}
        onApply={apply}
      />

      <div className="settings-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.persistConversations}
            onChange={(event) =>
              void apply('persistConversations', { persistConversations: event.target.checked }, t('settings.saveError'))
            }
          />
          {t('settings.persist')}
        </label>
        <p className="field-hint">{t('settings.persistHint')}</p>
        {errors.persistConversations && <p className="field-error">{errors.persistConversations}</p>}
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="secondary-button clear-conversation"
          onBlur={() => setConfirmingClear(false)}
          onClick={() => {
            if (!confirmingClear) return setConfirmingClear(true);
            setConfirmingClear(false);
            onClearConversation();
          }}
        >
          {confirmingClear ? t('settings.clearConfirm') : t('settings.clear')}
        </button>
        <button type="button" className="send-button settings-back" onClick={onBack}>
          {t('settings.back')}
        </button>
      </div>
    </section>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  field: NumericField;
  /** Stored value = displayed value × scale. */
  scale?: number;
  value: number;
  error: string | undefined;
  onApply(field: string, patch: Partial<AiSettings>, invalidMessage: string): Promise<boolean>;
}

function NumberField({ id, label, field, scale = 1, value, error, onApply }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value / scale));
  const { min, max } = AI_LIMITS[field];
  return (
    <div className="settings-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min / scale}
        max={max / scale}
        value={draft}
        aria-invalid={!!error}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() =>
          void onApply(
            field,
            // An empty box is invalid, not 0.
            { [field]: draft.trim() === '' ? NaN : Number(draft) * scale },
            t('settings.invalidNumber', { min: min / scale, max: max / scale }),
          )
        }
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
