/* global process, console */
// Junta auditoria/<registro>/*.md em auditoria/<registro>.md, ordenado pelo nome da área.
// Uso: node tools/audit/juntar.mjs <registro>
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const TITULOS = {
  estado: 'Estado',
  entradas: 'Entradas',
  requisitos: 'Requisitos',
  matriz: 'Matriz',
};

const registro = process.argv[2];
if (!registro || !TITULOS[registro]) {
  console.error(`uso: node tools/audit/juntar.mjs <${Object.keys(TITULOS).join('|')}>`);
  process.exit(1);
}
const dir = path.join(ROOT, 'auditoria', registro);
if (!fs.existsSync(dir)) {
  console.error(`auditoria/${registro}/ não existe: nada a juntar.`);
  process.exit(1);
}
// Os arquivos de processo e de procedimento da pasta do registro descrevem o trabalho; não são itens do registro.
const files = fs.readdirSync(dir).filter((e) => e.endsWith('.md') && !e.startsWith('PROCEDIMENTO')).sort();
let out = `# ${TITULOS[registro]}\n\n`;
for (const f of files) {
  out += fs.readFileSync(path.join(dir, f), 'utf8').trimEnd() + '\n\n';
}
fs.writeFileSync(path.join(ROOT, 'auditoria', `${registro}.md`), out.trimEnd() + '\n');
console.log(`${registro}.md: ${files.length} áreas, ${out.split('\n').length} linhas`);
