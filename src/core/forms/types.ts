export type Preset = 'cpf' | 'cnpj' | 'cpf-cnpj' | 'cep' | 'phone-br' | 'phone-international' | 'rg' | 'pis' | 'voter' | 'plate' | 'card' | 'expiry' | 'cvv' | 'email' | 'url' | 'date-br' | 'time' | 'currency' | 'measurement';
export interface MaskConfig {
  readonly kind: 'none' | 'fixed' | 'dynamic' | 'number' | 'currency' | 'percent' | 'date' | 'time' | 'regex' | 'uppercase' | 'lowercase' | 'custom' | 'preset';
  readonly preset?: Preset;
  /** 0 = digit, A = letter, * = alphanumeric; [] optional, {n,m} repetition, \\ escape. */
  readonly pattern?: string;
  readonly alternatives?: readonly { readonly pattern: string; readonly maxLength: number }[];
  readonly blocks?: Readonly<Record<string, string>>;
  readonly locale?: string;
  readonly currency?: string;
  readonly precision?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly negative?: boolean;
  readonly format?: string;
  readonly autocorrect?: boolean;
  readonly suffix?: string;
  readonly submit?: 'raw' | 'formatted';
}
export type RuleCode = 'required' | 'type' | 'pattern' | 'tooShort' | 'tooLong' | 'minimum' | 'maximum' | 'step' | 'preset' | 'equalTo' | 'password' | 'allowed' | 'dateMinimum' | 'dateMaximum' | 'fileType' | 'fileSize' | 'configuration';
export interface ValidationRules {
  readonly required?: boolean;
  readonly type?: 'email' | 'url' | 'number';
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
  readonly equalTo?: string;
  readonly password?: { readonly minLength: number; readonly uppercase?: boolean; readonly lowercase?: boolean; readonly digit?: boolean; readonly symbol?: boolean };
  readonly allowed?: readonly string[];
  readonly dateMinimum?: string;
  readonly dateMaximum?: string;
  readonly file?: { readonly accept?: readonly string[]; readonly maxBytes?: number; readonly maxTotalBytes?: number };
}
export interface FieldConfig {
  readonly mask?: MaskConfig;
  readonly rules?: ValidationRules;
  readonly when?: 'input' | 'blur' | 'submit';
  readonly messages?: Readonly<Record<string, Partial<Record<RuleCode, string>>>>;
  /** Existing editable document element id; runtime creates a message only when absent. */
  readonly errorId?: string;
  /** Opt-in lookup; address keys map to form field names. No credentials are stored. */
  readonly address?: { readonly endpoint: string; readonly fields: Readonly<Record<string, string>> };
}
export interface FormConfig {
  readonly destination: 'native' | 'endpoint' | 'email-service' | 'webhook';
  readonly endpoint?: string;
  readonly method?: 'GET' | 'POST';
  readonly encoding?: 'form' | 'json';
  readonly successId?: string;
  readonly errorId?: string;
  readonly honeypot?: string;
  readonly redirect?: string;
}
export interface MaskResult { readonly formatted: string; readonly raw: string; readonly complete: boolean; readonly valid: boolean; readonly brand?: string }
export interface ValidationContext {
  readonly fields?: Readonly<Record<string, string>>;
  readonly files?: readonly { readonly name: string; readonly type: string; readonly size: number }[];
  readonly today?: string;
  readonly locale?: string;
  // the value is a number as HTML writes it (an input of type number: "6.5" whatever the page's language)
  readonly numeric?: boolean;
}
export interface Violation { readonly code: RuleCode; readonly message: string }
