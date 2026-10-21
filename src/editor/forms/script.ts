import { validationMessageKeys } from '../../core/forms/catalog.ts';
import type { SiteScripts } from '../../core/ports/site-scripts.ts';
import { LOCALES, type MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';
import { formsRuntimeSource } from './runtime.ts';
import { lottieScript, motionScript } from '../motion/script.ts';
import { widgetsScript } from '../widgets/script.ts';
import { appRuntimeScript, checkAppSyntax } from '../app-runtime/script.ts';

const messages = Object.fromEntries(LOCALES.map(locale => [locale, Object.fromEntries(Object.entries(validationMessageKeys).map(([code, key]) => [code, translate(locale, key as MessageId)]))]));
export const siteScripts: SiteScripts = { forms: () => formsRuntimeSource(messages), motion: motionScript, lottie: lottieScript, widgets: widgetsScript, app: appRuntimeScript, checkSyntax: checkAppSyntax };
