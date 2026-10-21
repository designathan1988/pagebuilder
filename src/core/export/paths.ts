// The paths the export writes the site's generated files at (specs export-bem-css, export-events-js, export-motion-js):
// one list, read by the export that writes them (export.ts) and by the project's file tree that keeps them free
// (core/files/files.ts). The audit's AUD-11: the tree reserved three of the five, so a file stored at js/motion.js or
// js/lottie.min.js went into the archive twice, beside the script the export wrote there.
export const STYLESHEET = 'css/styles.css';
// the site's interactions script (spec export-events-js): written when the project holds interactions, linked with
// <script defer> from every page that uses them
export const INTERACTIONS_SCRIPT = 'js/interactions.js';
export const FORMS_SCRIPT = 'js/forms.js';
// the motion script and the Lottie player, at the paths the pages link them by (spec export-motion-js)
export const MOTION_SCRIPT = 'js/motion.js';
export const LOTTIE_SCRIPT = 'js/lottie.min.js';
// the web components' script (carousel, lightbox, tabs, cart…): written when a page holds one (data-wc)
export const WIDGETS_SCRIPT = 'js/widgets.js';

// the application's script and the folder of its modules (spec app-logic, core/logic/compile.ts): the runtime, the
// project's scripts and code components
export const APP_MAIN_SCRIPT = 'js/app-layer/main.js';
export const APP_MODULES_FOLDER = 'js/app-layer';
export const APP_RUNTIME_SCRIPT = `${APP_MODULES_FOLDER}/runtime.js`;
// the classic script every page with an application links: it writes the import map and starts main.js, from the
// modules' files when served, from their text when opened from disk (app-start.ts)
export const APP_START_SCRIPT = `${APP_MODULES_FOLDER}/start.js`;
// every path the export may write a generated file at: no stored file may take one
export const GENERATED_PATHS: readonly string[] = [STYLESHEET, INTERACTIONS_SCRIPT, FORMS_SCRIPT, MOTION_SCRIPT, LOTTIE_SCRIPT, WIDGETS_SCRIPT, APP_START_SCRIPT, APP_MAIN_SCRIPT, APP_RUNTIME_SCRIPT];
// the folders whose every path the export writes (a stored file may take none of them)
export const GENERATED_FOLDERS: readonly string[] = [APP_MODULES_FOLDER];
