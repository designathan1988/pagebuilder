import { createFormsEngine, type FormsEngine } from '../../core/forms/engine.ts';
import type { FieldConfig, FormConfig, RuleCode, ValidationRules, Violation } from '../../core/forms/types.ts';

/** The same runtime is installed in an exported document and in its live preview. */
export function installFormsRuntime(target: Document, engine: FormsEngine, defaults: Readonly<Record<string, Partial<Record<RuleCode, string>>>> = {}): () => void {
  type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const disposers: (() => void)[] = [];
  const pending = new Set<AbortController>();
  const fieldStates = new Map<Control, { config: FieldConfig; touched: boolean; composing: boolean; error: HTMLElement; created: boolean; describedBy: string | null; invalid: string | null; validity: string; lookup: AbortController | null }>();
  let serial = 0;
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  function configuration(text: string, form: boolean): FieldConfig | FormConfig | null {
    try {
      if (text.length > 100000) return null;
      const value: unknown = JSON.parse(text);
      if (!record(value)) return null;
      if (form) {
        if (!['native', 'endpoint', 'email-service', 'webhook'].includes(String(value.destination))) return null;
        for (const key of ['endpoint', 'successId', 'errorId', 'honeypot', 'redirect']) if (value[key] !== undefined && typeof value[key] !== 'string') return null;
        if (value.method !== undefined && !['GET', 'POST'].includes(String(value.method))) return null;
        if (value.encoding !== undefined && !['form', 'json'].includes(String(value.encoding))) return null;
        if (value.destination !== 'native' && !value.endpoint) return null;
      } else {
        if (value.when !== undefined && !['input', 'blur', 'submit'].includes(String(value.when))) return null;
        if (value.errorId !== undefined && typeof value.errorId !== 'string') return null;
        if (value.mask !== undefined) {
          if (!record(value.mask) || !['none', 'fixed', 'dynamic', 'number', 'currency', 'percent', 'date', 'time', 'regex', 'uppercase', 'lowercase', 'custom', 'preset'].includes(String(value.mask.kind))) return null;
          engine.mask('', value.mask as unknown as NonNullable<FieldConfig['mask']>);
        }
        if (value.rules !== undefined) {
          if (!record(value.rules)) return null;
          for (const key of ['minimum', 'maximum', 'step', 'minLength', 'maxLength']) if (value.rules[key] !== undefined && (typeof value.rules[key] !== 'number' || !Number.isFinite(value.rules[key]))) return null;
          for (const key of ['pattern', 'type', 'equalTo', 'dateMinimum', 'dateMaximum']) if (value.rules[key] !== undefined && typeof value.rules[key] !== 'string') return null;
          if (value.rules.allowed !== undefined && (!Array.isArray(value.rules.allowed) || value.rules.allowed.some((one) => typeof one !== 'string'))) return null;
          if (value.rules.password !== undefined && !record(value.rules.password)) return null;
          if (value.rules.file !== undefined) {
            if (!record(value.rules.file)) return null;
            const accept = value.rules.file.accept;
            if (accept !== undefined && (!Array.isArray(accept) || accept.some((one) => typeof one !== 'string'))) return null;
          }
        }
        if (value.messages !== undefined && (!record(value.messages) || Object.values(value.messages).some((messages) => !record(messages) || Object.values(messages).some((one) => typeof one !== 'string')))) return null;
        if (value.address !== undefined && (!record(value.address) || typeof value.address.endpoint !== 'string' || !record(value.address.fields) || Object.values(value.address.fields).some((one) => typeof one !== 'string'))) return null;
      }
      return value as unknown as FieldConfig | FormConfig;
    } catch { return null; }
  }
  const listen = (node: EventTarget, type: string, listener: EventListener) => {
    node.addEventListener(type, listener);
    disposers.push(() => node.removeEventListener(type, listener));
  };
  const safeAddress = (value: string): string => {
    const parsed = new URL(value, target.baseURI);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid form destination');
    return parsed.href;
  };
  const controls = (form: HTMLFormElement): Control[] => [...form.elements].filter((element): element is Control => ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
  const locale = () => target.documentElement.lang || 'en';
  const nativeRules = (field: Control): ValidationRules => {
    const number = (name: string) => {
      const value = field.getAttribute(name);
      return value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined;
    };
    const minimum = number('min'), maximum = number('max'), minLength = number('minlength'), maxLength = number('maxlength'), step = number('step');
    const type = field.getAttribute('type');
    const pattern = field.getAttribute('pattern');
    return {
      required: field.required,
      ...(type === 'email' || type === 'url' || type === 'number' ? { type } : {}),
      ...(pattern ? { pattern } : {}),
      ...(minimum !== undefined ? { minimum } : {}), ...(maximum !== undefined ? { maximum } : {}),
      ...(minLength !== undefined ? { minLength } : {}), ...(maxLength !== undefined ? { maxLength } : {}), ...(step !== undefined ? { step } : {}),
    };
  };
  const values = (form: HTMLFormElement | null) => Object.fromEntries((form ? controls(form) : []).filter((field) => field.name).map((field) => [field.name, field.value]));
  const messageFor = (config: FieldConfig, code: RuleCode, fallback: string): string => {
    const messages = config.messages?.[locale()] ?? config.messages?.[locale().split('-')[0] ?? ''] ?? config.messages?.en;
    return messages?.[code] ?? defaults[locale()]?.[code] ?? defaults[locale().split('-')[0] ?? '']?.[code] ?? defaults.en?.[code] ?? fallback;
  };
  function validate(field: Control): boolean {
    const state = fieldStates.get(field);
    if (!state || !field.willValidate) return true;
    field.setCustomValidity('');
    const files = 'files' in field && field.files ? [...field.files] : [];
    const config = { ...state.config, rules: { ...nativeRules(field), ...state.config.rules } };
    const failures: Violation[] = engine.validate(field.value, config, { fields: values(field.form), files, locale: locale(), numeric: field.getAttribute('type') === 'number' });
    const native = field.validity;
    const kinds: readonly [keyof ValidityState, RuleCode][] = [['valueMissing', 'required'], ['typeMismatch', 'type'], ['patternMismatch', 'pattern'], ['tooShort', 'tooShort'], ['tooLong', 'tooLong'], ['rangeUnderflow', 'minimum'], ['rangeOverflow', 'maximum'], ['stepMismatch', 'step'], ['badInput', 'type']];
    const nativeFailure = kinds.find(([name]) => native[name]);
    if (nativeFailure) failures.unshift({ code: nativeFailure[1], message: messageFor(config, nativeFailure[1], field.validationMessage) });
    const failure = failures[0];
    const text = failure ? messageFor(config, failure.code, failure.message) : '';
    field.setCustomValidity(text);
    field.setAttribute('aria-invalid', String(!!failure));
    field.setAttribute('data-form-state', failure ? 'invalid' : 'valid');
    state.error.textContent = text;
    state.error.hidden = !failure;
    return !failure;
  }
  function applyMask(field: Control): void {
    const state = fieldStates.get(field);
    if (!state?.config.mask || state.composing || field.tagName === 'SELECT' || field.getAttribute('type') === 'file') return;
    const input = field as HTMLInputElement | HTMLTextAreaElement;
    const original = input.value;
    const caret = input.selectionStart;
    try {
      const numeric = ['number', 'currency', 'percent'].includes(state.config.mask.kind) || (state.config.mask.kind === 'preset' && ['currency', 'measurement'].includes(state.config.mask.preset ?? ''));
      // Count mask data, not currency symbols or unit labels. Numeric raw text also retains the decimal
      // separator, so typing a decimal does not put the caret back before it after formatting.
      const size = (text: string): number => {
        const raw = engine.mask(text, state.config.mask, locale()).raw;
        return numeric ? raw.length : raw.replace(/[^\p{L}\p{N}]/gu, '').length;
      };
      const meaningfulBefore = caret === null ? null : size(original.slice(0, caret));
      const result = engine.mask(original, state.config.mask, locale());
      if (result.formatted === original) return;
      input.value = result.formatted;
      if (meaningfulBefore !== null) {
        let position = 0;
        while (position < result.formatted.length && size(result.formatted.slice(0, position)) < meaningfulBefore) position++;
        try {
          input.setSelectionRange(position, position);
        } catch { /* Native number/date inputs do not expose a text selection. */ }
      }
    } catch {
      state.touched = true;
      validate(field);
    }
  }
  async function lookup(field: Control): Promise<void> {
    const state = fieldStates.get(field), config = state?.config.address;
    if (!state || !config || !engine.checkPreset('cep', field.value)) return;
    state.lookup?.abort();
    const controller = new AbortController();
    state.lookup = controller;
    pending.add(controller);
    const original = field.value;
    const form = field.form;
    const before = values(form);
    try {
      const response = await fetch(safeAddress(config.endpoint.replace('{cep}', field.value.replace(/\D/g, ''))), { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`Address lookup: ${response.status}`);
      const result: unknown = await response.json();
      if (controller.signal.aborted || original !== field.value || !result || typeof result !== 'object') return;
      if ('erro' in result && result.erro) throw new Error('Address not found');
      for (const [key, name] of Object.entries(config.fields)) {
        const value = (result as Record<string, unknown>)[key];
        const destination = form ? controls(form).find((one) => one.name === name) : undefined;
        if (destination && !destination.disabled && destination.value === before[name] && typeof value === 'string') {
          destination.value = value;
          destination.dispatchEvent(new Event('input', { bubbles: true }));
          destination.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      field.dispatchEvent(new CustomEvent('forms:address', { bubbles: true, detail: { found: true } }));
    } catch (error) {
      if (!controller.signal.aborted) field.dispatchEvent(new CustomEvent('forms:address', { bubbles: true, detail: { found: false, reason: String(error) } }));
    } finally { pending.delete(controller); }
  }
  const configured = target.querySelectorAll<Control>('[data-form-field]');
  for (const field of configured) {
    const parsed = configuration(field.getAttribute('data-form-field') ?? '{}', false);
    if (!parsed) {
      field.setCustomValidity(field.getAttribute('data-form-configuration-error') || messageFor({}, 'configuration', 'Invalid form configuration'));
      continue;
    }
    const config = parsed as FieldConfig;
    const previous = config.errorId ? target.getElementById(config.errorId) : null;
    const error = previous ?? target.createElement('span');
    if (!error.id) {
      do {
        error.id = `form-error-${++serial}`;
      } while (target.getElementById(error.id));
    }
    const describedBy = field.getAttribute('aria-describedby');
    const tokens = new Set((describedBy ?? '').split(/\s+/).filter(Boolean));
    tokens.add(error.id);
    field.setAttribute('aria-describedby', [...tokens].join(' '));
    error.setAttribute('aria-live', 'polite');
    error.hidden = true;
    if (!previous) field.insertAdjacentElement('afterend', error);
    fieldStates.set(field, { config, touched: false, composing: false, error, created: !previous, describedBy, invalid: field.getAttribute('aria-invalid'), validity: field.validationMessage, lookup: null });
    applyMask(field);
    listen(field, 'compositionstart', () => {
      const state = fieldStates.get(field);
      if (state) state.composing = true;
    });
    listen(field, 'compositionend', () => {
      const state = fieldStates.get(field);
      if (state) state.composing = false;
      applyMask(field);
      if (config.when === 'input') validate(field);
    });
    listen(field, 'input', () => {
      const state = fieldStates.get(field);
      if (!state || state.composing) return;
      applyMask(field);
      if (config.when === 'input' || state.touched && config.when !== 'submit') validate(field);
      if (field.form) for (const other of controls(field.form)) {
        const related = fieldStates.get(other);
        if (related?.config.rules?.equalTo === field.name && related.touched) validate(other);
      }
    });
    listen(field, 'blur', () => {
      const state = fieldStates.get(field);
      if (state) state.touched = true;
      if (config.when !== 'submit') validate(field);
      void lookup(field);
    });
  }
  const forms = new Set<HTMLFormElement>([...target.querySelectorAll<HTMLFormElement>('form[data-form-submit]'), ...[...configured].flatMap((field) => field.form ? [field.form] : [])]);
  for (const form of forms) {
    const parsed = configuration(form.getAttribute('data-form-submit') ?? '{"destination":"native"}', true);
    if (!parsed) {
      listen(form, 'submit', (event) => {
        event.preventDefault();
        form.dispatchEvent(new CustomEvent('forms:error', { bubbles: true }));
      });
      continue;
    }
    const config = parsed as FormConfig;
    const noValidate = form.noValidate;
    form.noValidate = true;
    disposers.push(() => {
      form.noValidate = noValidate;
    });
    let submitting = false;
    const show = (success: boolean) => {
      if (config.successId) {
        const element = target.getElementById(config.successId);
        if (element) {
          element.hidden = !success;
          element.setAttribute('role', 'status');
        }
      }
      if (config.errorId) {
        const element = target.getElementById(config.errorId);
        if (element) {
          element.hidden = success;
          element.setAttribute('role', 'alert');
        }
      }
      form.dispatchEvent(new CustomEvent(success ? 'forms:success' : 'forms:error', { bubbles: true }));
    };
    for (const id of [config.successId, config.errorId]) {
      const element = id ? target.getElementById(id) : null;
      if (element) element.hidden = true;
    }
    if (config.honeypot && !controls(form).some((one) => one.name === config.honeypot)) {
      const honeypot = target.createElement('input');
      honeypot.type = 'text';
      honeypot.name = config.honeypot;
      honeypot.tabIndex = -1;
      honeypot.autocomplete = 'off';
      honeypot.hidden = true;
      honeypot.setAttribute('aria-hidden', 'true');
      form.append(honeypot);
      const created = honeypot;
      disposers.push(() => created.remove());
    }
    listen(form, 'formdata', ((event: FormDataEvent) => {
      const data = event.formData;
      const queues = new Map<string, { formatted: string; raw: string }[]>();
      for (const field of controls(form)) {
        const state = fieldStates.get(field);
        if (!state?.config.mask || state.config.mask.submit !== 'raw' || !field.name || field.disabled || field.getAttribute('type') === 'file') continue;
        if ('checked' in field && ['checkbox', 'radio'].includes(field.type) && !field.checked) continue;
        const queue = queues.get(field.name) ?? [];
        queue.push({ formatted: field.value, raw: engine.mask(field.value, state.config.mask, locale()).raw });
        queues.set(field.name, queue);
      }
      for (const [name, queue] of queues) {
        const entries = data.getAll(name);
        data.delete(name);
        for (const entry of entries) {
          const index = typeof entry === 'string' ? queue.findIndex((one) => one.formatted === entry) : -1;
          const replacement = index >= 0 ? queue.splice(index, 1)[0]?.raw : undefined;
          data.append(name, replacement ?? entry);
        }
      }
    }) as EventListener);
    listen(form, 'reset', () => {
      for (const field of controls(form)) {
        const state = fieldStates.get(field);
        if (!state) continue;
        state.touched = false;
        state.error.hidden = true;
        state.error.textContent = '';
        field.setCustomValidity('');
        field.removeAttribute('aria-invalid');
        field.removeAttribute('data-form-state');
      }
    });
    listen(form, 'submit', ((event: SubmitEvent) => {
      if (submitting) {
        event.preventDefault();
        return;
      }
      const submitter = event.submitter as HTMLButtonElement | HTMLInputElement | null;
      if (!submitter?.formNoValidate) {
        let first: Control | undefined;
        for (const field of controls(form)) {
          const state = fieldStates.get(field);
          if (state) state.touched = true;
          const valid = state ? validate(field) : field.checkValidity();
          if (!valid && !first) first = field;
        }
        if (first) {
          event.preventDefault();
          first.focus();
          return;
        }
      }
      if (config.honeypot && controls(form).some((field) => field.name === config.honeypot && field.value)) {
        event.preventDefault();
        show(true);
        return;
      }
      if (config.destination === 'native') return;
      event.preventDefault();
      submitting = true;
      form.setAttribute('aria-busy', 'true');
      const controller = new AbortController();
      pending.add(controller);
      const buttons = [...form.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button[type="submit"], button:not([type]), input[type="submit"]')].map((button) => ({ button, disabled: button.disabled }));
      // FormData captures the submitter before controls are disabled.
      const data = new FormData(form, submitter);
      for (const { button } of buttons) button.disabled = true;
      void (async () => {
        try {
          const endpoint = safeAddress(config.endpoint || form.action);
          const method = config.method ?? (form.method.toUpperCase() === 'GET' ? 'GET' : 'POST');
          const url = new URL(endpoint);
          const init: RequestInit = { method, signal: controller.signal, credentials: 'omit' };
          if (method === 'GET') {
            for (const [name, value] of data) url.searchParams.append(name, typeof value === 'string' ? value : value.name);
          }
          else if (config.encoding === 'json') {
            const payload = Object.create(null) as Record<string, string | string[]>;
            for (const [name, value] of data) {
              if (typeof value !== 'string') throw new Error('JSON submission does not support files; select multipart form encoding');
              const previous = payload[name];
              payload[name] = previous === undefined ? value : Array.isArray(previous) ? [...previous, value] : [previous, value];
            }
            init.headers = { 'Content-Type': 'application/json' };
            init.body = JSON.stringify(payload);
          } else init.body = data;
          const response = await fetch(url.href, init);
          if (!response.ok) throw new Error(`Form submission: ${response.status}`);
          if (controller.signal.aborted) return;
          show(true);
          if (config.redirect) target.defaultView?.location.assign(safeAddress(config.redirect));
        } catch { if (!controller.signal.aborted) show(false); }
        finally { pending.delete(controller);
          submitting = false;
          form.removeAttribute('aria-busy');
          for (const { button, disabled } of buttons) button.disabled = disabled;
        }
      })();
    }) as EventListener);
  }
  return () => {
    for (const controller of pending) controller.abort();
    for (const dispose of disposers) dispose();
    for (const [field, state] of fieldStates) {
      state.lookup?.abort();
      if (state.created) state.error.remove();
      if (state.describedBy === null) field.removeAttribute('aria-describedby');
      else field.setAttribute('aria-describedby', state.describedBy);
      if (state.invalid === null) field.removeAttribute('aria-invalid');
      else field.setAttribute('aria-invalid', state.invalid);
      field.setCustomValidity('');
      field.removeAttribute('data-form-state');
    }
    fieldStates.clear();
  };
}

export function formsRuntimeSource(defaults: Readonly<Record<string, Partial<Record<RuleCode, string>>>> = {}): string {
  return `(${installFormsRuntime.toString()})(document, (${createFormsEngine.toString()})(Date.now), ${JSON.stringify(defaults).replaceAll('<', '\\u003c')});\n`;
}
